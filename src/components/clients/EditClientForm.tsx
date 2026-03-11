"use client";

import { useState, useMemo } from "react";

const SOURCE_OPTIONS = [
  "Referral",
  "Instagram",
  "LinkedIn",
  "TikTok",
  "Twitter/X",
  "Facebook",
  "YouTube",
  "Google Search",
  "Website",
  "Cold Outreach",
  "Networking Event",
  "Word of Mouth",
  "Other",
];

const INDUSTRY_OPTIONS = [
  "Accounting & Finance",
  "Advertising & Marketing",
  "Agriculture",
  "Architecture",
  "Automotive",
  "Beauty & Cosmetics",
  "Blockchain & Crypto",
  "Cannabis",
  "Coaching & Consulting",
  "Construction",
  "Creative Agency",
  "Dental",
  "E-commerce",
  "Education",
  "Energy & Utilities",
  "Entertainment",
  "Events & Hospitality",
  "Fashion & Apparel",
  "Film & Video",
  "Fitness & Wellness",
  "Food & Beverage",
  "Gaming",
  "Government",
  "Healthcare",
  "Home Services",
  "Insurance",
  "Interior Design",
  "Jewelry & Watches",
  "Law & Legal",
  "Logistics & Shipping",
  "Manufacturing",
  "Media & Publishing",
  "Music",
  "Nonprofit",
  "Outdoor & Recreation",
  "Pets & Animals",
  "Photography",
  "Real Estate",
  "Restaurants & Bars",
  "Retail",
  "SaaS & Software",
  "Skincare",
  "Social Media",
  "Sports",
  "Sustainability & Green",
  "Tech & Startups",
  "Telecommunications",
  "Travel & Tourism",
  "Venture Capital & PE",
  "Other",
];

interface EditClientFormProps {
  initialData: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    type?: string;
    tier?: string;
    source?: string;
    industry?: string;
    notes?: string;
    monthlyRetainer?: number | null;
    contractStart?: string | null;
    contractEnd?: string | null;
    timezone?: string;
  };
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

function FilterableSelect({
  name,
  defaultValue,
  options,
  placeholder,
  inputClass,
}: {
  name: string;
  defaultValue: string;
  options: string[];
  placeholder: string;
  inputClass: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!value) return options;
    const lower = value.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower));
  }, [value, options]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={inputClass}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-bb-black border border-bb-border rounded-md shadow-lg">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={() => { setValue(opt); setOpen(false); }}
              className="px-3 py-2 text-sm text-white hover:bg-bb-orange/20 cursor-pointer"
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditClientForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Save Changes",
}: EditClientFormProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (key === "monthlyRetainer") {
        data[key] = value ? Number(value) : null;
      } else {
        data[key] = value || undefined;
      }
    }

    try {
      await onSubmit(data);
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
          <label className={labelClass}>Name *</label>
          <input name="name" defaultValue={initialData.name} required className={inputClass} placeholder="Client name" />
        </div>
        <div>
          <label className={labelClass}>Company</label>
          <input name="company" defaultValue={initialData.company} className={inputClass} placeholder="Company" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Type</label>
          <select name="type" defaultValue={initialData.type || "ACTIVE"} className={inputClass}>
            <option value="PROSPECT">Prospect</option>
            <option value="ACTIVE">Active</option>
            <option value="PAST">Past</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Tier</label>
          <select name="tier" defaultValue={initialData.tier || "STANDARD"} className={inputClass}>
            <option value="VIP">VIP</option>
            <option value="STANDARD">Standard</option>
            <option value="TRIAL">Trial</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Email</label>
          <input name="email" type="email" defaultValue={initialData.email} className={inputClass} placeholder="email@example.com" />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input name="phone" defaultValue={initialData.phone} className={inputClass} placeholder="+1 234 567 8900" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>How did you hear about us?</label>
          <FilterableSelect
            name="source"
            defaultValue={initialData.source || ""}
            options={SOURCE_OPTIONS}
            placeholder="Select or type..."
            inputClass={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Industry</label>
          <FilterableSelect
            name="industry"
            defaultValue={initialData.industry || ""}
            options={INDUSTRY_OPTIONS}
            placeholder="Select or type..."
            inputClass={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Monthly Retainer ($)</label>
        <input name="monthlyRetainer" type="number" step="0.01" defaultValue={initialData.monthlyRetainer ?? ""} className={inputClass} placeholder="0.00" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Contract Start</label>
          <input name="contractStart" type="date" defaultValue={initialData.contractStart?.split("T")[0]} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contract End</label>
          <input name="contractEnd" type="date" defaultValue={initialData.contractEnd?.split("T")[0]} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea name="notes" defaultValue={initialData.notes} rows={3} className={inputClass} placeholder="Free-form notes..." />
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
