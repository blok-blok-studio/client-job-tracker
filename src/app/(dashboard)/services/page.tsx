"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Trash2, Layers, Users, PauseCircle, Briefcase } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import ServiceForm, { type ServiceFormValues } from "@/components/services/ServiceForm";
import { SERVICE_CATEGORIES, serviceCategoryLabel } from "@/lib/service-catalog";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/shared/Toast";

interface ServiceRow {
  id: string;
  name: string;
  category: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
  client: { id: string; name: string; company: string | null; type: string; tier: string };
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

const STATUS_TABS = [
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
];

const statusVariant: Record<string, "green" | "yellow" | "blue" | "red" | "gray"> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  COMPLETED: "blue",
  CANCELLED: "red",
};

const tierVariant: Record<string, "orange" | "gray" | "blue"> = {
  VIP: "orange",
  STANDARD: "gray",
  TRIAL: "blue",
};

const categoryLabel = serviceCategoryLabel;

export default function ServicesPage() {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [statusTab, setStatusTab] = useState("ACTIVE");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"client" | "service">("client");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const { toast } = useToast();

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/services");
      const data = await res.json();
      if (data.success) setServices(data.data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => d.success && setClients(d.data.map((c: ClientOption & Record<string, unknown>) => ({ id: c.id, name: c.name, company: c.company }))))
      .catch(() => {});
  }, [fetchServices]);

  // ─── Filtering ───
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (statusTab !== "ALL" && s.status !== statusTab) return false;
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (q) {
        const hay = `${s.name} ${s.client.name} ${s.client.company || ""} ${categoryLabel(s.category) || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [services, statusTab, categoryFilter, search]);

  // Categories that actually appear in the data drive the filter chips
  const presentCategories = useMemo(() => {
    const ids = new Set(services.map((s) => s.category).filter(Boolean) as string[]);
    return SERVICE_CATEGORIES.filter((c) => ids.has(c.id));
  }, [services]);

  // ─── Summary ───
  const summary = useMemo(() => {
    const active = services.filter((s) => s.status === "ACTIVE");
    return {
      active: active.length,
      clientsCovered: new Set(active.map((s) => s.client.id)).size,
      distinct: new Set(active.map((s) => s.name.toLowerCase())).size,
      paused: services.filter((s) => s.status === "PAUSED").length,
    };
  }, [services]);

  // ─── Grouping ───
  const byClient = useMemo(() => {
    const map = new Map<string, { client: ServiceRow["client"]; items: ServiceRow[] }>();
    for (const s of filtered) {
      const entry = map.get(s.client.id) || { client: s.client, items: [] };
      entry.items.push(s);
      map.set(s.client.id, entry);
    }
    return [...map.values()].sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [filtered]);

  const byService = useMemo(() => {
    const map = new Map<string, { name: string; items: ServiceRow[] }>();
    for (const s of filtered) {
      const key = s.name.toLowerCase();
      const entry = map.get(key) || { name: s.name, items: [] };
      entry.items.push(s);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [filtered]);

  // ─── Mutations ───
  async function handleAdd(values: ServiceFormValues) {
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setShowAdd(false);
      toast("Service added", "success");
      fetchServices();
    } else {
      toast(json?.error || "Failed to add service", "error");
    }
  }

  async function handleEdit(values: ServiceFormValues) {
    if (!editing) return;
    const res = await fetch(`/api/services/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setEditing(null);
      toast("Service updated", "success");
      fetchServices();
    } else {
      toast(json?.error || "Failed to update service", "error");
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Remove "${editing.name}" from ${editing.client.name}?`)) return;
    try {
      const res = await fetch(`/api/services/${editing.id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast("Service removed", "success");
      } else {
        toast(json?.error || "Failed to remove service", "error");
      }
    } catch {
      toast("Failed to remove service", "error");
    }
    setEditing(null);
    fetchServices();
  }

  return (
    <div>
      <TopBar title="Services" subtitle="Which client is on what — at a glance" />
      <div className="px-4 lg:px-6 space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Active Services", value: summary.active, icon: Layers },
            { label: "Clients Covered", value: summary.clientsCovered, icon: Users },
            { label: "Services Offered", value: summary.distinct, icon: Briefcase },
            { label: "Paused", value: summary.paused, icon: PauseCircle },
          ].map((tile) => (
            <div key={tile.label} className="bg-bb-surface border border-bb-border rounded-lg p-4 flex items-center gap-3">
              <tile.icon size={18} className="text-bb-orange shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white truncate">{tile.value}</p>
                <p className="text-xs text-bb-dim truncate">{tile.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Status tabs + actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1 overflow-x-auto w-full sm:w-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                  statusTab === tab.key ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Group-by toggle */}
            <div className="flex gap-1 bg-bb-surface border border-bb-border rounded-lg p-1">
              {(["client", "service"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap capitalize",
                    groupBy === g ? "bg-bb-elevated text-white" : "text-bb-muted hover:text-white"
                  )}
                >
                  By {g}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors shrink-0 ml-auto sm:ml-0"
            >
              <Plus size={16} />
              Add Service
            </button>
          </div>
        </div>

        {/* Search + category filter */}
        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients or services..."
              className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-white placeholder:text-bb-dim text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
          {presentCategories.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setCategoryFilter("")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  !categoryFilter
                    ? "bg-bb-orange/15 border-bb-orange/40 text-bb-orange"
                    : "bg-bb-surface border-bb-border text-bb-muted hover:text-white"
                )}
              >
                All categories
              </button>
              {presentCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryFilter(categoryFilter === c.id ? "" : c.id)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-colors",
                    categoryFilter === c.id
                      ? "bg-bb-orange/15 border-bb-orange/40 text-bb-orange"
                      : "bg-bb-surface border-bb-border text-bb-muted hover:text-white"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-3 pb-8">
          {loading ? (
            <div className="text-center py-12 text-bb-dim">Loading services…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-bb-dim flex flex-col items-center gap-2">
              <Briefcase size={32} className="text-bb-dim/50" />
              <p>
                {services.length === 0
                  ? "No services yet. Add what each client is signed up for to see the overview."
                  : "Nothing matches these filters."}
              </p>
            </div>
          ) : groupBy === "client" ? (
            byClient.map(({ client, items }) => (
              <div key={client.id} className="bg-bb-surface border border-bb-border rounded-lg p-4">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Link href={`/clients/${client.id}`} className="text-sm font-semibold text-white hover:text-bb-orange transition-colors">
                    {client.name}
                  </Link>
                  {client.company && <span className="text-xs text-bb-dim">{client.company}</span>}
                  <Badge variant={tierVariant[client.tier] || "gray"}>{client.tier}</Badge>
                  {client.type !== "ACTIVE" && <Badge variant="gray">{client.type}</Badge>}
                  <span className="ml-auto text-xs text-bb-dim">
                    {items.length} service{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setEditing(s)}
                      className="group flex items-center gap-2 pl-3 pr-2.5 py-1.5 bg-bb-black border border-bb-border hover:border-bb-orange/50 rounded-lg transition-colors text-left"
                      title="Click to edit"
                    >
                      <span
                        className={cn("w-1.5 h-1.5 rounded-full shrink-0", {
                          "bg-green-400": s.status === "ACTIVE",
                          "bg-yellow-400": s.status === "PAUSED",
                          "bg-blue-400": s.status === "COMPLETED",
                          "bg-red-400": s.status === "CANCELLED",
                        })}
                      />
                      <span className="text-sm text-white">{s.name}</span>
                      {categoryLabel(s.category) && (
                        <span className="text-[10px] text-bb-dim hidden sm:inline">{categoryLabel(s.category)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            byService.map(({ name, items }) => {
              return (
                <div key={name} className="bg-bb-surface border border-bb-border rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <h3 className="text-sm font-semibold text-white">{name}</h3>
                    {categoryLabel(items[0].category) && (
                      <Badge variant="gray">{categoryLabel(items[0].category)}</Badge>
                    )}
                    <span className="text-xs text-bb-dim">
                      {items.length} client{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {items.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 bg-bb-black border border-bb-border rounded-lg"
                      >
                        <span
                          className={cn("w-1.5 h-1.5 rounded-full shrink-0", {
                            "bg-green-400": s.status === "ACTIVE",
                            "bg-yellow-400": s.status === "PAUSED",
                            "bg-blue-400": s.status === "COMPLETED",
                            "bg-red-400": s.status === "CANCELLED",
                          })}
                        />
                        <Link
                          href={`/clients/${s.client.id}`}
                          className="text-sm text-white hover:text-bb-orange transition-colors"
                        >
                          {s.client.name}
                        </Link>
                        <Badge variant={statusVariant[s.status] || "gray"}>{s.status}</Badge>
                        <button
                          onClick={() => setEditing(s)}
                          className="text-xs text-bb-dim hover:text-bb-orange transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Service">
        <ServiceForm clients={clients} onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.client.name} — Edit Service` : "Edit Service"}>
        {editing && (
          <div className="space-y-4">
            <ServiceForm
              clientId={editing.client.id}
              initial={{
                id: editing.id,
                clientId: editing.client.id,
                name: editing.name,
                category: editing.category,
                status: editing.status,
                startedAt: editing.startedAt,
                endedAt: editing.endedAt,
                notes: editing.notes || "",
              }}
              onSubmit={handleEdit}
              onCancel={() => setEditing(null)}
            />
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-xs text-bb-dim hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Remove this service
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
