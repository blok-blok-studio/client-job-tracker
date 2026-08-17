"use client";

import { useState } from "react";
import { User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [error, setError] = useState<string | null>(null);
  // A client record can be a person, a company, or both — toggle what applies
  const [usePerson, setUsePerson] = useState(true);
  const [useCompany, setUseCompany] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const firstName = usePerson ? ((formData.get("firstName") as string)?.trim() || "") : "";
    const lastName = usePerson ? ((formData.get("lastName") as string)?.trim() || "") : "";
    const companyName = useCompany ? ((formData.get("company") as string)?.trim() || "") : "";
    const email = (formData.get("email") as string)?.trim() || "";

    const personName = `${firstName} ${lastName}`.trim();
    if (usePerson && !firstName) {
      setError("Enter a first name, or switch this client to company-only.");
      return;
    }
    if (useCompany && !companyName) {
      setError("Enter the company name, or switch this client to person-only.");
      return;
    }

    // Display name: the person when we have one, otherwise the company
    const name = personName || companyName;
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ name, email, company: companyName || undefined });
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50 focus:border-bb-orange text-sm";
  const labelClass = "block text-sm text-bb-muted mb-1";

  const chips: Array<{ key: "person" | "company"; label: string; icon: typeof User; on: boolean }> = [
    { key: "person", label: "Person", icon: User, on: usePerson },
    { key: "company", label: "Company", icon: Building2, on: useCompany },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Who is this client? Person, company, or both */}
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setError(null);
              if (c.key === "person") {
                if (usePerson && !useCompany) { setUseCompany(true); }
                setUsePerson((v) => !v);
              } else {
                if (useCompany && !usePerson) { setUsePerson(true); }
                setUseCompany((v) => !v);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors",
              c.on
                ? "bg-bb-orange/15 border-bb-orange/40 text-bb-orange"
                : "bg-bb-black border-bb-border text-bb-muted hover:text-white"
            )}
          >
            <c.icon size={14} />
            {c.label}
          </button>
        ))}
        <span className="text-[11px] text-bb-dim self-center ml-1">pick one or both</span>
      </div>

      {usePerson && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First Name *</label>
            <input name="firstName" className={inputClass} placeholder="First name" />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input name="lastName" className={inputClass} placeholder="Last name" />
          </div>
        </div>
      )}

      {useCompany && (
        <div>
          <label className={labelClass}>Company Name *</label>
          <input name="company" className={inputClass} placeholder="Acme Inc." />
        </div>
      )}

      <div>
        <label className={labelClass}>Email</label>
        <input name="email" type="email" className={inputClass} placeholder="client@company.com (optional)" />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

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
