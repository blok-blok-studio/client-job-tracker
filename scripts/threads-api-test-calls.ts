import path from "node:path";
import { config as loadEnv } from "dotenv";

// Meta App Review wants at least one API call per requested permission before it
// will accept a submission. Makes the two Threads ones with the stored token:
//
//   threads_basic            GET  /me                  read-only
//   threads_content_publish  POST /{user-id}/threads   creates a CONTAINER only
//
// A container is a draft. Nothing is public until /threads_publish is called on
// it, which this script never does; unpublished containers expire on their own.
// The token is never printed.

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const CLIENT_ID = "cmndjrsuz00009feco87nelbe"; // Chase Haynes
const CREDENTIAL_ID = "cmu5hwa7h0iyf8bd6pzgpyd3p"; // @itschasehaynes on Threads
const API = "https://graph.threads.net/v1.0";

async function main() {
  const { resolveCredentialForPost } = await import("../src/lib/social/publisher");
  const cred = await resolveCredentialForPost({
    clientId: CLIENT_ID,
    credentialId: CREDENTIAL_ID,
    platform: "THREADS",
  } as never);

  const userId = cred.username;
  const token = cred.password;

  const me = await fetch(`${API}/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  const meJson = (await me.json()) as { id?: string; username?: string; error?: { message?: string } };
  console.log(`threads_basic            HTTP ${me.status}  ${meJson.username ? "@" + meJson.username : meJson.error?.message}`);

  const body = new URLSearchParams({
    media_type: "TEXT",
    text: "API test container - never published",
    access_token: token,
  });
  const container = await fetch(`${API}/${userId}/threads`, { method: "POST", body });
  const cJson = (await container.json()) as { id?: string; error?: { message?: string } };
  console.log(`threads_content_publish  HTTP ${container.status}  ${cJson.id ? "container " + cJson.id + " (unpublished)" : cJson.error?.message}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
