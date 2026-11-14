import { useState } from "react";
import { toast } from "sonner";
import type { SubmitOnce } from "../services/jobsService";
import type { JobSubmission } from "../types/jobs";

export function useConfirmedJobSubmission({
  actionName,
  fingerprint,
  submitOnce,
  operation,
}: {
  actionName: string;
  fingerprint: string;
  submitOnce: SubmitOnce;
  operation: Parameters<SubmitOnce>[1];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<JobSubmission | undefined>();
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setError(null);
    setDialogOpen(true);
  };

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitOnce(fingerprint, operation);
      if (!result) {
        setError("An equivalent job is already queued or running.");
        return;
      }
      setSubmission(result);
      setDialogOpen(false);
      toast.success(`${actionName} queued`, {
        description: `Job ID: ${result.job_id}`,
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "The job could not be submitted.";
      setError(message);
      toast.error("Job submission failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    dialogOpen,
    setDialogOpen,
    submitting,
    submission,
    error,
    setError,
    begin,
    confirm,
  };
}
