import DeckBackground from "@/components/DeckBackground";

export default function Cover() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">
          Partnership pitch · Tradier &amp; Alpaca
        </div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        01
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10 mt-[6vh]">
        <div className="text-[1.1vw] uppercase tracking-[0.22em] text-primary font-semibold mb-[3vh]">
          Spoke AI
        </div>
        <h1 className="font-display font-bold text-[8vw] leading-[0.95] tracking-[-0.035em] m-0 max-w-[78vw] text-white">
          Trade the wheel,
          <span className="block text-primary">smarter.</span>
        </h1>
        <p className="text-[1.9vw] font-normal text-muted mt-[4vh] max-w-[55vw] leading-snug">
          A focused web cockpit for retail options traders running cash-secured
          puts, covered calls, and disciplined rolls.
        </p>
      </div>

      <div className="flex flex-row gap-[7vw] border-t border-line pt-[3vh] mt-auto font-mono text-[0.95vw] text-muted relative z-10">
        <div>
          <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
            Date
          </div>
          <div className="text-text">May 2026</div>
        </div>
        <div>
          <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
            Prepared for
          </div>
          <div className="text-text">Tradier · Alpaca partnerships</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
            Status
          </div>
          <div className="text-text font-semibold">External</div>
        </div>
      </div>
    </div>
  );
}
