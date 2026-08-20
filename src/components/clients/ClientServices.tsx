"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import ServiceForm, { type ServiceFormValues } from "@/components/services/ServiceForm";
import { serviceCategoryLabel } from "@/lib/service-catalog";
import { useToast } from "@/components/shared/Toast";
import { readJson, friendlyError } from "@/lib/fetch-json";

interface ServiceItem {
  id: string;
  name: string;
  category: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
}

const statusVariant: Record<string, "green" | "yellow" | "blue" | "red" | "gray"> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  COMPLETED: "blue",
  CANCELLED: "red",
};

const categoryLabel = serviceCategoryLabel;

export default function ClientServices({ clientId }: { clientId: string }) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const { toast } = useToast();

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/services?clientId=${clientId}&includeArchived=1`);
      const data = await res.json();
      if (data.success) setServices(data.data);
    } catch {
      // API not available
    }
  }, [clientId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  async function handleAdd(values: ServiceFormValues) {
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, clientId }),
      });
      const result = await readJson(res, "Couldn't add that service. Please try again.");
      if (result.ok) {
        setShowAdd(false);
        toast("Service added", "success");
        fetchServices();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't add that service. Please try again."), "error");
    }
  }

  async function handleEdit(values: ServiceFormValues) {
    if (!editing) return;
    try {
      const res = await fetch(`/api/services/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await readJson(res, "Couldn't update that service. Please try again.");
      if (result.ok) {
        setEditing(null);
        toast("Service updated", "success");
        fetchServices();
      } else {
        toast(result.error!, "error");
      }
    } catch (err) {
      toast(friendlyError(err, "Couldn't update that service. Please try again."), "error");
    }
  }

  async function handleDelete(service: ServiceItem) {
    if (!window.confirm(`Remove "${service.name}"?`)) return;
    try {
      const res = await fetch(`/api/services/${service.id}`, { method: "DELETE" });
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
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold">Services</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="text-bb-orange hover:text-bb-orange-light text-sm flex items-center gap-1"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-bb-dim">
          Nothing tracked yet. Add what this client is signed up for — it shows on the Services overview.
        </p>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 p-2 rounded hover:bg-bb-elevated cursor-pointer"
              onClick={() => setEditing(s)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white">{s.name}</span>
                  <Badge variant={statusVariant[s.status] || "gray"}>{s.status}</Badge>
                </div>
                <div className="text-xs text-bb-dim mt-0.5">
                  {[
                    categoryLabel(s.category),
                    // Date-only value stored at UTC midnight — render in UTC or it shows a day early
                    s.startedAt ? `since ${new Date(s.startedAt).toLocaleDateString(undefined, { timeZone: "UTC" })}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                className="p-1 text-bb-dim hover:text-red-400 shrink-0"
                title="Remove service"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Service">
        <ServiceForm clientId={clientId} onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Service">
        {editing && (
          <ServiceForm
            clientId={clientId}
            initial={{
              id: editing.id,
              clientId,
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
        )}
      </Modal>
    </div>
  );
}
