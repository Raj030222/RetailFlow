import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Database,
  Play,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { JobRecord, JobSubmission } from "../../types/jobs";
import {
  submitBenchmark,
  submitGenerate,
  submitRun,
  submitValidation,
} from "../../services/jobsService";
import { Button } from "../ui/button";
import { Panel } from "../common/Panel";
import { ApiRequestError } from "../../services/apiClient";

type ActionId =
  | "generate"
  | "validate"
  | "baseline"
  | "optimized"
  | "both"
  | "benchmark";

interface ActionDefinition {
  id: ActionId;
  title: string;
  description: string;
  icon: typeof Database;
  warning: string;
}

const actions: ActionDefinition[] = [
  {
    id: "generate",
    title: "Generate sample data",
    description: "Create or replace the configured synthetic input CSV files.",
    icon: Database,
    warning:
      "Generation writes the configured input files and can replace the existing generated dataset. Other runs are serialized by the API queue.",
  },
  {
    id: "validate",
    title: "Validate dataset",
    description: "Run the existing input validation command without publishing pipeline outputs.",
    icon: ShieldCheck,
    warning: "This reads the configured input datasets and does not publish pipeline outputs.",
  },
  {
    id: "baseline",
    title: "Run baseline",
    description: "Execute the baseline pipeline transformation.",
    icon: Play,
    warning: "This can publish a new output batch and retain the prior batch as a backup.",
  },
  {
    id: "optimized",
    title: "Run optimized",
    description: "Execute the optimized pipeline transformation.",
    icon: Zap,
    warning: "This can publish a new output batch and retain the prior batch as a backup.",
  },
  {
    id: "both",
    title: "Run both modes",
    description: "Execute baseline and optimized modes sequentially.",
    icon: Play,
    warning:
      "This runs two Spark jobs and can publish output batches for both modes. It may take significant time and resources.",
  },
  {
    id: "benchmark",
    title: "Run benchmark",
    description: "Compare baseline and optimized transformations.",
    icon: Zap,
    warning:
      "Benchmarking runs Spark transformations, rewrites configured generated inputs, and replaces the fixed benchmark reports. It can consume significant resources.",
  },
];

function optionalInteger(value: string, field: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative whole number.`);
  }
  return parsed;
}

function optionalFraction(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Invalid-record fraction must be between 0 and 1.");
  }
  return parsed;
}

export function QuickActions({
  jobs,
  onSubmitted,
}: {
  jobs: JobRecord[];
  onSubmitted: () => void;
}) {
  const [selected, setSelected] = useState<ActionDefinition | null>(null);
  const [records, setRecords] = useState("");
  const [invalidPercent, setInvalidPercent] = useState("");
  const [repetitions, setRepetitions] = useState("");
  const [batchId, setBatchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<JobSubmission | null>(null);

  const latestSubmissionJob = submission
    ? jobs.find((job) => job.job_id === submission.job_id)
    : undefined;
  const submissionStatus = latestSubmissionJob?.status ?? submission?.status;

  const closeDialog = (open: boolean) => {
    if (!open && !submitting) {
      setSelected(null);
      setError(null);
    }
  };

  const submitAction = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const count = optionalInteger(records, "Record count");
      let result: JobSubmission;
      if (selected.id === "generate") {
        result = await submitGenerate({
          ...(count === undefined ? {} : { records: count }),
          ...(optionalFraction(invalidPercent) === undefined
            ? {}
            : { invalid_percent: optionalFraction(invalidPercent) }),
        });
      } else if (selected.id === "validate") {
        result = await submitValidation();
      } else if (selected.id === "benchmark") {
        const repetitionCount = optionalInteger(repetitions, "Repetitions");
        if (repetitionCount !== undefined && repetitionCount < 1) {
          throw new Error("Repetitions must be at least 1.");
        }
        result = await submitBenchmark({
          ...(count === undefined ? {} : { records: count }),
          ...(repetitionCount === undefined
            ? {}
            : { repetitions: repetitionCount }),
        });
      } else {
        const trimmedBatchId = batchId.trim();
        if (trimmedBatchId && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmedBatchId)) {
          throw new Error("Batch ID must be 1–64 letters, digits, underscores, or hyphens.");
        }
        result = await submitRun({
          mode: selected.id,
          ...(trimmedBatchId ? { batch_id: trimmedBatchId } : {}),
        });
      }

      setSubmission(result);
      toast.success(`${selected.title} queued`, {
        description: `Job ID: ${result.job_id}`,
      });
      setSelected(null);
      onSubmitted();
    } catch (submitError) {
      const message =
        submitError instanceof ApiRequestError || submitError instanceof Error
          ? submitError.message
          : "The job could not be submitted.";
      setError(message);
      toast.error("Job submission failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Panel
        description="Operations run through the serialized local API queue."
        title="Quick actions"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map(({ icon: Icon, ...action }) => (
            <button
              className="group flex min-h-[76px] items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={action.id}
              onClick={() => {
                setSelected({ ...action, icon: Icon });
                setError(null);
              }}
              type="button"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-accent">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{action.title}</span>
                <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                  {action.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        {submission && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">
                  Job {submissionStatus}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {submission.job_id}
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/history">View run history</Link>
            </Button>
          </div>
        )}
      </Panel>

      <Dialog.Root open={selected !== null} onOpenChange={closeDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl focus:outline-none sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {selected?.title}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  Confirm before submitting this operation.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button aria-label="Close dialog" disabled={submitting} size="icon" variant="ghost">
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            {selected && (
              <>
                <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-5 text-amber-900 dark:text-amber-200">
                  {selected.warning}
                </div>

                {(selected.id === "generate" || selected.id === "benchmark") && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-xs font-medium">
                      Records <span className="font-normal text-muted-foreground">(optional)</span>
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        inputMode="numeric"
                        min="0"
                        onChange={(event) => setRecords(event.target.value)}
                        placeholder="Use configured default"
                        type="number"
                        value={records}
                      />
                    </label>
                    {selected.id === "generate" ? (
                      <label className="grid gap-1.5 text-xs font-medium">
                        Invalid-record fraction
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          max="1"
                          min="0"
                          onChange={(event) => setInvalidPercent(event.target.value)}
                          placeholder="Use configured default"
                          step="0.01"
                          type="number"
                          value={invalidPercent}
                        />
                      </label>
                    ) : (
                      <label className="grid gap-1.5 text-xs font-medium">
                        Repetitions <span className="font-normal text-muted-foreground">(optional)</span>
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          min="1"
                          onChange={(event) => setRepetitions(event.target.value)}
                          placeholder="Use configured default"
                          type="number"
                          value={repetitions}
                        />
                      </label>
                    )}
                  </div>
                )}

                {["baseline", "optimized", "both"].includes(selected.id) && (
                  <label className="mt-4 grid gap-1.5 text-xs font-medium">
                    Batch ID <span className="font-normal text-muted-foreground">(optional)</span>
                    <input
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      maxLength={64}
                      onChange={(event) => setBatchId(event.target.value)}
                      placeholder="Use configured default"
                      value={batchId}
                    />
                  </label>
                )}

                {error && (
                  <p className="mt-4 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button disabled={submitting} variant="outline">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button disabled={submitting} onClick={() => void submitAction()}>
                    {submitting ? "Submitting…" : "Confirm and submit"}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
