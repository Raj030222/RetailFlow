import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  contentClassName?: string;
}

export function Panel({
  title,
  description,
  icon,
  action,
  className,
  contentClassName,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-card",
        className,
      )}
      {...props}
    >
      {(title || description || icon || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-sm font-semibold">{title}</h2>}
              {description && (
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("min-w-0 p-5", contentClassName)}>{children}</div>
    </section>
  );
}
