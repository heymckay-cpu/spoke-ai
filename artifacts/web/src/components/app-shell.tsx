import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, LineChart, Menu, Settings as SettingsIcon, Moon, Sun, Wallet } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import spokeMark from "@/assets/spoke-mark.png";
import {
  getGetLatestScanQueryKey,
  getHealthCheckQueryKey,
  useGetLatestScan,
  useHealthCheck,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { RunScanButton } from "@/components/run-scan-button";
import { NotificationBell } from "@/components/notification-bell";
import { fmtRelative } from "@/lib/format";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  match: (loc: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Candidates",
    icon: LayoutGrid,
    match: (l) => l === "/" || l === "",
  },
  {
    href: "/chain",
    label: "Chain",
    icon: LineChart,
    match: (l) => l.startsWith("/chain"),
  },
  {
    href: "/positions",
    label: "Positions",
    icon: Wallet,
    match: (l) => l.startsWith("/positions"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (l) => l.startsWith("/settings"),
  },
];

interface Crumb {
  label: string;
  href?: string;
}

interface AppShellProps {
  title: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, breadcrumbs, actions, children }: AppShellProps) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const latest = useGetLatestScan({
    query: { staleTime: 30_000, queryKey: getGetLatestScanQueryKey() },
  });
  const health = useHealthCheck({
    query: { staleTime: 30_000, refetchInterval: 60_000, queryKey: getHealthCheckQueryKey() },
  });

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
        data-testid="nav-sidebar"
      >
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4">
          <img
            src={spokeMark}
            alt=""
            aria-hidden="true"
            className="h-11 w-11 object-contain"
            data-testid="img-brand-logo"
          />
          <div className="flex items-baseline gap-1.5 leading-none">
            <span className="text-2xl font-semibold tracking-tight text-sidebar-foreground">
              Spoke
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              AI
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = item.match(location);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
                data-testid={`link-nav-${item.label.toLowerCase()}`}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-md bg-sidebar-accent/40 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Last scan
              </span>
              <span className="text-xs font-medium tabular-nums" data-testid="text-last-scan">
                {latest.data?.scannedAt ? fmtRelative(latest.data.scannedAt) : "Never"}
              </span>
            </div>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                health.data?.status === "ok" ? "bg-emerald-500" : "bg-muted-foreground",
              )}
              data-testid="status-health"
              title={health.data?.status ?? "unknown"}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation"
                  data-testid="button-mobile-nav"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="border-b border-border px-4 py-3">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <img
                      src={spokeMark}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-9 object-contain"
                      data-testid="img-brand-logo-mobile"
                    />
                    <span className="flex items-baseline gap-1.5 leading-none">
                      <span className="text-lg font-semibold tracking-tight">Spoke</span>
                      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
                        AI
                      </span>
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="space-y-1 p-3">
                  {NAV.map((item) => {
                    const active = item.match(location);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                          active
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                        data-testid={`link-mobile-nav-${item.label.toLowerCase()}`}
                      >
                        <Icon className={cn("h-4 w-4", active && "text-primary")} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
          <div className="flex min-w-0 flex-col">
            {breadcrumbs && breadcrumbs.length > 0 && (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="contents">
                      <BreadcrumbItem>
                        {i === breadcrumbs.length - 1 || !c.href ? (
                          <BreadcrumbPage className="text-xs">{c.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild className="text-xs">
                            <Link href={c.href}>{c.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {i < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                    </span>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}
            <h1 className="truncate text-base font-semibold tracking-tight" data-testid="text-page-title">
              {title}
            </h1>
          </div>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <NotificationBell />
            <RunScanButton />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label="Toggle theme"
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
