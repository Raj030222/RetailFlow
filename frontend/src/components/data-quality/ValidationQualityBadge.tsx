import { AlertCircle, CheckCircle2, CircleHelp, LoaderCircle, XCircle } from "lucide-react";
import type { ValidationQualityStatus } from "../../types/dataQuality";

const styles: Record<ValidationQualityStatus, string> = {
  PASS: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAIL: "bg-destructive/10 text-destructive",
  RUNNING: "bg-blue-500/10 text-blue-800 dark:text-blue-300",
  LOADING: "bg-muted text-muted-foreground",
  ERROR: "bg-destructive/10 text-destructive",
  "NO DATA": "bg-muted text-muted-foreground",
};

const icons = {
  PASS: CheckCircle2,
  FAIL: XCircle,
  RUNNING: LoaderCircle,
  LOADING: LoaderCircle,
  ERROR: AlertCircle,
  "NO DATA": CircleHelp,
} satisfies Record<ValidationQualityStatus, typeof CheckCircle2>;

export function ValidationQualityBadge({
  status,
}: {
  status: ValidationQualityStatus;
}) {
  const Icon = icons[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}
      role="status"
    >
      <Icon
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${
          status === "RUNNING" || status === "LOADING" ? "animate-spin" : ""
        }`}
      />
      {status}
    </span>
  );
}
