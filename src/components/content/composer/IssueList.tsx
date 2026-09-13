import { AlertCircle, AlertTriangle } from "lucide-react";
import type { SpecIssue } from "@/lib/social/specs";
import { cn } from "@/lib/utils";

export default function IssueList({ issues, className }: { issues: SpecIssue[]; className?: string }) {
  if (!issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <ul className={cn("space-y-1", className)} aria-live="polite">
      {sorted.map((issue, i) => (
        <li
          key={`${issue.message}-${i}`}
          className={cn(
            "flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs",
            issue.level === "error" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200"
          )}
        >
          {issue.level === "error" ? <AlertCircle size={13} className="mt-px shrink-0" /> : <AlertTriangle size={13} className="mt-px shrink-0" />}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}
