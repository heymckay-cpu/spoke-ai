import DeckBackground from "@/components/DeckBackground";

export default function TheAsks() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">What we&rsquo;d like from this call</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        07
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[64vw] text-white">
          Three concrete asks, in priority order.
        </h2>

        <div className="grid grid-cols-3 gap-[2.2vw] mt-[6vh] max-w-[82vw]">
          <div className="bg-surface backdrop-blur-sm border border-line p-[2.4vw] flex flex-col h-full">
            <div className="font-display font-bold text-primary text-[5.5vw] leading-[0.95] tracking-[-0.04em]">
              01
            </div>
            <div className="font-display font-semibold text-[1.7vw] tracking-[-0.015em] leading-[1.15] mt-[2vh] text-white">
              Sandbox + production OAuth path
            </div>
            <div className="text-[1.25vw] text-muted leading-[1.5] mt-[2vh]">
              Confirmation we can build against your sandbox immediately, plus a
              clear, time-boxed checklist for production OAuth review.
            </div>
          </div>

          <div className="bg-surface backdrop-blur-sm border border-line p-[2.4vw] flex flex-col h-full">
            <div className="font-display font-bold text-primary text-[5.5vw] leading-[0.95] tracking-[-0.04em]">
              02
            </div>
            <div className="font-display font-semibold text-[1.7vw] tracking-[-0.015em] leading-[1.15] mt-[2vh] text-white">
              Partner pricing, if any exists
            </div>
            <div className="text-[1.25vw] text-muted leading-[1.5] mt-[2vh]">
              Whatever ISV, referral, or SaaS-discount program you have for
              products in our shape — even an informal one. We&rsquo;ll share
              funnel data to qualify.
            </div>
          </div>

          <div className="bg-surface backdrop-blur-sm border border-line p-[2.4vw] flex flex-col h-full">
            <div className="font-display font-bold text-primary text-[5.5vw] leading-[0.95] tracking-[-0.04em]">
              03
            </div>
            <div className="font-display font-semibold text-[1.7vw] tracking-[-0.015em] leading-[1.15] mt-[2vh] text-white">
              Intro to the right humans
            </div>
            <div className="text-[1.25vw] text-muted leading-[1.5] mt-[2vh]">
              A named partner-engineering or solutions contact, plus a
              compliance and legal contact for agreement review. One of each is
              enough.
            </div>
          </div>
        </div>

        <div className="mt-[5vh] max-w-[70vw] text-[1.3vw] leading-[1.5] text-text">
          A 30-minute follow-up after this is plenty — we&rsquo;ll come with the
          specific technical and commercial questions documented in our internal
          evaluation.
        </div>
      </div>

      <PageFooter page="07" />
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
