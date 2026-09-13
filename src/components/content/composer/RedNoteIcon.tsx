/** RedNote (Xiaohongshu) mark: lucide has no brand icon for it. */
export default function RedNoteIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#FF2442" />
      <path d="M7 9h10M7 12h10M7 15h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
