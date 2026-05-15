import DeckBackground from "@/components/DeckBackground";

export default function ThankYou() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">Thank you</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        08
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10 mt-[2vh]">
        <h2 className="font-display font-semibold text-[6vw] leading-[1.0] tracking-[-0.035em] m-0 max-w-[78vw] text-white">
          Let&rsquo;s build the cockpit
          <span className="block text-primary">on top of your rails.</span>
        </h2>
        <p className="text-[1.6vw] text-muted mt-[3.5vh] max-w-[55vw] leading-snug">
          Happy to send the one-page brief ahead of the call, or jump straight
          into sandbox onboarding when you&rsquo;re ready.
        </p>

        <div className="flex gap-[8vw] mt-[7vh]">
          <div>
            <div className="text-[0.95vw] text-muted/70 uppercase tracking-[0.18em] font-semibold mb-[1.4vh]">
              Reach out
            </div>
            <div className="text-[1.7vw] font-display font-semibold text-white tracking-[-0.01em]">
              partners@spoke.ai
            </div>
            <div className="text-[1.25vw] text-muted mt-[1vh] font-mono">
              spoke.ai
            </div>
          </div>
          <div>
            <div className="text-[0.95vw] text-muted/70 uppercase tracking-[0.18em] font-semibold mb-[1.4vh]">
              Companion doc
            </div>
            <div className="text-[1.4vw] text-text leading-[1.45] max-w-[24vw]">
              Internal brokerage evaluation available on request.
            </div>
          </div>
        </div>
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
            From
          </div>
          <div className="text-text">Spoke AI</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-muted/70 mb-[0.6vh] uppercase text-[0.75vw] tracking-[0.15em]">
            Page
          </div>
          <div className="text-text font-semibold">08</div>
        </div>
      </div>
    </div>
  );
}
