import { CheckCircle2, CircleHelp, ShieldAlert, ShieldCheck } from "lucide-react";
import type { DataQualityReport, IntegrityCheckStatus } from "../../types/dataQuality";
import { buildIntegrityChecks } from "../../lib/validationParser";
import { LoadingState } from "../common/States";
import { Panel } from "../common/Panel";

const statusContent: Record<
  IntegrityCheckStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  passed: {
    label: "Passed",
    className: "text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "text-destructive",
    icon: ShieldAlert,
  },
  unavailable: {
    label: "Unavailable",
    className: "text-muted-foreground",
    icon: CircleHelp,
  },
};

export function IntegrityChecks({
  report,
  loading = false,
}: {
  report: DataQualityReport | null;
  loading?: boolean;
}) {
  const checks = buildIntegrityChecks(report);
  return (
    <Panel
      description="A check is passed or failed only when its corresponding result is present."
      icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
      title="Reconciliation & integrity"
    >
      {loading && !report ? (
        <LoadingState label="Loading integrity checks" />
      ) : (
      <ul className="divide-y divide-border">
        {checks.map((check) => {
          const content = statusContent[check.status];
          const Icon = content.icon;
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              key={check.id}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{check.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${content.className}`}>
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {content.label}
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </Panel>
  );
}
