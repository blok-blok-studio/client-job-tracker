"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ClientCard from "@/components/clients/ClientCard";
import ClientForm from "@/components/clients/ClientForm";
import Modal from "@/components/shared/Modal";
import { cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/shared/Skeleton";

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
  _count: { tasks: number };
}

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [activeTab, setActiveTab] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchClients = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeTab !== "ALL") params.set("type", activeTab);
    if (search) params.set("search", search);
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    if (data.success) setClients(data.data);
    setLoading(false);
  }, [activeTab, search]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  async function handleAddClient(data: Record<string, unknown>) {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowAddModal(false);
      fetchClients();
    }
  }

  async function handleArchive(id: string) {
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    fetchClients();
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
            />
          ))}
          {!loading && clients.length === 0 && (
            <div className="col-span-full text-center py-12 text-bb-dim">
              No clients found. Add your first client to get started.
            </div>
          )}
        </div>
      </div>

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Client">
        <ClientForm onSubmit={handleAddClient} onCancel={() => setShowAddModal(false)} />
      </Modal>
    </div>
  );
}
