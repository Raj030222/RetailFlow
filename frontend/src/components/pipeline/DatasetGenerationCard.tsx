import { Database, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfirmedJobSubmission } from "../../hooks/useConfirmedJobSubmission";
import {
  DEFAULT_MAX_RECORDS,
  parseIntegerInput,
  parsePercentInput,
} from "../../lib/operationInput";
import { submissionFingerprint } from "../../lib/pipelineJobUtils";
import type { JobRecord } from "../../types/jobs";
import { submitGenerate, type SubmitOnce } from "../../services/jobsService";
import { Button } from "../ui/button";
import { ErrorState } from "../common/States";
import { Panel } from "../common/Panel";
import { ConfirmJobDialog } from "./ConfirmJobDialog";
import { OperationJobSummary } from "./OperationJobSummary";

const DEFAULT_RECORDS = 10_000;
const DEFAULT_INVALID_PERCENT = 3;

export function DatasetGenerationCard({
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
  const [invalidPercentValue, setInvalidPercentValue] = useState(
    String(DEFAULT_INVALID_PERCENT),
  );
  const [duplicateEvents, setDuplicateEvents] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [request, setRequest] = useState({
    records: DEFAULT_RECORDS,
    invalid_percent: DEFAULT_INVALID_PERCENT / 100,
    duplicate_events: true,
  });
  const fingerprint = submissionFingerprint("generate", request);
  const action = useConfirmedJobSubmission({
    actionName: "Dataset generation",
    fingerprint,
    submitOnce,
    operation: () => submitGenerate(request),
  });
  const duplicate = isDuplicateActive(fingerprint);
  const latestJob = jobs.find((job) => job.job_type === "generate");

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
        invalid_percent: parsePercentInput(invalidPercentValue) / 100,
        duplicate_events: duplicateEvents,
      };
      setRequest(next);
      setValidationError(null);
      action.begin();
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Check the generation settings.",
      );
    }
  };

  return (
    <Panel
      description="Create the configured synthetic transaction and dimension inputs."
      icon={<Database aria-hidden="true" className="h-4 w-4" />}
      title="Generate dataset"
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <label className="block text-xs font-medium" htmlFor="generate-records">
          Number of records
          <input
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="generate-records"
            max={DEFAULT_MAX_RECORDS}
            min={0}
            onChange={(event) => setRecordsValue(event.target.value)}
            type="number"
            value={recordsValue}
          />
        </label>
        <label className="block text-xs font-medium" htmlFor="generate-invalid-percent">
          Invalid data percentage
          <input
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="generate-invalid-percent"
            max={100}
            min={0}
            onChange={(event) => setInvalidPercentValue(event.target.value)}
            step="0.1"
            type="number"
            value={invalidPercentValue}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium" htmlFor="generate-duplicate-events">
          <input id="generate-duplicate-events" type="checkbox" checked={duplicateEvents} onChange={(event) => setDuplicateEvents(event.target.checked)} />
          Inject one deterministic duplicate event
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          Current defaults: {DEFAULT_RECORDS.toLocaleString()} records and {DEFAULT_INVALID_PERCENT}% invalid data.
          API default maximum: {DEFAULT_MAX_RECORDS.toLocaleString()} records.
        </p>
        {(validationError || action.error) && (
          <ErrorState description={validationError ?? action.error ?? ""} />
        )}
        {duplicate && (
          <p className="text-xs text-amber-800 dark:text-amber-300" role="status">
            This exact generation request is already queued or running.
          </p>
        )}
        <Button disabled={action.submitting || duplicate} type="submit">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Generate data
        </Button>
      </form>
      <OperationJobSummary
        job={latestJob}
        onInspect={onInspect}
        submission={action.submission}
      />
      <ConfirmJobDialog
        confirmLabel="Generate and queue"
        description={`Generate ${request.records.toLocaleString()} transaction records with ${(request.invalid_percent * 100).toLocaleString()}% invalid data${request.duplicate_events ? " and one duplicate event" : " and no duplicate event"}.`}
        onConfirm={() => void action.confirm()}
        onOpenChange={action.setDialogOpen}
        open={action.dialogOpen}
        submitting={action.submitting}
        title="Confirm dataset generation"
        warning="This operation writes the configured input files and may replace the existing generated dataset. The API serializes it with other operations."
      />
    </Panel>
  );
}
