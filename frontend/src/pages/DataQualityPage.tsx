import { useConfirmedJobSubmission } from "../hooks/useConfirmedJobSubmission";
import { useDataQuality } from "../hooks/useDataQuality";
import { submitValidation } from "../services/jobsService";
import { validationQualityStatus } from "../lib/validationParser";
import { DataQualityHeader } from "../components/data-quality/DataQualityHeader";
import { DataQualityKpiCards } from "../components/data-quality/DataQualityKpiCards";
import { DatasetQualityTable } from "../components/data-quality/DatasetQualityTable";
import { IntegrityChecks } from "../components/data-quality/IntegrityChecks";
import { ValidationDetails } from "../components/data-quality/ValidationDetails";
import { ValidationHistory } from "../components/data-quality/ValidationHistory";
import { ValidationStatusCard } from "../components/data-quality/ValidationStatusCard";
import { ConfirmJobDialog } from "../components/pipeline/ConfirmJobDialog";
import { ErrorState } from "../components/common/States";

export function DataQualityPage() {
  const data = useDataQuality();
  const action = useConfirmedJobSubmission({
    actionName: "Validation",
    fingerprint: "retailflow-validation",
    submitOnce: data.submitOnce,
    operation: submitValidation,
  });
  const selectedOutput = data.selectedJob
    ? data.outputs[data.selectedJob.job_id]
    : undefined;
  const selectedReport = selectedOutput?.report ?? null;
  const selectedQualityStatus =
    data.status === "loading" && !data.selectedJob
      ? "LOADING"
      : validationQualityStatus(data.selectedJob, selectedOutput);
  const qualityLoading =
    !selectedReport &&
    (data.status === "loading" ||
      selectedQualityStatus === "LOADING" ||
      selectedQualityStatus === "RUNNING");
  const latestValidation = data.jobs[0] ?? null;

  return (
    <div className="space-y-6">
      <DataQualityHeader
        duplicateActive={data.isDuplicateActive("retailflow-validation")}
        lastValidationAt={
          latestValidation?.completed_at ?? latestValidation?.created_at ?? null
        }
        onRefresh={() => void data.refresh(true)}
        onRunValidation={action.begin}
        refreshing={data.refreshing}
      />

      {action.error && <ErrorState title="Validation submission failed" description={action.error} />}
      {action.submission && (
        <p
          className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-foreground"
          role="status"
        >
          Validation job submitted: <span className="font-mono">{action.submission.job_id}</span>.
          Its execution status and data-quality result will update independently.
        </p>
      )}

      <section aria-labelledby="selected-validation-heading" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold" id="selected-validation-heading">
            Selected validation result
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Record-quality metrics come from the selected report; job execution and reconciliation are shown separately below.
          </p>
        </div>
        <DataQualityKpiCards
          loading={qualityLoading}
          report={selectedReport}
          reportCreatedAt={selectedReport ? data.selectedJob?.created_at ?? null : null}
          status={selectedQualityStatus}
        />
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <ValidationStatusCard
          hasMore={data.hasMore}
          job={data.selectedJob}
          output={selectedOutput}
          status={selectedQualityStatus}
        />
        <IntegrityChecks loading={qualityLoading} report={selectedReport} />
      </section>

      <DatasetQualityTable
        report={selectedReport}
        loading={qualityLoading}
        selectedJobId={data.selectedJob?.job_id ?? null}
      />

      <ValidationHistory
        error={data.error}
        hasMore={data.hasMore}
        jobs={data.jobs}
        loadingMore={data.loadingMore}
        onLoadMore={() => void data.loadMore()}
        onRefresh={() => void data.refresh(true)}
        onSelect={data.selectJob}
        outputs={data.outputs}
        refreshing={data.refreshing}
        status={data.status}
      />

      <ValidationDetails job={data.selectedJob} output={selectedOutput} />

      <ConfirmJobDialog
        confirmLabel="Validate and queue"
        description="Submit a validation job for the datasets configured in RetailFlow."
        onConfirm={() => void action.confirm()}
        onOpenChange={action.setDialogOpen}
        open={action.dialogOpen}
        submitting={action.submitting || data.submissionPending}
        title="Confirm data validation"
        warning="Validation reads the configured inputs and applies the existing pipeline checks. It does not publish pipeline outputs. A queued job response is not a PASS result."
      />
    </div>
  );
}
