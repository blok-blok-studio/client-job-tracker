/** Shared helpers for the Automations admin UI. */

export function humanOffset(minutes: number): string {
  if (minutes === 0) return "immediately";
  const abs = Math.abs(minutes);
  const label =
    abs % 1440 === 0
      ? `${abs / 1440} day${abs / 1440 === 1 ? "" : "s"}`
      : abs % 60 === 0
        ? `${abs / 60} hour${abs / 60 === 1 ? "" : "s"}`
        : `${abs} min`;
  return minutes < 0 ? `${label} before` : `${label} after`;
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const STEP_STATUS_VARIANT: Record<
  string,
  "default" | "orange" | "blue" | "green" | "red" | "yellow" | "purple" | "gray"
> = {
  PENDING: "yellow",
  SENT: "green",
  DONE: "blue",
  CANCELLED: "gray",
  SKIPPED: "purple",
  FAILED: "red",
};

export const KIND_VARIANT: Record<string, "orange" | "blue" | "gray"> = {
  EMAIL: "orange",
  DRAFT: "blue",
  TASK: "gray",
};

export const KIND_LABEL: Record<string, string> = {
  EMAIL: "Auto email",
  DRAFT: "Draft (human sends)",
  TASK: "Internal task",
};

/** The copy rules, shown as a fixed note above every template editor. */
export const COPY_RULES =
  "Copy rules: no dashes, no AI sounding phrases, plain sentences, flat round numbers.";
