import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarClock,
  CreditCard,
  HelpCircle,
  LayoutGrid,
  LineChart,
  MessageSquare,
  Sparkles,
  Wallet,
  Briefcase,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "tip";

type IllustrationKind = "earnings-filter" | "advisor";

interface Block {
  kind: "p" | "ul" | "ol" | "callout" | "kv" | "code" | "illustration";
  text?: string;
  items?: string[];
  pairs?: { term: string; def: string }[];
  tone?: Tone;
  title?: string;
  illustration?: IllustrationKind;
}

interface Subsection {
  id: string;
  heading: string;
  blocks: Block[];
}

interface Section {
  id: string;
  title: string;
  icon: typeof BookOpen;
  intro?: string;
  subsections: Subsection[];
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: Sparkles,
    intro:
      "Spoke AI is an AI co-pilot for trading the wheel — selling cash-secured puts, getting assigned, then selling covered calls.",
    subsections: [
      {
        id: "what-is-the-wheel",
        heading: "What is the wheel?",
        blocks: [
          {
            kind: "p",
            text: "The wheel is a recurring options strategy: you sell cash-secured puts on stocks you'd be happy to own. If the put expires worthless, you keep the premium. If you're assigned, you take delivery of the shares and start selling covered calls against them. When those calls get assigned, you exit the shares — and the wheel begins again.",
          },
          {
            kind: "p",
            text: "Spoke AI screens the universe for high-quality short-put candidates, tracks every position you have open, and tells you when to roll, close, or take assignment — all backed by an AI assistant that can see your real portfolio.",
          },
        ],
      },
      {
        id: "the-five-tabs",
        heading: "The five tabs at a glance",
        blocks: [
          {
            kind: "kv",
            pairs: [
              { term: "Candidates", def: "Today's ranked short-put opportunities from your watchlist." },
              { term: "Chain", def: "Drill into a single ticker's option chain." },
              { term: "Positions", def: "Every open and closed sold-put trade, plus roll history." },
              { term: "Holdings", def: "Shares you own (often from assignment) and their P/L." },
              { term: "Ask", def: "Plain-English Q&A over your real portfolio data." },
              { term: "Settings", def: "Watchlist, screener parameters, alerts, and your plan." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "candidates",
    title: "Candidates page",
    icon: LayoutGrid,
    intro: "Where the screener surfaces the best short-put opportunities from your watchlist.",
    subsections: [
      {
        id: "candidate-columns",
        heading: "Reading the columns",
        blocks: [
          {
            kind: "kv",
            pairs: [
              { term: "TICKER", def: "The underlying stock. Click to jump straight into its option chain." },
              { term: "STRIKE", def: "The put's strike price — the price you'd pay per share if assigned." },
              { term: "DTE", def: "Days to expiration. Shorter = faster theta, more frequent decisions." },
              { term: "PREM", def: "Mid-price premium per share. Multiply by 100 for total credit per contract." },
              { term: "ANN %", def: "Annualized yield on the cash you're securing — lets you compare contracts of different durations apples-to-apples." },
              { term: "Δ (delta)", def: "Rough probability of finishing in-the-money. Lower delta = lower assignment risk and lower premium." },
              { term: "IV Rank", def: "Where current implied volatility sits in the last year's range. High IV rank = premium is rich relative to history." },
            ],
          },
        ],
      },
      {
        id: "earnings-filter",
        heading: "Earnings filter (Hide / Show only / Include)",
        blocks: [
          {
            kind: "p",
            text: "The pill control above the candidates list controls how candidates whose option expiry falls after the company's next earnings announcement are treated:",
          },
          {
            kind: "kv",
            pairs: [
              { term: "Hide", def: "Exclude any candidate with earnings before expiry. The safest default — earnings can cause large overnight gaps." },
              { term: "Show only", def: "Invert the filter and only list candidates that have earnings before expiry. Useful for hunting elevated-IV earnings premium plays." },
              { term: "Include", def: "Turn the filter off and show everything regardless of earnings." },
            ],
          },
          {
            kind: "illustration",
            illustration: "earnings-filter",
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Why the calendar-clock icon?",
            text: "The same icon appears on individual rows and in the notifications bell whenever earnings fall inside an option's window — so you can spot earnings-related risk at a glance.",
          },
        ],
      },
      {
        id: "scan-refresh",
        heading: "How scans refresh",
        blocks: [
          {
            kind: "p",
            text: "Scans run on demand from the Settings page (or automatically when you change parameters). Each scan respects a server-side cache TTL (default 60 minutes) so repeated runs don't hammer the data provider — change \"Cache TTL\" in Settings → Engine to tune freshness.",
          },
        ],
      },
    ],
  },
  {
    id: "chain",
    title: "Chain page",
    icon: LineChart,
    intro: "Inspect a single ticker's option chain and act on it.",
    subsections: [
      {
        id: "chain-layout",
        heading: "What's shown",
        blocks: [
          {
            kind: "p",
            text: "Pick a ticker and an expiration to see every put strike with bid, ask, mid, open interest, volume, and delta. Use the chain to double-check a contract from the Candidates page (or to look up strikes outside the screener's top-N) before placing the order in your broker.",
          },
        ],
      },
    ],
  },
  {
    id: "positions",
    title: "Positions page",
    icon: Wallet,
    intro: "Every sold-put trade you've opened, with live mark-to-market and roll guidance.",
    subsections: [
      {
        id: "position-columns",
        heading: "Open positions",
        blocks: [
          {
            kind: "p",
            text: "Open positions show current mark, unrealized P/L, days left, distance to strike, and a rolling assignment-risk indicator. The \"Live · Yahoo\" badge confirms the price was just refreshed from the live data feed (vs. a cached snapshot).",
          },
        ],
      },
      {
        id: "roll-advisor",
        heading: "Roll vs. Assignment advisor",
        blocks: [
          {
            kind: "p",
            text: "When a position approaches expiry or moves in-the-money, the Roll Advisor card surfaces a recommendation drawn from live chain data and your existing position — typically: roll forward to a later expiry, roll forward and down to a lower strike, close, or take assignment.",
          },
          {
            kind: "ul",
            items: [
              "Suggestions are advisory. Spoke AI never sends orders to your broker — you place the trade yourself.",
              "Concentration warnings appear when a roll or new candidate would push you past the per-ticker or per-sector caps you set in Settings.",
            ],
          },
          {
            kind: "illustration",
            illustration: "advisor",
          },
        ],
      },
    ],
  },
  {
    id: "holdings",
    title: "Holdings page",
    icon: Briefcase,
    intro: "Stocks you actually own (usually from assignment) and how they're performing.",
    subsections: [
      {
        id: "holdings-pnl",
        heading: "How P/L is calculated",
        blocks: [
          {
            kind: "p",
            text: "Each holding tracks cost basis (the assigned strike, net of any premium collected on the put that assigned you), current mark, unrealized P/L in dollars and percent, and the cumulative premium you've collected from any covered calls written against the position.",
          },
          {
            kind: "p",
            text: "Closing a holding (selling the shares) moves it into your closed-trade history with realized P/L, including all option premium captured along the way.",
          },
        ],
      },
    ],
  },
  {
    id: "ask",
    title: "Ask (AI assistant)",
    icon: MessageSquare,
    intro: "A read-only AI analyst with full visibility into your portfolio.",
    subsections: [
      {
        id: "ask-scope",
        heading: "What the AI can — and can't — see",
        blocks: [
          {
            kind: "ul",
            items: [
              "It can read your open and closed positions, holdings, latest screener results, roll history, and live quotes.",
              "It cannot place trades, cancel orders, or modify settings. Every tool it uses is read-only.",
              "Answers are based ONLY on data returned by those tools. If a tool returns nothing, the AI will say so plainly rather than make something up.",
            ],
          },
        ],
      },
      {
        id: "ask-prompts",
        heading: "Suggested prompts",
        blocks: [
          {
            kind: "p",
            text: "If you're not sure where to start, the empty state offers prompts like:",
          },
          {
            kind: "ul",
            items: [
              "Show me my worst-performing wheels this quarter",
              "Which open positions have earnings inside the DTE window?",
              "What's my realized premium on PLTR all-time?",
              "Top wheel candidates today, excluding earnings",
              "Annualized yield by ticker on closed trades",
              "Open positions sorted by assignment risk",
            ],
          },
        ],
      },
      {
        id: "ask-errors",
        heading: "Error states",
        blocks: [
          {
            kind: "kv",
            pairs: [
              { term: "AI rate limit reached", def: "Too many requests just now. Wait a minute and try again." },
              { term: "AI auth failed", def: "The AI provider rejected the request. The key may have rotated — try again in a moment." },
              { term: "Sign in required", def: "You need to be signed in to use the AI assistant." },
              { term: "AI timed out", def: "The model took too long to respond. Try a simpler question or retry." },
              { term: "AI features unavailable", def: "The AI provider isn't responding right now. Try again in a few minutes." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts & notifications",
    icon: Bell,
    intro: "Stay on top of in-the-money positions and approaching expiries.",
    subsections: [
      {
        id: "alert-triggers",
        heading: "What triggers an alert",
        blocks: [
          {
            kind: "ul",
            items: [
              "An open put goes in-the-money (price drops below the strike).",
              "A position is within your near-expiry window with no roll or close action taken yet.",
              "An earnings event lands inside an open contract's window after you opened it.",
            ],
          },
        ],
      },
      {
        id: "alert-controls",
        heading: "Where to see them and how to silence",
        blocks: [
          {
            kind: "p",
            text: "The bell icon in the top-right of the app shell shows a count of unread alerts. Click it for the dropdown, or visit the Settings page to enable email delivery and tune which categories you want to receive.",
          },
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "Account & billing",
    icon: CreditCard,
    intro: "Tiers, what's included, and how to upgrade.",
    subsections: [
      {
        id: "tiers",
        heading: "Tiers",
        blocks: [
          {
            kind: "p",
            text: "Spoke AI ships with a tiered plan structure. The Plan card at the top of Settings always shows your current tier, your usage for the month (scans run, AI questions asked), and a link to upgrade if you're approaching the cap.",
          },
        ],
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ & troubleshooting",
    icon: HelpCircle,
    subsections: [
      {
        id: "faq-ai-unavailable",
        heading: "“AI features unavailable / HTTP 502 Bad Gateway”",
        blocks: [
          {
            kind: "p",
            text: "Almost always a transient proxy hiccup between the browser and the API server. Reload the page and try again. If it persists for more than a few minutes, the upstream AI provider is likely overloaded — the AI tab will recover automatically once it returns.",
          },
        ],
      },
      {
        id: "faq-conversation-not-found",
        heading: "“Conversation not found”",
        blocks: [
          {
            kind: "p",
            text: "Your browser still has an old conversation id cached from a previous session that the database no longer has. The Ask tab clears this automatically on next page load — just refresh.",
          },
        ],
      },
      {
        id: "faq-scan-stuck",
        heading: "Scan results look stale",
        blocks: [
          {
            kind: "p",
            text: "Scans are cached server-side for the cache TTL you set in Settings → Engine. To force a fresh pull, save your settings (which always re-runs a scan with forceRefresh) or shorten the cache TTL.",
          },
        ],
      },
      {
        id: "faq-earnings-flag-missing",
        heading: "Why is the earnings flag missing on a ticker I know has earnings?",
        blocks: [
          {
            kind: "p",
            text: "The earnings calendar is best-effort and depends on the data provider publishing the date. If a date isn't yet confirmed by the source, no flag is shown — once it's published, the next scan will pick it up.",
          },
        ],
      },
    ],
  },
];

const ICON_CALLOUT: Record<Tone, typeof BookOpen> = {
  info: BookOpen,
  warning: AlertTriangle,
  tip: CalendarClock,
};

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-indigo-500/30 bg-indigo-500/5 text-indigo-100",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-100",
  tip: "border-emerald-500/30 bg-emerald-500/5 text-emerald-100",
};

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-sm leading-relaxed text-slate-300">{block.text}</p>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300 marker:text-slate-600">
          {(block.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300 marker:text-slate-600">
          {(block.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "kv":
      return (
        <dl className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-card/30">
          {(block.pairs ?? []).map((p, i) => (
            <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-foreground">{p.term}</dt>
              <dd className="text-sm text-slate-400">{p.def}</dd>
            </div>
          ))}
        </dl>
      );
    case "callout": {
      const tone = block.tone ?? "info";
      const Icon = ICON_CALLOUT[tone];
      return (
        <div
          className={cn(
            "flex gap-3 rounded-lg border px-4 py-3 text-sm",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
          <div className="space-y-1">
            {block.title && <div className="font-semibold">{block.title}</div>}
            {block.text && <p className="leading-relaxed opacity-90">{block.text}</p>}
          </div>
        </div>
      );
    }
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-border bg-card/40 p-3 text-xs text-slate-300">
          <code>{block.text}</code>
        </pre>
      );
    case "illustration":
      return <Illustration kind={block.illustration ?? "earnings-filter"} />;
  }
}

function Illustration({ kind }: { kind: IllustrationKind }) {
  if (kind === "earnings-filter") {
    return (
      <figure
        className="space-y-2 rounded-lg border border-border bg-card/40 p-4"
        data-testid="illustration-earnings-filter"
      >
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["Hide", "Show only", "Include"] as const).map((label, i) => (
            <span
              key={label}
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                i === 0
                  ? "bg-primary/15 text-primary"
                  : "bg-card text-muted-foreground",
                i > 0 && "border-l border-border",
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <figcaption className="text-xs text-muted-foreground">
          The earnings-filter pill above the candidates list. The active mode is highlighted.
        </figcaption>
      </figure>
    );
  }
  // advisor
  return (
    <figure
      className="space-y-3 rounded-lg border border-border bg-card/40 p-4"
      data-testid="illustration-advisor"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">
            Roll advisor
          </div>
          <div className="text-sm font-medium text-foreground">AAPL · short put</div>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          ITM
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Suggested</div>
          <div className="font-medium text-foreground">Roll → +28d</div>
        </div>
        <div>
          <div className="text-muted-foreground">Net credit</div>
          <div className="font-medium text-emerald-400 tabular-nums">+$1.40</div>
        </div>
        <div>
          <div className="text-muted-foreground">New strike</div>
          <div className="font-medium text-foreground tabular-nums">$185</div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        A simplified view of the Roll Advisor card on the Positions page.
      </figcaption>
    </figure>
  );
}

export function ResourcesPage() {
  const [location, setLocation] = useLocation();
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  const allIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of SECTIONS) {
      ids.push(s.id);
      for (const sub of s.subsections) ids.push(sub.id);
    }
    return ids;
  }, []);

  // Highlight the section the user is currently reading and keep the URL
  // hash in sync so deep-link copy from the address bar always works.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const nextId = visible[0]?.target.id;
        if (!nextId) return;
        setActiveId((prev) => {
          if (prev === nextId) return prev;
          if (typeof window !== "undefined" && window.history?.replaceState) {
            const { pathname, search } = window.location;
            window.history.replaceState(null, "", `${pathname}${search}#${nextId}`);
          }
          return nextId;
        });
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 1] },
    );
    for (const id of allIds) {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [allIds]);

  // Honour deep links like /dashboard/resources#earnings-filter on first load.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = sectionRefs.current[hash];
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  }, []);

  const goTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", `${location}#${id}`);
    } else {
      setLocation(`${location}#${id}`, { replace: true });
    }
  };

  return (
    <AppShell title="Resources" breadcrumbs={[{ label: "Resources" }]}>
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[220px_1fr]" data-testid="resources-page">
        {/* Sticky table of contents */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <details open>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border/60 bg-card/30 px-3 py-2 text-sm font-medium text-foreground lg:hidden">
              <BookOpen className="h-4 w-4 text-primary" />
              On this page
            </summary>
            <nav className="mt-3 space-y-1 lg:mt-0" data-testid="resources-toc">
              <div className="hidden px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
                On this page
              </div>
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const sectionActive = activeId === s.id || s.subsections.some((sub) => sub.id === activeId);
                return (
                  <div key={s.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => goTo(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                        sectionActive
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                      data-testid={`toc-${s.id}`}
                    >
                      <Icon className={cn("h-4 w-4", sectionActive ? "text-primary" : "text-muted-foreground")} />
                      {s.title}
                    </button>
                  </div>
                );
              })}
            </nav>
          </details>
        </aside>

        {/* Long-form content */}
        <article className="min-w-0 space-y-12 pb-24">
          <header className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/30 px-3 py-1 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              In-app user manual
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Resources</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Everything Spoke AI does, explained in one place. Use the table of contents to jump
              around, or read top to bottom.
            </p>
          </header>

          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <section
                key={s.id}
                id={s.id}
                ref={(el) => {
                  sectionRefs.current[s.id] = el;
                }}
                className="scroll-mt-24 space-y-6"
                data-testid={`section-${s.id}`}
              >
                <div className="space-y-2 border-b border-border/60 pb-4">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">{s.title}</h2>
                  </div>
                  {s.intro && <p className="text-sm text-muted-foreground">{s.intro}</p>}
                </div>

                <div className="space-y-8">
                  {s.subsections.map((sub) => (
                    <div
                      key={sub.id}
                      id={sub.id}
                      ref={(el) => {
                        sectionRefs.current[sub.id] = el;
                      }}
                      className="scroll-mt-24 space-y-3"
                    >
                      <h3 className="text-base font-semibold text-foreground">
                        <a
                          href={`#${sub.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            goTo(sub.id);
                          }}
                          className="hover:text-primary"
                        >
                          {sub.heading}
                        </a>
                      </h3>
                      <div className="space-y-3">
                        {sub.blocks.map((b, i) => (
                          <BlockView key={i} block={b} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </article>
      </div>
    </AppShell>
  );
}
