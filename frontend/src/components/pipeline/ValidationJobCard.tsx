import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useConfirmedJobSubmission } from "../../hooks/useConfirmedJobSubmission";
import { submissionFingerprint } from "../../lib/pipelineJobUtils";
import type { JobRecord } from "../../types/jobs";
import { submitValidation, type SubmitOnce } from "../../services/jobsService";
import { Button } from "../ui/button";
import { ErrorState } from "../common/States";
import { Panel } from "../common/Panel";
import { ConfirmJobDialog } from "./ConfirmJobDialog";
import { OperationJobSummary } from "./OperationJobSummary";

export function ValidationJobCard({
  jobs,
  submitOnce,
  isDuplicateActive,
  onInspect,
}: {
  jobs: JobRecord[];
  submitOnce: SubmitOnce;
  isDuplicateActive: (fingerprint: string) => boolean;
  onInspect: (jobId: string) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const fingerprint = submissionFingerprint("validate", {});
  const action = useConfirmedJobSubmission({
    actionName: "Data validation",
    fingerprint,
    submitOnce,
    operation: submitValidation,
  });
  const duplicate = isDuplicateActive(fingerprint);
  const latestJob = jobs.find((job) => job.job_type === "validate");

  return (
    <Panel
      description="Run the existing schema and data-quality checks against configured inputs."
      icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
      title="Validate data"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        Validation reads the configured datasets and does not publish pipeline outputs.
        PASS or FAIL is displayed only when present in the job output.
      </p>
      {(validationError || action.error) && (
        <div className="mt-4">
          <ErrorState description={validationError ?? action.error ?? ""} />
        </div>
      )}
      {duplicate && (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-300" role="status">
          A validation request is already queued or running.
        </p>
      )}
      <Button
        className="mt-4"
        disabled={action.submitting || duplicate}
        onClick={() => {
          setValidationError(null);
          action.begin();
        }}
        type="button"
      >
        Run validation
      </Button>
      {latestJob?.job_type === "validate" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Select the validation job below to inspect its actual output and logs.
        </p>
      )}
      <OperationJobSummary
        job={latestJob}
        onInspect={onInspect}
        submission={action.submission}
      />
      <ConfirmJobDialog
        confirmLabel="Validate and queue"
        description="Submit the configured input datasets to the existing validation command."
        onConfirm={() => void action.confirm()}
        onOpenChange={action.setDialogOpen}
        open={action.dialogOpen}
        submitting={action.submitting}
        title="Confirm data validation"
        warning="The API places validation in the same serialized queue as generation, Spark runs, and benchmarks. A queued response is not a successful validation result."
      />
    </Panel>
  );
}
