import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "orange" | "blue" | "green" | "red" | "yellow" | "purple" | "gray";
  size?: "sm" | "md";
  className?: string;
}

const variants = {
  default: "bg-bb-elevated text-bb-muted",
  orange: "bg-bb-orange/15 text-bb-orange",
  blue: "bg-blue-500/15 text-blue-400",
  green: "bg-green-500/15 text-green-400",
  red: "bg-red-500/15 text-red-400",
  yellow: "bg-yellow-500/15 text-yellow-400",
  purple: "bg-purple-500/15 text-purple-400",
  gray: "bg-bb-elevated text-bb-dim",
};

export default function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-md whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
