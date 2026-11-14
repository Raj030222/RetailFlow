import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  BarChart3,
  ChevronLeft,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard, end: true },
  { label: "Pipeline Execution", to: "/pipeline", icon: Play },
  { label: "Data Quality", to: "/data-quality", icon: ShieldCheck },
  { label: "Performance Analytics", to: "/performance", icon: BarChart3 },
  { label: "Data Lineage", to: "/lineage", icon: GitBranch },
  { label: "Run History", to: "/history", icon: Activity },
  { label: "Reports", to: "/reports", icon: FileText },
];

interface SidebarContentProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}

function SidebarContent({ collapsed = false, onNavigate, onToggle }: SidebarContentProps) {
  return (
    <>
      <div className={cn("flex h-[68px] items-center border-b border-border px-4", collapsed && "justify-center px-2")}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Database aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">RetailFlow</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Data platform
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={cn("px-3 pb-2 pt-6", collapsed && "px-2")}>
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </p>
        )}
        <nav aria-label="Primary navigation" className="space-y-1">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              aria-label={collapsed ? label : undefined}
              end={end}
              key={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              to={to}
              className={({ isActive }) =>
                cn(
                  "group flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                )
              }
            >
              <Icon aria-hidden="true" className="h-[17px] w-[17px] shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {!collapsed && (
        <div className="mt-auto border-t border-border p-4">
          <div className="rounded-md bg-muted/70 p-3">
            <p className="text-xs font-medium text-foreground">Local workspace</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              PySpark pipeline and reports stay on this machine.
            </p>
          </div>
        </div>
      )}

      {onToggle && (
        <div className={cn("border-t border-border p-3", collapsed && "px-2")}>
          <Button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("w-full justify-start text-muted-foreground", collapsed && "justify-center")}
            onClick={onToggle}
            size="sm"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
                <span>Collapse sidebar</span>
                <ChevronLeft aria-hidden="true" className="ml-auto h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </>
  );
}

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}

export function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(84vw,280px)] flex-col border-r border-border bg-card shadow-xl focus:outline-none md:hidden">
          <Dialog.Title className="sr-only">RetailFlow navigation</Dialog.Title>
          <SidebarContent onNavigate={() => onOpenChange(false)} />
          <Dialog.Close asChild>
            <Button
              aria-label="Close navigation"
              className="absolute right-3 top-4"
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          <Dialog.Description className="sr-only">
            Navigate between RetailFlow workspace pages.
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
