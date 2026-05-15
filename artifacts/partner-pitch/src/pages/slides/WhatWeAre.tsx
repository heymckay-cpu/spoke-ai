import DeckBackground from "@/components/DeckBackground";

export default function WhatWeAre() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">What we are</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        02
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[60vw] text-white">
          A focused cockpit for the wheel.
        </h2>
        <p className="text-[1.5vw] text-muted mt-[2.5vh] max-w-[58vw] leading-snug">
          Built for self-directed retail options traders, Level 2–3, running
          cash-secured puts on tickers they want to own and covered calls on the
          resulting shares. The product does three things well.
        </p>

        <div className="flex flex-col gap-[3.2vh] mt-[5vh] max-w-[78vw]">
          <div className="flex gap-[3vw] items-start">
            <div className="font-mono text-[1.1vw] text-primary font-semibold w-[3vw] pt-[0.6vh]">
              01
            </div>
            <div className="font-display font-semibold text-[1.7vw] w-[15vw] tracking-[-0.01em] text-white">
              Screens
            </div>
            <div className="text-[1.5vw] leading-[1.45] text-muted flex-1">
              Ranks high-yield, near-the-money cash-secured-put candidates by
              annualized return across the option chain.
            </div>
          </div>

          <div className="w-full h-px bg-line" />

          <div className="flex gap-[3vw] items-start">
            <div className="font-mono text-[1.1vw] text-primary font-semibold w-[3vw] pt-[0.6vh]">
              02
            </div>
            <div className="font-display font-semibold text-[1.7vw] w-[15vw] tracking-[-0.01em] text-white">
              Tracks
            </div>
            <div className="text-[1.5vw] leading-[1.45] text-muted flex-1">
              Open positions with IV-rank trends, earnings dates, near-expiry
              alerts, and a roll-suggestion engine that proposes the next leg.
            </div>
          </div>

          <div className="w-full h-px bg-line" />

          <div className="flex gap-[3vw] items-start">
            <div className="font-mono text-[1.1vw] text-primary font-semibold w-[3vw] pt-[0.6vh]">
              03
            </div>
            <div className="font-display font-semibold text-[1.7vw] w-[15vw] tracking-[-0.01em] text-white">
              Journals
            </div>
            <div className="text-[1.5vw] leading-[1.45] text-muted flex-1">
              Every closed trade, with realized yield, win rate, and per-ticker
              performance over time.
            </div>
          </div>
        </div>
      </div>

      <PageFooter page="02" />
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
