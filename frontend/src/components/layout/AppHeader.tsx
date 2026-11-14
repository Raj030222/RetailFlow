import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { BackendStatus } from "./BackendStatus";
import { ThemeToggle } from "../theme/ThemeToggle";
import { Button } from "../ui/button";

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/pipeline": "Pipeline Execution",
  "/data-quality": "Data Quality",
  "/performance": "Performance Analytics",
  "/lineage": "Data Lineage",
  "/history": "Run History",
  "/reports": "Reports",
};

export function AppHeader({
  onOpenNavigation,
}: {
  onOpenNavigation: () => void;
}) {
  const { pathname } = useLocation();
  const title = pageTitles[pathname] ?? "RetailFlow";
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-label="Open navigation"
          className="md:hidden"
          onClick={onOpenNavigation}
          size="icon"
          variant="ghost"
        >
          <Menu aria-hidden="true" className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            RetailFlow <span className="mx-1.5 text-border">/</span> Workspace
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <BackendStatus />
        <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
        <ThemeToggle />
      </div>
    </header>
  );
}
