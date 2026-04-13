"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Instagram, Facebook, AtSign, CheckSquare, Square,
  Loader2, AlertCircle, Link2,
} from "lucide-react";

interface DiscoveredAccount {
  platform: string;
  userId: string;
  label: string;
}

const PLATFORM_ICONS: Record<string, { icon: typeof Instagram; color: string }> = {
  Instagram: { icon: Instagram, color: "text-pink-400" },
  Facebook: { icon: Facebook, color: "text-blue-500" },
  Threads: { icon: AtSign, color: "text-gray-300" },
};

export default function SelectAccountsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const clientId = searchParams.get("clientId") || "";
  const returnTo = searchParams.get("returnTo") || `/clients/${clientId}`;

  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([]);
  const [clientName, setClientName] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pending accounts from cookie via API
  useEffect(() => {
    async function loadAccounts() {
      try {
        // Fetch client name for display
        const clientRes = await fetch(`/api/clients/${clientId}`);
        const clientData = await clientRes.json();
        if (clientData.success) {
          setClientName(clientData.data.name);
        }

        // The accounts are stored in the cookie — we read them via a GET endpoint
        // But since they're httpOnly, we parse from the page's pending state
        // Actually, we need to read them server-side. Let's create a simple GET endpoint.
        const res = await fetch("/api/oauth/select-accounts/pending");
        const data = await res.json();

        if (!data.success) {
          setError(data.error || "No pending accounts found. Please try connecting again.");
          return;
        }

        setAccounts(data.accounts);
      } catch {
        setError("Failed to load accounts. Please try connecting again.");
      } finally {
        setLoading(false);
      }
    }

    if (clientId) loadAccounts();
  }, [clientId]);

  const toggleAccount = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedKeys.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/oauth/select-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedIds: Array.from(selectedKeys) }),
      });
      const data = await res.json();

      if (data.success) {
        const names = data.connected.join(", ");
        router.push(`${returnTo}?oauth_success=${encodeURIComponent(`Connected: ${names}`)}`);
      } else {
        setError(data.error || "Failed to save. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-bb-dim animate-spin" />
      </div>
    );
  }

  if (error && accounts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Connection Error</h1>
          <p className="text-sm text-bb-dim mb-6">{error}</p>
          <button
            onClick={() => router.push(returnTo)}
            className="px-6 py-2.5 bg-bb-elevated text-white rounded-lg hover:bg-bb-border transition-colors text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Group accounts by platform type
  const instagramAccounts = accounts.filter((a) => a.platform === "Instagram");
  const facebookAccounts = accounts.filter((a) => a.platform === "Facebook");
  const threadsAccounts = accounts.filter((a) => a.platform === "Threads");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
          <Link2 size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Select Accounts</h1>
        <p className="text-sm text-bb-dim">
          Choose which accounts to connect{clientName ? ` for ${clientName}` : ""}. You manage multiple accounts — pick the ones for this client.
        </p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Instagram Accounts */}
        {instagramAccounts.length > 0 && (
          <AccountGroup
            title="Instagram Business Accounts"
            subtitle="Select the Instagram account for this client"
            accounts={instagramAccounts}
            selectedKeys={selectedKeys}
            onToggle={toggleAccount}
          />
        )}

        {/* Facebook Pages */}
        {facebookAccounts.length > 0 && (
          <AccountGroup
            title="Facebook Pages"
            subtitle="Select the Facebook Page for this client"
            accounts={facebookAccounts}
            selectedKeys={selectedKeys}
            onToggle={toggleAccount}
          />
        )}

        {/* Threads */}
        {threadsAccounts.length > 0 && (
          <AccountGroup
            title="Threads"
            subtitle="Select the Threads account for this client"
            accounts={threadsAccounts}
            selectedKeys={selectedKeys}
            onToggle={toggleAccount}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-bb-border">
        <button
          onClick={() => router.push(returnTo)}
          className="px-5 py-2.5 text-sm text-bb-muted hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={selectedKeys.size === 0 || saving}
          className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
        >
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Connecting...</>
          ) : (
            <>Connect {selectedKeys.size} Account{selectedKeys.size !== 1 ? "s" : ""}</>
          )}
        </button>
      </div>
    </div>
  );
}

function AccountGroup({
  title,
  subtitle,
  accounts,
  selectedKeys,
  onToggle,
}: {
  title: string;
  subtitle: string;
  accounts: DiscoveredAccount[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-1">{title}</h2>
      <p className="text-xs text-bb-dim mb-3">{subtitle}</p>
      <div className="space-y-2">
        {accounts.map((account) => {
          const key = `${account.platform}:${account.userId}`;
          const isSelected = selectedKeys.has(key);
          const platformInfo = PLATFORM_ICONS[account.platform] || PLATFORM_ICONS.Instagram;
          const Icon = platformInfo.icon;

          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? "border-bb-orange bg-bb-orange/5 ring-1 ring-bb-orange/20"
                  : "border-bb-border bg-bb-surface hover:border-bb-muted"
              }`}
            >
              {/* Checkbox */}
              <div className="shrink-0">
                {isSelected ? (
                  <CheckSquare size={20} className="text-bb-orange" />
                ) : (
                  <Square size={20} className="text-bb-dim" />
                )}
              </div>

              {/* Platform icon */}
              <div className="w-10 h-10 rounded-lg bg-bb-elevated flex items-center justify-center border border-bb-border shrink-0">
                <Icon size={20} className={platformInfo.color} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{account.label}</p>
                <p className="text-xs text-bb-dim">{account.platform} &middot; ID: {account.userId}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
