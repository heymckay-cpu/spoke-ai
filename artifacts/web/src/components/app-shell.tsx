import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Briefcase, LayoutGrid, LineChart, LogOut, Menu, MessageSquare, Settings as SettingsIcon, Moon, Sun, Wallet } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
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
    href: "/dashboard",
    label: "Candidates",
    icon: LayoutGrid,
    match: (l) => l === "/dashboard" || l === "/dashboard/",
  },
  {
    href: "/dashboard/chain",
    label: "Chain",
    icon: LineChart,
    match: (l) => l.startsWith("/dashboard/chain"),
  },
  {
    href: "/dashboard/positions",
    label: "Positions",
    icon: Wallet,
    match: (l) => l.startsWith("/dashboard/positions"),
  },
  {
    href: "/dashboard/holdings",
    label: "Holdings",
    icon: Briefcase,
    match: (l) => l.startsWith("/dashboard/holdings"),
  },
  {
    href: "/dashboard/ask",
    label: "Ask",
    icon: MessageSquare,
    match: (l) => l.startsWith("/dashboard/ask"),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (l) => l.startsWith("/dashboard/settings"),
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AppShell({ title, breadcrumbs, actions, children }: AppShellProps) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ||
    "U";
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "Account";

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
            {(() => {
              const lastMatchesTitle =
                breadcrumbs &&
                breadcrumbs.length > 0 &&
                breadcrumbs[breadcrumbs.length - 1].label === title;
              const crumbsToShow = lastMatchesTitle
                ? breadcrumbs!.slice(0, -1)
                : breadcrumbs ?? [];
              return crumbsToShow.length > 0 ? (
                <Breadcrumb>
                  <BreadcrumbList>
                    {crumbsToShow.map((c, i) => (
                      <span key={`${c.label}-${i}`} className="contents">
                        <BreadcrumbItem>
                          {i === crumbsToShow.length - 1 || !c.href ? (
                            <BreadcrumbPage className="text-xs">{c.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild className="text-xs">
                              <Link href={c.href}>{c.label}</Link>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {i < crumbsToShow.length - 1 && <BreadcrumbSeparator />}
                      </span>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              ) : null;
            })()}
            <h1 className="truncate text-base font-semibold tracking-tight" data-testid="text-page-title">
              {title}
            </h1>
          </div>
          </div>
          <div className="flex items-center gap-2">
            {health.data?.provider && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium tabular-nums sm:px-2.5",
                  health.data.live
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                )}
                data-testid="badge-data-provider"
                title={
                  health.data.live
                    ? `Live quotes from ${health.data.provider}`
                    : `Delayed quotes from ${health.data.provider}`
                }
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    health.data.live ? "bg-emerald-500" : "bg-amber-500",
                  )}
                  aria-hidden="true"
                />
                {health.data.live ? "Live" : "Delayed"}
                <span className="hidden text-muted-foreground sm:inline">·</span>
                <span className="hidden capitalize sm:inline">{health.data.provider}</span>
              </span>
            )}
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
            {user && (
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-1 py-1 pr-2">
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                    {initials}
                  </span>
                )}
                <span
                  className="hidden max-w-[10rem] truncate text-xs font-medium md:inline"
                  data-testid="text-user-name"
                  title={displayName}
                >
                  {displayName}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  aria-label="Sign out"
                  data-testid="button-sign-out"
                  className="h-6 w-6"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
