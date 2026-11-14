import { ArrowRight, GitCompareArrows, Play, Zap } from "lucide-react";
import { useState } from "react";
import { useConfirmedJobSubmission } from "../../hooks/useConfirmedJobSubmission";
import { submissionFingerprint } from "../../lib/pipelineJobUtils";
import type { JobRecord } from "../../types/jobs";
import { submitRun, type RunJobRequest, type SubmitOnce } from "../../services/jobsService";
import { Button } from "../ui/button";
import { ErrorState } from "../common/States";
import { Panel } from "../common/Panel";
import { ConfirmJobDialog } from "./ConfirmJobDialog";
import { OperationJobSummary } from "./OperationJobSummary";

const descriptions = {
  baseline: "Run the reference transformation for comparison and verification.",
  optimized: "Run the optimized transformation using the existing pipeline strategy.",
  both: "Run baseline and optimized modes sequentially with separate mode outputs.",
} satisfies Record<RunJobRequest["mode"], string>;

const warnings = {
  baseline:
    "This execution publishes output data and may replace the destination for the selected or configured run ID.",
  optimized:
    "This execution publishes output data and may replace the destination for the selected or configured run ID.",
  both:
    "Both Spark modes run sequentially and publish their separate results. Existing destinations for the selected or configured run ID may be replaced.",
} satisfies Record<RunJobRequest["mode"], string>;

const icons = {
  baseline: Play,
  optimized: Zap,
  both: GitCompareArrows,
} satisfies Record<RunJobRequest["mode"], typeof Play>;

export function PipelineRunCard({
  mode,
  jobs,
  submitOnce,
  isDuplicateActive,
  onInspect,
}: {
  mode: RunJobRequest["mode"];
  jobs: JobRecord[];
  submitOnce: SubmitOnce;
  isDuplicateActive: (fingerprint: string) => boolean;
  onInspect: (jobId: string) => void;
}) {
  const [batchId, setBatchId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [request, setRequest] = useState<RunJobRequest>({ mode });
  const fingerprint = submissionFingerprint("run", {
    mode: request.mode,
    batch_id: request.batch_id ?? "",
  });
  const action = useConfirmedJobSubmission({
    actionName: `Run ${mode}`,
    fingerprint,
    submitOnce,
    operation: () => submitRun(request),
  });
  const duplicate = isDuplicateActive(fingerprint);
  const latestJob = jobs.find((job) => job.job_type === mode);
  const Icon = icons[mode];
  const modeTitle = mode === "both"
    ? "Both modes"
    : mode === "baseline"
      ? "Baseline mode"
      : "Optimized mode";

  return (
    <Panel
      className="h-full"
      description={descriptions[mode]}
      icon={<Icon aria-hidden="true" className="h-4 w-4" />}
      title={modeTitle}
    >
      <p className="mb-4 text-xs leading-5 text-muted-foreground">
        Execution mode: <span className="font-medium capitalize text-foreground">{mode}</span>
      </p>
      <label className="block text-xs font-medium" htmlFor={`batch-id-${mode}`}>
        Batch ID <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          autoComplete="off"
          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={`batch-id-${mode}`}
          maxLength={64}
          onChange={(event) => setBatchId(event.target.value)}
          placeholder="Use configured default"
          value={batchId}
        />
      </label>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        Letters, numbers, underscores, and hyphens; 1–64 characters.
      </p>
      {(validationError || action.error) && (
        <div className="mt-3">
          <ErrorState description={validationError ?? action.error ?? ""} />
        </div>
      )}
      {duplicate && (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-300" role="status">
          This exact pipeline request is already queued or running.
        </p>
      )}
      <Button
        className="mt-4"
        disabled={action.submitting || duplicate}
        onClick={() => {
          const trimmed = batchId.trim();
          if (
            trimmed &&
            !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)
          ) {
            setValidationError(
              "Batch ID must be 1–64 letters, digits, underscores, or hyphens.",
            );
            return;
          }
          setValidationError(null);
          const nextRequest: RunJobRequest = {
            mode,
            ...(trimmed ? { batch_id: trimmed } : {}),
          };
          setRequest(nextRequest);
          action.begin();
        }}
        type="button"
      >
        Run {mode}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Button>
      <OperationJobSummary
        job={latestJob}
        onInspect={onInspect}
        submission={action.submission}
      />
      <ConfirmJobDialog
        confirmLabel="Execute and queue"
        description={`${descriptions[mode]}${request.batch_id ? ` Batch ID: ${request.batch_id}.` : ""}`}
        onConfirm={() => void action.confirm()}
        onOpenChange={action.setDialogOpen}
        open={action.dialogOpen}
        submitting={action.submitting}
        title={`Confirm ${mode} execution`}
        warning={warnings[mode]}
      />
    </Panel>
  );
}
