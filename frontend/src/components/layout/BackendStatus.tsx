import { CircleOff, CircleCheck, LoaderCircle } from "lucide-react";
import type { BackendConnectionState } from "../../types/api";
import { useBackendHealth } from "../../hooks/backendHealthContext";

const statusContent: Record<
  BackendConnectionState,
  { label: string; className: string; icon: typeof CircleCheck }
> = {
  checking: {
    label: "Checking API",
    className: "text-muted-foreground",
    icon: LoaderCircle,
  },
  connected: {
    label: "API connected",
    className: "text-emerald-700 dark:text-emerald-400",
    icon: CircleCheck,
  },
  disconnected: {
    label: "API disconnected",
    className: "text-muted-foreground",
    icon: CircleOff,
  },
};

export function BackendStatus() {
  const state = useBackendHealth();
  const content = statusContent[state];
  const Icon = content.icon;
  const title =
    state === "connected"
      ? "RetailFlow API is responding"
      : state === "checking"
        ? "Checking the RetailFlow API health endpoint"
        : "RetailFlow API is unavailable";

  return (
    <div
      aria-label={`Backend status: ${content.label}`}
      className={`inline-flex items-center gap-2 text-xs font-medium ${content.className}`}
      role="status"
      title={title}
    >
      {state === "checking" ? (
        <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{content.label}</span>
      <span className="sr-only sm:hidden">{content.label}</span>
    </div>
  );
}
