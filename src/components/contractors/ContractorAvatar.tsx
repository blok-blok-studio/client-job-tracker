"use client";

// One avatar everywhere: the contractors list, agreements, invoices, hours, and
// the profile page. Falls back to initials on a colour derived from their name,
// so a contractor without a selfie still reads as a person rather than a blank.

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #f97316, #ec4899)",
  "linear-gradient(135deg, #6366f1, #06b6d4)",
  "linear-gradient(135deg, #22c55e, #84cc16)",
  "linear-gradient(135deg, #a855f7, #f43f5e)",
  "linear-gradient(135deg, #0ea5e9, #6366f1)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
];

export function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function ContractorAvatar({
  contractor,
  size = 32,
  ring = false,
  className = "",
}: {
  contractor: {
    name: string;
    avatarUrl?: string | null;
    accentColor?: string | null;
    emoji?: string | null;
  };
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const background = contractor.accentColor
    ? `linear-gradient(135deg, ${contractor.accentColor}, ${contractor.accentColor}88)`
    : avatarGradient(contractor.name);

  return (
    <span
      className={`relative inline-flex shrink-0 rounded-full overflow-hidden ${
        ring ? "ring-2 ring-bb-orange/40 ring-offset-2 ring-offset-bb-surface" : ""
      } ${className}`}
      style={{ width: size, height: size, background }}
      title={contractor.name}
    >
      {contractor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={contractor.avatarUrl}
          alt={contractor.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          className="w-full h-full flex items-center justify-center font-semibold text-white"
          style={{ fontSize: Math.max(9, size * 0.38) }}
        >
          {contractor.emoji || initials(contractor.name)}
        </span>
      )}
    </span>
  );
}
