import DeckBackground from "@/components/DeckBackground";

export default function WhoUsesIt() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">Who uses it</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        03
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[68vw] text-white">
          Self-directed options traders, already at a broker.
        </h2>
        <p className="text-[1.5vw] text-muted mt-[2.5vh] max-w-[60vw] leading-snug">
          Mostly US-based, Level 2–3, comfortable with a Robinhood-style
          preview-then-confirm ticket. Two segments matter for partners.
        </p>

        <div className="grid grid-cols-2 gap-[4vw] mt-[5.5vh] max-w-[78vw]">
          <div className="flex flex-col border-l-[0.25vh] border-primary pl-[1.5vw]">
            <div className="font-mono text-[0.85vw] uppercase tracking-[0.18em] text-primary font-semibold mb-[1.2vh]">
              Segment 01
            </div>
            <div className="font-display font-semibold text-[2.1vw] tracking-[-0.015em] leading-[1.1] text-white">
              Income-focused wheelers
            </div>
            <div className="text-[1.4vw] text-muted leading-[1.45] mt-[2vh]">
              5–25 concurrent positions on liquid large caps and ETFs. Want
              steady yield and a clean view of every open leg.
            </div>
          </div>

          <div className="flex flex-col border-l-[0.25vh] border-primary pl-[1.5vw]">
            <div className="font-mono text-[0.85vw] uppercase tracking-[0.18em] text-primary font-semibold mb-[1.2vh]">
              Segment 02
            </div>
            <div className="font-display font-semibold text-[2.1vw] tracking-[-0.015em] leading-[1.1] text-white">
              Active rollers
            </div>
            <div className="text-[1.4vw] text-muted leading-[1.45] mt-[2vh]">
              One-screen visibility into roll opportunities before expiration
              Friday. Lives in the chain on Thursdays and Fridays.
            </div>
          </div>
        </div>

        <div className="mt-[5vh] max-w-[70vw] text-[1.35vw] leading-[1.5] text-text">
          They <span className="text-primary font-semibold">already hold a brokerage account</span>{" "}
          (or will open one if the integration is good). They want a better
          cockpit on top of the broker they trust — not a new primary broker.
        </div>
      </div>

      <PageFooter page="03" />
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
