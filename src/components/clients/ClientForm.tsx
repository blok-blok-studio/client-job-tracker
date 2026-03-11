"use client";

import { useState } from "react";

interface ClientFormProps {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export default function ClientForm({
  onSubmit,
  onCancel,
  submitLabel = "Create Client",
}: ClientFormProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const firstName = (formData.get("firstName") as string)?.trim() || "";
    const lastName = (formData.get("lastName") as string)?.trim() || "";
    const name = `${firstName} ${lastName}`.trim();

    try {
      await onSubmit({ name });
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange text-sm";
  const labelClass = "block text-sm text-bb-muted mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>First Name *</label>
          <input name="firstName" required className={inputClass} placeholder="First name" />
        </div>
        <div>
          <label className={labelClass}>Last Name *</label>
          <input name="lastName" required className={inputClass} placeholder="Last name" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-bb-muted hover:text-white transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50">
          {loading ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
