"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Copy, Check, Link2 } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ClientCard from "@/components/clients/ClientCard";
import ClientForm from "@/components/clients/ClientForm";
import Modal from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/shared/Skeleton";
import { useToast } from "@/components/shared/Toast";

const TABS = [
  { key: "ACTIVE", label: "Active" },
  { key: "PROSPECT", label: "Prospects" },
  { key: "PAST", label: "Past" },
  { key: "ALL", label: "All" },
];

interface ClientData {
  id: string;
  name: string;
  company: string | null;
  tier: string;
  type: string;
  monthlyRetainer: string | number | null;
  contractEnd: string | null;
  phone: string | null;
  timezone: string | null;
  _count: { tasks: number };
}

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [activeTab, setActiveTab] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [onboardLink, setOnboardLink] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeTab !== "ALL") params.set("type", activeTab);
      if (search) params.set("search", search);
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      if (data.success) setClients(data.data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  async function handleAddClient(data: Record<string, unknown>) {
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setShowAddModal(false);
        fetchClients();
        // Show onboarding link if token was generated
        if (json.data?.onboardToken) {
          setOnboardLink({
            name: json.data.name,
            link: `${window.location.origin}/onboard/${json.data.onboardToken}`,
          });
        } else {
          toast("Client created", "success");
        }
      } else {
        const err = json;
        toast(err?.error || "Failed to create client", "error");
      }
    } catch {
      toast("Failed to create client", "error");
    }
  }

  async function handleArchive(id: string) {
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    fetchClients();
  }

  function handleCopyLink() {
    if (!onboardLink) return;
    navigator.clipboard.writeText(onboardLink.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <TopBar title="Clients" subtitle="Manage your client relationships" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Tabs + Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  activeTab === tab.key
                    ? "bg-bb-orange text-white"
                    : "text-bb-muted hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors shrink-0 w-full sm:w-auto justify-center sm:justify-start"
          >
            <Plus size={16} />
            Add Client
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
          />
        </div>

        {/* Client Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
          {loading ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />) : clients.map((client) => (
            <ClientCard
              key={client.id}
              id={client.id}
              name={client.name}
              company={client.company}
              tier={client.tier}
              type={client.type}
              monthlyRetainer={client.monthlyRetainer ? Number(client.monthlyRetainer) : null}
              contractEnd={client.contractEnd}
              openTaskCount={client._count.tasks}
              onArchive={handleArchive}
              phone={client.phone}
              timezone={client.timezone}
            />
          ))}
          {!loading && clients.length === 0 && (
            <div className="col-span-full text-center py-12 text-bb-dim">
              No clients found. Add your first client to get started.
            </div>
          )}
        </div>
      </div>

      {/* Add Client Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Client">
        <ClientForm onSubmit={handleAddClient} onCancel={() => setShowAddModal(false)} />
      </Modal>

      {/* Onboarding Link Modal */}
      <Modal
        open={!!onboardLink}
        onClose={() => { setOnboardLink(null); setCopied(false); }}
        title="Client Created"
      >
        {onboardLink && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <Check size={20} />
              <span className="text-sm font-medium">{onboardLink.name} has been added</span>
            </div>

            <div className="bg-bb-black border border-bb-orange/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-bb-orange" />
                <h3 className="text-sm font-semibold text-white">Onboarding Link</h3>
              </div>
              <p className="text-xs text-bb-dim">
                This link is auto-sent once payment and contract are confirmed. You can also share it early if needed.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-bb-surface px-3 py-2 rounded border border-bb-border text-bb-muted truncate">
                  {onboardLink.link}
                </code>
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded bg-bb-orange hover:bg-bb-orange-light text-white transition-colors shrink-0"
                  title="Copy link"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              {copied && (
                <p className="text-xs text-green-400">Copied to clipboard!</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setOnboardLink(null); setCopied(false); }}
                className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
