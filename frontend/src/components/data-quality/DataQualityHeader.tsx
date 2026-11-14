import { RefreshCw } from "lucide-react";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";

export function DataQualityHeader({
  lastValidationAt,
  refreshing,
  duplicateActive,
  onRefresh,
  onRunValidation,
}: {
  lastValidationAt: string | null;
  refreshing: boolean;
  duplicateActive: boolean;
  onRefresh: () => void;
  onRunValidation: () => void;
}) {
  return (
    <PageHeader
      actions={
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              aria-label="Refresh data quality"
              disabled={refreshing}
              onClick={onRefresh}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              disabled={duplicateActive}
              onClick={onRunValidation}
            >
              Run Validation
            </Button>
          </div>
          {duplicateActive && (
            <p className="text-right text-xs text-amber-800 dark:text-amber-300" role="status">
              A validation job is already queued or running.
            </p>
          )}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Last validation: {formatTimestamp(lastValidationAt)}
          </p>
        </div>
      }
      description="Monitor validation outcomes, rejected records, and data integrity checks from the existing RetailFlow pipeline."
      eyebrow="Workspace"
      title="Data Quality & Validation"
    />
  );
}
