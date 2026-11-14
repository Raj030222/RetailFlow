import { FlaskConical, Gauge } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfirmedJobSubmission } from "../../hooks/useConfirmedJobSubmission";
import {
  DEFAULT_MAX_RECORDS,
  DEFAULT_MAX_REPETITIONS,
  parseIntegerInput,
} from "../../lib/operationInput";
import { submissionFingerprint } from "../../lib/pipelineJobUtils";
import type { JobRecord } from "../../types/jobs";
import { submitBenchmark, type SubmitOnce } from "../../services/jobsService";
import { Button } from "../ui/button";
import { ErrorState } from "../common/States";
import { Panel } from "../common/Panel";
import { ConfirmJobDialog } from "./ConfirmJobDialog";
import { OperationJobSummary } from "./OperationJobSummary";

const DEFAULT_RECORDS = 10_000;
const DEFAULT_REPETITIONS = 3;

export function BenchmarkExecutionCard({
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
  const [recordsValue, setRecordsValue] = useState(String(DEFAULT_RECORDS));
  const [repetitionsValue, setRepetitionsValue] = useState(
    String(DEFAULT_REPETITIONS),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [request, setRequest] = useState({
    records: DEFAULT_RECORDS,
    repetitions: DEFAULT_REPETITIONS,
  });
  const fingerprint = submissionFingerprint("benchmark", request);
  const action = useConfirmedJobSubmission({
    actionName: "Benchmark",
    fingerprint,
    submitOnce,
    operation: () => submitBenchmark(request),
  });
  const duplicate = isDuplicateActive(fingerprint);
  const latestJob = jobs.find((job) => job.job_type === "benchmark");

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const next = {
        records: parseIntegerInput(
          recordsValue,
          "Record count",
          0,
          DEFAULT_MAX_RECORDS,
        ),
        repetitions: parseIntegerInput(
          repetitionsValue,
          "Repetitions",
          1,
          DEFAULT_MAX_REPETITIONS,
        ),
      };
      setRequest(next);
      setValidationError(null);
      action.begin();
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Check the benchmark settings.",
      );
    }
  };

  return (
    <Panel
      description="Measure baseline and optimized execution with the existing benchmark command."
      icon={<FlaskConical aria-hidden="true" className="h-4 w-4" />}
      title="Benchmark"
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium" htmlFor="benchmark-records">
            Record count
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="benchmark-records"
              max={DEFAULT_MAX_RECORDS}
              min={0}
              onChange={(event) => setRecordsValue(event.target.value)}
              type="number"
              value={recordsValue}
            />
          </label>
          <label className="block text-xs font-medium" htmlFor="benchmark-repetitions">
            Repetitions
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="benchmark-repetitions"
              max={DEFAULT_MAX_REPETITIONS}
              min={1}
              onChange={(event) => setRepetitionsValue(event.target.value)}
              type="number"
              value={repetitionsValue}
            />
          </label>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Current defaults: {DEFAULT_RECORDS.toLocaleString()} records and {DEFAULT_REPETITIONS} repetitions.
          API default limits: {DEFAULT_MAX_RECORDS.toLocaleString()} records and {DEFAULT_MAX_REPETITIONS} repetitions.
        </p>
        {(validationError || action.error) && (
          <ErrorState description={validationError ?? action.error ?? ""} />
        )}
        {duplicate && (
          <p className="text-xs text-amber-800 dark:text-amber-300" role="status">
            This exact benchmark request is already queued or running.
          </p>
        )}
        <Button disabled={action.submitting || duplicate} type="submit">
          <Gauge aria-hidden="true" className="h-4 w-4" />
          Run benchmark
        </Button>
      </form>
      <OperationJobSummary
        job={latestJob}
        onInspect={onInspect}
        submission={action.submission}
      />
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Benchmarks write configured inputs and replace the fixed benchmark report files.
        The API may be configured with different limits; its response is authoritative.
      </p>
      <ConfirmJobDialog
        confirmLabel="Run benchmark"
        description={`Benchmark ${request.records.toLocaleString()} records for ${request.repetitions} repetitions.`}
        onConfirm={() => void action.confirm()}
        onOpenChange={action.setDialogOpen}
        open={action.dialogOpen}
        submitting={action.submitting}
        title="Confirm benchmark"
        warning="Benchmarking runs Spark workloads and can consume significant CPU, memory, and time. It may rewrite generated inputs and replace the existing fixed benchmark report."
      />
    </Panel>
  );
}
