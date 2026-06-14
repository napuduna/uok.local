import clsx from "clsx";

export type StatusTone = "ok" | "warning" | "danger";

export interface StatusDotProps {
  label: string;
  tone: StatusTone;
}

export function StatusDot({ label, tone }: StatusDotProps) {
  return (
    <span className={clsx("status-dot", `status-dot--${tone}`)}>
      <span className="status-dot__indicator" aria-hidden="true" />
      {label}
    </span>
  );
}
