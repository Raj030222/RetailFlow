import { RefreshCw } from "lucide-react";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";

interface DashboardHeaderProps {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function DashboardHeader({
  lastUpdated,
  refreshing,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <PageHeader
      description="Monitor RetailFlow pipeline execution, data quality, and performance."
      eyebrow="Workspace"
      title="Overview"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Last updated
            </p>
            <p className="mt-0.5 text-xs text-foreground" aria-live="polite">
              {lastUpdated
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }).format(lastUpdated)
                : "Not updated"}
            </p>
          </div>
          <span className="hidden h-8 w-px bg-border sm:block" />
          <Button
            aria-label="Refresh dashboard"
            disabled={refreshing}
            onClick={onRefresh}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      }
    />
  );
}
