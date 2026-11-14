import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "../ui/button";

export function ConfirmJobDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel = "Confirm and submit",
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  warning: string;
  confirmLabel?: string;
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl focus:outline-none sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              </span>
              <div>
                <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  {description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <Button aria-label="Close confirmation" size="icon" variant="ghost">
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <p className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-5 text-amber-900 dark:text-amber-200">
            {warning}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button disabled={submitting} variant="outline">Cancel</Button>
            </Dialog.Close>
            <Button disabled={submitting} onClick={onConfirm}>
              {submitting ? "Submitting…" : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
