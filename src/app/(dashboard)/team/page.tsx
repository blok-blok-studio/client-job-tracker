"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Shield, User as UserIcon, Trash2, KeyRound, Power, AtSign } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import { ListSkeleton } from "@/components/shared/Skeleton";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "MEMBER";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  slackUserId?: string | null;
}

export default function TeamPage() {
  const { toast } = useToast();
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER" });
  const [saving, setSaving] = useState(false);

  const [resetFor, setResetFor] = useState<TeamUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [slackFor, setSlackFor] = useState<TeamUser | null>(null);
  const [slackId, setSlackId] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      setMe(meData.user || null);
      if (!meData.user || meData.user.role !== "OWNER") {
        setForbidden(true);
        return;
      }
      const res = await fetch("/api/users");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast("Failed to load team", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to add member", "error");
        return;
      }
      toast("Team member added", "success");
      setAddOpen(false);
      setForm({ name: "", email: "", password: "", role: "MEMBER" });
      load();
    } catch {
      toast("Failed to add member", "error");
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(user: TeamUser, body: Record<string, unknown>, successMsg: string) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Update failed", "error");
      return false;
    }
    toast(successMsg, "success");
    load();
    return true;
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    setSaving(true);
    const ok = await patchUser(resetFor, { password: newPassword }, "Password updated");
    setSaving(false);
    if (ok) {
      setResetFor(null);
      setNewPassword("");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to remove member", "error");
        return;
      }
      toast("Team member removed", "success");
      setDeleteTarget(null);
      load();
    } catch {
      toast("Failed to remove member", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (forbidden) {
    return (
      <>
        <TopBar title="Team" subtitle="Manage dashboard access" />
        <div className="px-4 lg:px-6 py-12 text-center">
          <Shield size={40} className="mx-auto text-bb-dim mb-3" />
          <p className="text-bb-muted">Only owners can manage team members.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Team" subtitle="Manage who can access the command center" />

      <div className="px-4 lg:px-6 py-4 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus size={16} /> Add member
          </button>
        </div>

        {loading ? (
          <ListSkeleton />
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isSelf = me?.id === u.id;
              return (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 px-4 py-3 bg-bb-surface border border-bb-border rounded-lg ${
                    !u.isActive ? "opacity-60" : ""
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-bb-elevated flex items-center justify-center shrink-0">
                    {u.role === "OWNER" ? (
                      <Shield size={16} className="text-bb-orange" />
                    ) : (
                      <UserIcon size={16} className="text-bb-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{u.name}</span>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-bb-elevated text-bb-muted">
                        {u.role}
                      </span>
                      {isSelf && <span className="text-[10px] text-bb-dim">you</span>}
                      {!u.isActive && (
                        <span className="text-[10px] text-red-400">disabled</span>
                      )}
                    </div>
                    <div className="text-xs text-bb-dim truncate">
                      {u.email}
                      {u.lastLoginAt
                        ? ` · last login ${new Date(u.lastLoginAt).toLocaleDateString()}`
                        : " · never signed in"}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={u.role}
                      disabled={isSelf}
                      onChange={(e) =>
                        patchUser(u, { role: e.target.value }, "Role updated")
                      }
                      className="text-xs bg-bb-elevated border border-bb-border rounded-md px-2 py-1.5 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isSelf ? "You cannot change your own role" : "Change role"}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="OWNER">Owner</option>
                    </select>

                    <button
                      onClick={() => {
                        setSlackFor(u);
                        setSlackId(u.slackUserId || "");
                      }}
                      className={`p-2 rounded-md hover:bg-bb-elevated transition-colors ${
                        u.slackUserId ? "text-bb-orange hover:text-bb-orange-light" : "text-bb-muted hover:text-white"
                      }`}
                      title={u.slackUserId ? `Slack: ${u.slackUserId}` : "Link Slack account for @-mentions"}
                    >
                      <AtSign size={15} />
                    </button>

                    <button
                      onClick={() => {
                        setResetFor(u);
                        setNewPassword("");
                      }}
                      className="p-2 rounded-md text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors"
                      title="Reset password"
                    >
                      <KeyRound size={15} />
                    </button>

                    <button
                      onClick={() =>
                        patchUser(
                          u,
                          { isActive: !u.isActive },
                          u.isActive ? "Member disabled" : "Member enabled"
                        )
                      }
                      disabled={isSelf}
                      className="p-2 rounded-md text-bb-muted hover:text-white hover:bg-bb-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isSelf ? "You cannot disable yourself" : u.isActive ? "Disable access" : "Enable access"}
                    >
                      <Power size={15} />
                    </button>

                    <button
                      onClick={() => setDeleteTarget(u)}
                      disabled={isSelf}
                      className="p-2 rounded-md text-bb-muted hover:text-red-400 hover:bg-bb-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={isSelf ? "You cannot remove yourself" : "Remove member"}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add member */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add team member">
        <form onSubmit={handleAdd} className="space-y-4">
          <input
            type="text"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange"
            required
          />
          <input
            type="text"
            placeholder="Temporary password (min 8 chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange font-mono"
            minLength={8}
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-bb-orange"
          >
            <option value="MEMBER">Member — full app access</option>
            <option value="OWNER">Owner — can also manage the team</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add member"}
          </button>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title={`Reset password — ${resetFor?.name || ""}`}>
        <form onSubmit={handleResetPassword} className="space-y-4">
          <input
            type="text"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange font-mono"
            minLength={8}
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Set new password"}
          </button>
        </form>
      </Modal>

      {/* Link Slack account */}
      <Modal open={!!slackFor} onClose={() => setSlackFor(null)} title={`Slack mentions — ${slackFor?.name || ""}`}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!slackFor) return;
            setSaving(true);
            const ok = await patchUser(slackFor, { slackUserId: slackId }, slackId ? "Slack account linked" : "Slack link removed");
            setSaving(false);
            if (ok) setSlackFor(null);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-bb-muted">
            Paste their Slack member ID so task alerts @-mention them. In Slack: click their
            profile → ⋯ → &quot;Copy member ID&quot;. Leave empty to unlink.
          </p>
          <input
            type="text"
            placeholder="U0123ABCDEF"
            value={slackId}
            onChange={(e) => setSlackId(e.target.value.trim())}
            className="w-full px-3 py-2 bg-bb-elevated border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange font-mono"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-bb-orange hover:bg-bb-orange-light text-white font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove team member"
        message={`Remove ${deleteTarget?.name || "this member"}? They will immediately lose the ability to sign in.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        loading={deleting}
      />
    </>
  );
}
