import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import { AppSidebar, MobileSidebar } from "./AppSidebar";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
      <div
        className={`min-h-screen transition-[padding] duration-200 ${
          collapsed ? "md:pl-[72px]" : "md:pl-[248px]"
        }`}
      >
        <AppHeader onOpenNavigation={() => setMobileOpen(true)} />
        <main
          className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
          key={pathname}
        >
          <Outlet />
        </main>
        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          RetailFlow <span aria-hidden="true">·</span> PySpark Data Engineering &amp; Performance Platform
        </footer>
      </div>
    </div>
  );
}
