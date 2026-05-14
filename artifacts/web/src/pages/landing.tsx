import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Gauge,
  LineChart,
  MessageSquare,
  Radar,
  RefreshCcw,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";
import spokeMark from "@/assets/spoke-mark.png";
import { CAPABILITIES, type Tier } from "@workspace/tiers";

const NEWS_OUTLETS = [
  { name: "Yahoo Finance", className: "font-serif italic text-[26px] tracking-tight" },
  { name: "Business Insider", className: "font-sans font-black uppercase text-[22px] tracking-[0.02em]" },
  { name: "The Daily Scanner", className: "font-serif uppercase text-[20px] tracking-[0.18em]" },
  { name: "Digital Journal", className: "font-sans font-bold uppercase text-[22px] tracking-[0.05em]" },
  { name: "New York Weekly", className: "font-serif italic text-[24px] tracking-tight" },
  { name: "MarketWatch", className: "font-sans font-extrabold lowercase text-[24px] tracking-tight" },
];

interface Feature {
  icon: typeof Sparkles;
  title: string;
  copy: string;
  preview: () => React.ReactElement;
}

const Brand = () => (
  <div className="flex items-center gap-3">
    <img src={spokeMark} alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
    <span className="flex items-baseline gap-1.5 leading-none">
      <span className="text-xl font-semibold tracking-tight text-white">Spoke</span>
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-indigo-300">
        AI
      </span>
    </span>
  </div>
);

function ScreenerPreview() {
  const rows = [
    { t: "AAPL", strike: 175, dte: 32, prem: 2.34, ann: 21.4, delta: -0.28 },
    { t: "MSFT", strike: 405, dte: 28, prem: 5.10, ann: 19.8, delta: -0.25 },
    { t: "NVDA", strike: 120, dte: 21, prem: 1.85, ann: 26.7, delta: -0.31 },
    { t: "AMD", strike: 145, dte: 35, prem: 3.20, ann: 22.1, delta: -0.27 },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 text-[11px] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 text-slate-400">
        <span className="font-medium tracking-wide">Wheel Candidates</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
          Live · Yahoo
        </span>
      </div>
      <table className="w-full text-left tabular-nums">
        <thead className="text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-1.5">Ticker</th>
            <th className="px-3 py-1.5">Strike</th>
            <th className="px-3 py-1.5">DTE</th>
            <th className="px-3 py-1.5">Prem</th>
            <th className="px-3 py-1.5">Ann %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t} className="border-t border-white/5 text-slate-200">
              <td className="px-3 py-1.5 font-semibold text-indigo-300">{r.t}</td>
              <td className="px-3 py-1.5">${r.strike}</td>
              <td className="px-3 py-1.5">{r.dte}d</td>
              <td className="px-3 py-1.5">${r.prem.toFixed(2)}</td>
              <td className="px-3 py-1.5 text-emerald-300">{r.ann.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RollAdvisorPreview() {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Bot className="h-3.5 w-3.5 text-indigo-300" />
        <span>Roll Advisor · NVDA 120P · 8d</span>
      </div>
      <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-slate-200">
        <div className="text-[10px] uppercase tracking-wider text-indigo-300">
          Recommendation
        </div>
        <div className="mt-1 font-medium">Roll out 4 weeks to 115P for $0.95 credit</div>
        <div className="mt-2 text-[11px] text-slate-400">
          Lowers assignment risk by 38%, preserves 18.4% annualized yield, keeps
          delta within target band.
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
        <div className="rounded-md border border-white/5 bg-white/5 px-2 py-1.5">
          <div className="text-slate-500">Δ now</div>
          <div className="text-rose-300">-0.46</div>
        </div>
        <div className="rounded-md border border-white/5 bg-white/5 px-2 py-1.5">
          <div className="text-slate-500">Δ after</div>
          <div className="text-emerald-300">-0.27</div>
        </div>
        <div className="rounded-md border border-white/5 bg-white/5 px-2 py-1.5">
          <div className="text-slate-500">Net credit</div>
          <div className="text-emerald-300">+$95</div>
        </div>
      </div>
    </div>
  );
}

function PositionsPreview() {
  const pos = [
    { t: "AAPL", k: 175, dte: 18, pnl: 142, ok: true },
    { t: "TSLA", k: 220, dte: 4, pnl: -32, ok: false },
    { t: "META", k: 480, dte: 25, pnl: 78, ok: true },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Open positions</span>
        <span className="text-slate-500">3 of 12</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {pos.map((p) => (
          <div
            key={p.t}
            className="flex items-center justify-between rounded-md border border-white/5 bg-white/5 px-3 py-2 text-xs"
          >
            <div>
              <div className="font-semibold text-indigo-300">{p.t}</div>
              <div className="text-[10px] text-slate-500">${p.k}P · {p.dte}d</div>
            </div>
            <div className="text-right tabular-nums">
              <div className={p.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {p.pnl >= 0 ? "+" : ""}${p.pnl}
              </div>
              <div
                className={`text-[10px] ${p.ok ? "text-slate-500" : "text-amber-300"}`}
              >
                {p.ok ? "On track" : "At risk"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskPreview() {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <MessageSquare className="h-3.5 w-3.5 text-indigo-300" />
        <span>Portfolio Q&amp;A</span>
      </div>
      <div className="mt-2 space-y-2 text-xs">
        <div className="ml-auto w-fit max-w-[80%] rounded-lg rounded-tr-sm bg-indigo-500/15 px-2.5 py-1.5 text-slate-200">
          What's my biggest assignment risk this week?
        </div>
        <div className="w-fit max-w-[90%] rounded-lg rounded-tl-sm border border-white/10 bg-white/5 px-2.5 py-1.5 text-slate-200">
          <span className="text-indigo-300">TSLA 220P</span> expires in 4 days,
          delta -0.52, currently $4 ITM. Consider rolling to next month for a
          $1.10 credit.
        </div>
      </div>
    </div>
  );
}

function ConcentrationPreview() {
  const sectors = [
    { name: "Tech", pct: 38, warn: true },
    { name: "Cons. Disc.", pct: 22 },
    { name: "Health", pct: 18 },
    { name: "Finance", pct: 14 },
    { name: "Energy", pct: 8 },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Sector exposure</span>
        <Shield className="h-3.5 w-3.5 text-amber-300" />
      </div>
      <div className="mt-2 space-y-1.5">
        {sectors.map((s) => (
          <div key={s.name} className="text-[11px]">
            <div className="flex justify-between text-slate-300">
              <span>{s.name}</span>
              <span className={s.warn ? "text-amber-300" : "text-slate-400"}>
                {s.pct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full ${
                  s.warn ? "bg-amber-400/70" : "bg-indigo-400/70"
                }`}
                style={{ width: `${s.pct * 2.2}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreshnessPreview() {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 backdrop-blur">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Data freshness</span>
        <RefreshCcw className="h-3.5 w-3.5 text-emerald-300" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="text-emerald-300">Live</div>
          <div className="mt-0.5 text-slate-300">Quotes · 0.4s</div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="text-emerald-300">Live</div>
          <div className="mt-0.5 text-slate-300">Greeks · 1s</div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="text-emerald-300">3m ago</div>
          <div className="mt-0.5 text-slate-300">IV rank</div>
        </div>
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="text-emerald-300">EOD</div>
          <div className="mt-0.5 text-slate-300">Sector map</div>
        </div>
      </div>
    </div>
  );
}

const FEATURES: Feature[] = [
  {
    icon: Radar,
    title: "Candidate Screener",
    copy: "Rank short-put wheel candidates across the S&P with Black-Scholes greeks, IV rank context, and your own delta and DTE bands.",
    preview: ScreenerPreview,
  },
  {
    icon: Bot,
    title: "Roll Advisor",
    copy: "AI recommends roll vs. assignment vs. close on every at-risk position with side-by-side annualized yield comparisons.",
    preview: RollAdvisorPreview,
  },
  {
    icon: Wallet,
    title: "Positions Tracking",
    copy: "Live P&L, days-to-expiry, and assignment-risk flags for every open contract — with one-click rolls and journaling.",
    preview: PositionsPreview,
  },
  {
    icon: MessageSquare,
    title: "Portfolio Q&A",
    copy: "Ask plain-English questions about your book — concentration, expirations, premium captured — and get streamed answers.",
    preview: AskPreview,
  },
  {
    icon: Shield,
    title: "Concentration Risk",
    copy: "Per-ticker and per-sector cash-at-risk caps that flag trades before they over-concentrate the portfolio.",
    preview: ConcentrationPreview,
  },
  {
    icon: Gauge,
    title: "Data Freshness",
    copy: "Every quote, greek, and IV reading carries a freshness badge so you always know if you're trading on stale data.",
    preview: FreshnessPreview,
  },
];

interface PricingTier {
  tier: Tier;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  highlights: string[];
  highlight?: boolean;
}

function getPricingTiers(): PricingTier[] {
  const proCaps = Object.values(CAPABILITIES).filter((c) => c.tier === "pro");
  const ultraCaps = Object.values(CAPABILITIES).filter((c) => c.tier === "ultra");
  return [
    {
      tier: "free",
      name: "Free",
      price: "$0",
      cadence: "/month",
      blurb: "The wheel basics on a sample universe.",
      highlights: [
        "Watchlist screener (sample universe)",
        "Black-Scholes greeks & IV rank",
        "Manual position tracking",
        "Delayed quotes",
      ],
    },
    {
      tier: "pro",
      name: "Pro",
      price: "$19",
      cadence: "/month",
      blurb: "Everything you need to run the wheel seriously.",
      highlights: [
        "Everything in Free",
        ...proCaps.map((c) => c.label),
        "Email alerts for assignment & near-expiry",
      ],
      highlight: true,
    },
    {
      tier: "ultra",
      name: "Ultra",
      price: "$49",
      cadence: "/month",
      blurb: "AI advisor + live brokerage-grade data.",
      highlights: [
        "Everything in Pro",
        ...ultraCaps.map((c) => c.label),
      ],
    },
  ];
}

export function LandingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [, navigate] = useLocation();
  const basePath = (import.meta as unknown as { env: { BASE_URL: string } }).env
    .BASE_URL.replace(/\/+$/, "");

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/dashboard");
    }
  }, [isLoaded, isSignedIn, navigate]);

  const goLogin = () => navigate("/sign-in");
  const tiers = getPricingTiers();
  const marqueeRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-slate-950 text-slate-100"
      data-testid="page-landing"
    >
      {/* Ambient page background — grid + diagonal light beam + starfield */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.5) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 1100px 800px at 50% 0%, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 1100px 800px at 50% 0%, black 40%, transparent 80%)",
          }}
        />
        {/* Soft color washes */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(1200px 600px at 80% -200px, rgba(99,102,241,0.18), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(56,189,248,0.10), transparent 60%)",
          }}
        />
        {/* Diagonal light beam from top-left, à la Lumino */}
        <div
          className="absolute -left-[20%] -top-[10%] h-[140%] w-[55%] rotate-[18deg] opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, rgba(165,180,252,0.10) 35%, rgba(165,180,252,0.22) 50%, rgba(165,180,252,0.10) 65%, transparent 100%)",
            filter: "blur(36px)",
          }}
        />
        <div
          className="absolute -left-[10%] -top-[5%] h-[120%] w-[20%] rotate-[18deg] opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, rgba(199,210,254,0.18) 50%, transparent 100%)",
            filter: "blur(20px)",
          }}
        />
        {/* Starfield */}
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.9), transparent 60%)," +
              "radial-gradient(1px 1px at 24% 62%, rgba(255,255,255,0.7), transparent 60%)," +
              "radial-gradient(1.5px 1.5px at 38% 22%, rgba(255,255,255,0.95), transparent 60%)," +
              "radial-gradient(1px 1px at 47% 78%, rgba(255,255,255,0.6), transparent 60%)," +
              "radial-gradient(1px 1px at 58% 14%, rgba(255,255,255,0.85), transparent 60%)," +
              "radial-gradient(1.5px 1.5px at 71% 48%, rgba(255,255,255,0.9), transparent 60%)," +
              "radial-gradient(1px 1px at 82% 32%, rgba(255,255,255,0.7), transparent 60%)," +
              "radial-gradient(1px 1px at 91% 70%, rgba(255,255,255,0.8), transparent 60%)," +
              "radial-gradient(1px 1px at 6% 82%, rgba(255,255,255,0.55), transparent 60%)," +
              "radial-gradient(1px 1px at 33% 92%, rgba(255,255,255,0.55), transparent 60%)," +
              "radial-gradient(1px 1px at 66% 88%, rgba(255,255,255,0.55), transparent 60%)," +
              "radial-gradient(1px 1px at 88% 8%, rgba(255,255,255,0.65), transparent 60%)",
            backgroundSize: "100% 1400px",
            backgroundRepeat: "repeat-y",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%)",
          }}
        />
      </div>
      <div className="relative">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Brand />
          <nav className="hidden items-center gap-10 text-base text-slate-300 md:flex">
            <a href="#features" className="hover:text-white" data-testid="link-nav-features">
              Features
            </a>
            <a href="#pricing" className="hover:text-white" data-testid="link-nav-pricing">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={goLogin}
              className="rounded-md px-4 py-2 text-base text-slate-300 hover:text-white"
              data-testid="button-nav-signin"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={goLogin}
              className="rounded-md bg-indigo-500 px-4 py-2 text-base font-medium text-white shadow-[0_0_30px_-5px_rgba(99,102,241,0.6)] transition hover:bg-indigo-400"
              data-testid="button-nav-getstarted"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
              AI-assisted wheel trading
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Trade the wheel,{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">
                smarter.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 md:text-lg">
              Spoke AI screens short-put candidates, tracks every position in
              real time, and tells you when to roll, close, or take assignment
              — backed by a portfolio-aware AI co-pilot.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_40px_-5px_rgba(99,102,241,0.7)] transition hover:bg-indigo-400"
                data-testid="button-hero-getstarted"
              >
                Get started free <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
                data-testid="button-hero-signin"
              >
                Sign in
              </button>
            </div>
          </div>

          {/* Hero product screenshot */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute inset-x-10 -top-8 -bottom-8 rounded-[2rem] bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-sky-500/20 blur-3xl" />
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/80 p-2 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                <span className="ml-3 text-xs text-slate-500">spoke.ai/dashboard</span>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-950 p-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <ScreenerPreview />
                </div>
                <div className="space-y-3">
                  <RollAdvisorPreview />
                  <FreshnessPreview />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <section
        className="relative border-b border-white/5 py-12"
        aria-label="Featured in"
      >
        <div className="mx-auto max-w-5xl px-6">
          <div
            ref={marqueeRef}
            className="group relative overflow-hidden"
            data-testid="marquee-news"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0, black 12%, black 88%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, black 12%, black 88%, transparent 100%)",
            }}
          >
            <div className="flex w-max animate-[marquee_36s_linear_infinite] items-center group-hover:[animation-play-state:paused]">
              {[...NEWS_OUTLETS, ...NEWS_OUTLETS].map((outlet, i) => (
                <span
                  key={`${outlet.name}-${i}`}
                  className={`shrink-0 whitespace-nowrap pr-20 text-slate-300/70 transition hover:text-slate-100 ${outlet.className}`}
                >
                  {outlet.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </section>

      {/* Features */}
      <section
        id="features"
        className="border-b border-white/5 py-24"
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Everything the wheel actually needs
            </h2>
            <p className="mt-4 text-slate-400">
              Six tools, one workflow — from screening tomorrow's candidates to
              defending today's at-risk positions.
            </p>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Preview = f.preview;
              return (
                <div
                  key={f.title}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-indigo-400/30 hover:bg-white/[0.04]"
                  data-testid={`card-feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-md border border-indigo-400/20 bg-indigo-500/10 p-1.5 text-indigo-300">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-base font-semibold text-white">{f.title}</h3>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">{f.copy}</p>
                  <div className="mt-5">
                    <Preview />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-white/5 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Simple pricing
            </h2>
            <p className="mt-4 text-slate-400">
              Start free. Upgrade when you want AI advisor and live data.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {tiers.map((t) => (
              <div
                key={t.tier}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  t.highlight
                    ? "border-indigo-400/40 bg-indigo-500/[0.07] shadow-[0_0_60px_-15px_rgba(99,102,241,0.5)]"
                    : "border-white/10 bg-white/[0.02]"
                }`}
                data-testid={`card-pricing-${t.tier}`}
              >
                {t.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}
                <div className="text-sm font-medium uppercase tracking-wider text-indigo-300">
                  {t.name}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-white">{t.price}</span>
                  <span className="text-sm text-slate-500">{t.cadence}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{t.blurb}</p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {t.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={goLogin}
                  className={`mt-8 w-full rounded-md px-4 py-2.5 text-sm font-medium transition ${
                    t.highlight
                      ? "bg-indigo-500 text-white hover:bg-indigo-400"
                      : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                  data-testid={`button-pricing-${t.tier}`}
                >
                  {t.tier === "free" ? "Get started free" : "Start " + t.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-sky-500/10 p-12"
            style={{ boxShadow: "0 0 90px -20px rgba(99,102,241,0.4)" }}
          >
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Start trading the wheel smarter
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">
              Connect in seconds. No credit card required.
            </p>
            <button
              type="button"
              onClick={goLogin}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              data-testid="button-cta-getstarted"
            >
              Get started free <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
          <Brand />
          <div className="flex gap-6">
            <a href="#features" className="hover:text-slate-300">
              Features
            </a>
            <a href="#pricing" className="hover:text-slate-300">
              Pricing
            </a>
          </div>
          <div>© {new Date().getFullYear()} Spoke AI</div>
        </div>
      </footer>
      </div>
    </div>
  );
}

export default LandingPage;
