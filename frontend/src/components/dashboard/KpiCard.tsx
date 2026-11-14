import type { LucideIcon } from "lucide-react";
import { Panel } from "../common/Panel";
import { LoadingState } from "../common/States";

interface KpiCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  loading?: boolean;
  tone?: "default" | "success" | "danger";
}

const iconTone: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-accent text-accent-foreground",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  danger: "bg-destructive/10 text-destructive",
};

export function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
  tone = "default",
}: KpiCardProps) {
  return (
    <Panel contentClassName="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-3 min-h-8">
            {loading ? (
              <LoadingState className="mt-1" label="Loading" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
            )}
          </div>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconTone[tone]}`}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </Panel>
  );
}
