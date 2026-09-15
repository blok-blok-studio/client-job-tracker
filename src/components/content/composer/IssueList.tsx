import { AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import type { SpecIssue } from "@/lib/social/specs";
import { cn } from "@/lib/utils";

export default function IssueList({ issues, className, onSelect }: { issues: SpecIssue[]; className?: string; onSelect?: (issue: SpecIssue) => void }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <ul className={cn("space-y-1", className)} aria-live="polite">
      {sorted.map((issue, i) => {
        const tone = issue.level === "error" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200";
        const icon = issue.level === "error" ? <AlertCircle size={13} className="mt-px shrink-0" /> : <AlertTriangle size={13} className="mt-px shrink-0" />;
        return (
          <li key={`${issue.message}-${i}`}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(issue)}
                className={cn("w-full flex items-start gap-1.5 rounded-md px-2 py-2 sm:py-1.5 text-xs text-left cursor-pointer hover:brightness-125 transition", tone)}
              >
                {icon}
                <span className="flex-1">{issue.message}</span>
                <ChevronRight size={13} className="mt-px shrink-0 opacity-60" />
              </button>
            ) : (
              <div className={cn("flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs", tone)}>
                {icon}
                <span>{issue.message}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
