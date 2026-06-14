import type { ReactNode } from "react";

import clsx from "clsx";

export type MetricTone = "default" | "positive" | "warning";

export interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: MetricTone;
}

export function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "default"
}: MetricCardProps) {
  return (
    <article className={clsx("metric-card", `metric-card--${tone}`)}>
      <div className="metric-card__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="metric-card__body">
        <p className="metric-card__label">{label}</p>
        <p className="metric-card__value">{value}</p>
        <p className="metric-card__detail">{detail}</p>
      </div>
    </article>
  );
}
