import { TableProperties } from "lucide-react";
import type { DataQualityReport, DatasetName } from "../../types/dataQuality";
import { formatReportNumber } from "../../lib/dashboardMetrics";
import { EmptyState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";

const datasets: DatasetName[] = ["customers", "products", "transactions"];
const datasetLabels: Record<DatasetName, string> = {
  customers: "Customers",
  products: "Products",
  transactions: "Transactions",
};

export function DatasetQualityTable({
  report,
  selectedJobId,
  loading = false,
}: {
  report: DataQualityReport | null;
  selectedJobId: string | null;
  loading?: boolean;
}) {
  return (
    <Panel
      description={
        selectedJobId
          ? `Only dataset metrics present in validation job ${selectedJobId.slice(0, 12)} are shown.`
          : "Dataset-level metrics are taken from the selected validation output."
      }
      icon={<TableProperties aria-hidden="true" className="h-4 w-4" />}
      title="Dataset quality analysis"
    >
      {loading && !report ? (
        <LoadingState label="Loading dataset quality metrics" />
      ) : !report ? (
        <EmptyState
          description="Dataset-level metrics are unavailable until a validation report is loaded."
          title="No dataset metrics"
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            “Not reported” means the validation output did not include that metric.
          </p>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[620px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4">Dataset</th>
                  <th className="pb-3 pr-4">Malformed records</th>
                  <th className="pb-3 pr-4">Duplicate dimension keys</th>
                  <th className="pb-3">Missing dimension keys</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((dataset) => (
                  <tr className="border-b border-border/70 last:border-0" key={dataset}>
                    <th className="py-3 pr-4 font-medium">{datasetLabels[dataset]}</th>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatReportNumber(report.malformed_records_by_dataset?.[dataset])}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {dataset === "transactions"
                        ? "Not reported"
                        : formatReportNumber(report.duplicate_dimension_keys?.[dataset])}
                    </td>
                    <td className="py-3 tabular-nums">
                      {dataset === "transactions"
                        ? "Not reported"
                        : formatReportNumber(report.missing_dimension_keys?.[dataset])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
