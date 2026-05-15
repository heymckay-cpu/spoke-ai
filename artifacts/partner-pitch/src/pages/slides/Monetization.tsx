import DeckBackground from "@/components/DeckBackground";

export default function Monetization() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">How we make money</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        05
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[60vw] text-white">
          SaaS subscription, paid by the user.
        </h2>
        <p className="text-[1.4vw] text-muted mt-[2vh] max-w-[60vw] leading-snug">
          No order-flow, no spreads, no float. Incentives stay aligned with the
          user and the regulatory footprint stays small.
        </p>

        <div className="grid grid-cols-3 gap-[2.2vw] mt-[5vh] max-w-[80vw]">
          <div className="bg-surface backdrop-blur-sm border border-line p-[2.4vw] flex flex-col">
            <div className="font-mono text-[0.85vw] uppercase tracking-[0.18em] text-muted mb-[1.5vh]">
              Tier 01
            </div>
            <div className="font-display font-semibold text-[2.4vw] tracking-[-0.02em] leading-[1.05] text-white">
              Free
            </div>
            <div className="font-mono text-[1.1vw] text-muted mt-[1vh]">
              $0
            </div>
            <div className="text-[1.25vw] text-muted leading-[1.5] mt-[2.5vh]">
              Screener with delayed data, journaling, one connected position.
            </div>
          </div>

          <div className="bg-primary text-slate-950 p-[2.4vw] flex flex-col relative">
            <div className="absolute top-[1.5vh] right-[1.5vw] font-mono text-[0.75vw] uppercase tracking-[0.18em] text-slate-950/70">
              Launch tier
            </div>
            <div className="font-mono text-[0.85vw] uppercase tracking-[0.18em] text-slate-950/70 mb-[1.5vh]">
              Tier 02
            </div>
            <div className="font-display font-semibold text-[2.4vw] tracking-[-0.02em] leading-[1.05]">
              Pro
            </div>
            <div className="font-mono text-[1.1vw] text-slate-950/80 mt-[1vh]">
              $15 / mo · $144 / yr
            </div>
            <div className="text-[1.25vw] text-slate-950/85 leading-[1.5] mt-[2.5vh]">
              Live screener, unlimited positions, roll engine, alerts, broker
              connection.
            </div>
          </div>

          <div className="bg-surface backdrop-blur-sm border border-line p-[2.4vw] flex flex-col">
            <div className="font-mono text-[0.85vw] uppercase tracking-[0.18em] text-muted mb-[1.5vh]">
              Tier 03
            </div>
            <div className="font-display font-semibold text-[2.4vw] tracking-[-0.02em] leading-[1.05] text-white">
              Team
            </div>
            <div className="font-mono text-[1.1vw] text-muted mt-[1vh]">
              Future
            </div>
            <div className="text-[1.25vw] text-muted leading-[1.5] mt-[2.5vh]">
              Small advisor and coaching groups. Not in year-one scope.
            </div>
          </div>
        </div>

        <div className="mt-[4vh] max-w-[70vw] text-[1.35vw] leading-[1.5] text-text">
          We do <span className="text-primary font-semibold">not</span> monetize
          order flow, spreads, or float — and we have no plans to.
        </div>
      </div>

      <PageFooter page="05" />
    </div>
  );
}

function PageFooter({ page }: { page: string }) {
  return (
    <div className="flex flex-row gap-[7vw] border-t border-line pt-[3vh] mt-auto font-mono text-[0.95vw] text-muted relative z-10">
      <div>
        <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
          Date
        </div>
        <div className="text-text">May 2026</div>
      </div>
      <div>
        <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
          From
        </div>
        <div className="text-text">Spoke AI</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
          Page
        </div>
        <div className="text-text font-semibold">{page}</div>
      </div>
    </div>
  );
}
