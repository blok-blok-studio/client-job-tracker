/**
 * Short-lived server-side holding area for Meta accounts discovered at login,
 * waiting for the team to pick which ones to connect.
 *
 * This used to live in a cookie, but a login that manages many Pages pushed
 * it past the browser's 4KB cookie limit and the browser silently dropped it
 * ("No pending accounts"). Now only a random id rides in the cookie; the
 * payload (which includes the access token) is encrypted in the Setting table
 * and expires after 10 minutes.
 */

import crypto from "crypto";
import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

export const PENDING_COOKIE = "oauth_pending_accounts";
const TTL_MS = 10 * 60 * 1000;

export interface PendingMetaAccounts {
  clientId: string;
  accessToken: string;
  expiresAt: string;
  accounts: { platform: string; userId: string; label: string; avatarUrl?: string }[];
}

const keyFor = (id: string) => `oauth_pending:${id}`;

export async function savePendingAccounts(data: PendingMetaAccounts): Promise<string> {
  const id = crypto.randomBytes(24).toString("base64url");
  const sealed = encrypt(JSON.stringify(data));
  await prisma.setting.create({
    data: {
      key: keyFor(id),
      value: { payload: sealed.encrypted, iv: sealed.iv, expiresAt: new Date(Date.now() + TTL_MS).toISOString() },
    },
  });
  // Opportunistic cleanup of abandoned selections
  await prisma.setting
    .deleteMany({ where: { key: { startsWith: "oauth_pending:" }, updatedAt: { lt: new Date(Date.now() - TTL_MS) } } })
    .catch(() => {});
  return id;
}

export async function loadPendingAccounts(id: string | undefined): Promise<PendingMetaAccounts | null> {
  if (!id || !/^[\w-]{20,64}$/.test(id)) return null;
  const row = await prisma.setting.findUnique({ where: { key: keyFor(id) } });
  if (!row) return null;
  const value = row.value as { payload: string; iv: string; expiresAt: string };
  if (new Date(value.expiresAt).getTime() < Date.now()) {
    await deletePendingAccounts(id);
    return null;
  }
  return JSON.parse(decrypt(value.payload, value.iv)) as PendingMetaAccounts;
}

export async function deletePendingAccounts(id: string | undefined): Promise<void> {
  if (!id) return;
  await prisma.setting.deleteMany({ where: { key: keyFor(id) } }).catch(() => {});
}
