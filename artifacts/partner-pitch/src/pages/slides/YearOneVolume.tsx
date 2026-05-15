import DeckBackground from "@/components/DeckBackground";

export default function YearOneVolume() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">Year-one volume</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        04
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[60vw] text-white">
          Year-one planning numbers.
        </h2>
        <p className="text-[1.4vw] text-muted mt-[2vh] max-w-[58vw] leading-snug">
          Planning estimates, not commitments. We&rsquo;d rather under-promise
          than oversell.
        </p>

        <div className="mt-[4.5vh] max-w-[80vw]">
          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] pb-[1.5vh] border-b-[0.15vh] border-white/30 font-mono text-[0.85vw] uppercase tracking-[0.18em] text-muted">
            <div>Metric</div>
            <div className="text-right">Conservative</div>
            <div className="text-right text-primary font-semibold">Target</div>
          </div>

          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] py-[2.1vh] border-b border-line items-baseline">
            <div className="text-[1.45vw] text-text">Total registered users (EOY 1)</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-white">5,000</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-primary">15,000</div>
          </div>

          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] py-[2.1vh] border-b border-line items-baseline">
            <div className="text-[1.45vw] text-text">Monthly active users</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-white">1,500</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-primary">5,000</div>
          </div>

          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] py-[2.1vh] border-b border-line items-baseline">
            <div className="text-[1.45vw] text-text">Users who connect a brokerage account</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-white">600</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-primary">2,500</div>
          </div>

          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] py-[2.1vh] border-b border-line items-baseline">
            <div className="text-[1.45vw] text-text">Net new accounts opened because of the dashboard</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-white">150</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-primary">750</div>
          </div>

          <div className="grid grid-cols-[2.4fr_1fr_1fr] gap-x-[3vw] py-[2.1vh] items-baseline">
            <div className="text-[1.45vw] text-text">Avg options contracts / month per active connected user</div>
            <div className="text-right text-[1.9vw] font-display font-semibold tracking-[-0.02em] text-muted col-span-2">20–40</div>
          </div>
        </div>

        <div className="mt-[2.5vh] max-w-[70vw] text-[1.1vw] text-muted italic leading-[1.45]">
          Funnel assumption: ~40% of MAU connect a brokerage; of those, ~25%
          open a fresh account with the partner broker rather than link an
          existing one.
        </div>
      </div>

      <PageFooter page="04" />
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
