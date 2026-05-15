import DeckBackground from "@/components/DeckBackground";

export default function WhyGoodPartner() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body flex flex-col px-[8vw] py-[8vh]">
      <DeckBackground />

      <div className="absolute top-[8vh] left-[8vw] right-[8vw] h-[0.15vh] bg-white/15 z-10" />

      <div className="flex justify-between items-end mt-[2vh] relative z-10">
        <div className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-white">
          spoke.ai
        </div>
        <div className="text-[1vw] font-normal text-muted">Why we&rsquo;d be a good partner</div>
      </div>

      <div
        aria-hidden
        className="absolute left-[7vw] top-[28vh] text-white/[0.04] font-display font-bold leading-[0.8] tracking-[-0.05em] text-[28vw] select-none z-0"
      >
        06
      </div>

      <div className="flex-1 flex flex-col justify-start relative z-10 mt-[6vh]">
        <h2 className="font-display font-semibold text-[3.6vw] leading-[1.05] tracking-[-0.025em] m-0 max-w-[68vw] text-white">
          The right cohort, the right shape.
        </h2>

        <div className="flex flex-col gap-[2.4vh] mt-[5vh] max-w-[80vw]">
          <div className="flex gap-[2.5vw] items-start">
            <div className="font-mono text-[1vw] text-primary font-semibold w-[2.5vw] pt-[0.6vh]">01</div>
            <div className="font-display font-semibold text-[1.5vw] w-[19vw] tracking-[-0.01em] leading-[1.2] text-white">
              Right-shaped users
            </div>
            <div className="text-[1.35vw] leading-[1.45] text-muted flex-1">
              Options-literate, account-funded, multi-trade-per-month — the
              cohort partners actually want, not signal-chasers who open and
              abandon accounts.
            </div>
          </div>
          <div className="w-full h-px bg-line" />

          <div className="flex gap-[2.5vw] items-start">
            <div className="font-mono text-[1vw] text-primary font-semibold w-[2.5vw] pt-[0.6vh]">02</div>
            <div className="font-display font-semibold text-[1.5vw] w-[19vw] tracking-[-0.01em] leading-[1.2] text-white">
              We bring UX, you bring rails
            </div>
            <div className="text-[1.35vw] leading-[1.45] text-muted flex-1">
              We have no interest in becoming a broker. We want to be the best
              cockpit on top of your brokerage, with co-brandable
              account-linking.
            </div>
          </div>
          <div className="w-full h-px bg-line" />

          <div className="flex gap-[2.5vw] items-start">
            <div className="font-mono text-[1vw] text-primary font-semibold w-[2.5vw] pt-[0.6vh]">03</div>
            <div className="font-display font-semibold text-[1.5vw] w-[19vw] tracking-[-0.01em] leading-[1.2] text-white">
              Net account openings
            </div>
            <div className="text-[1.35vw] leading-[1.45] text-muted flex-1">
              A meaningful share of our growth is users who don&rsquo;t yet have
              an account at the partner broker and will open one to use live
              features.
            </div>
          </div>
          <div className="w-full h-px bg-line" />

          <div className="flex gap-[2.5vw] items-start">
            <div className="font-mono text-[1vw] text-primary font-semibold w-[2.5vw] pt-[0.6vh]">04</div>
            <div className="font-display font-semibold text-[1.5vw] w-[19vw] tracking-[-0.01em] leading-[1.2] text-white">
              Engineering quality
            </div>
            <div className="text-[1.35vw] leading-[1.45] text-muted flex-1">
              Typed APIs, automated tests around the positions and roll
              endpoints, structured logs, sandbox-first integration plan. We
              will not be a support burden.
            </div>
          </div>
          <div className="w-full h-px bg-line" />

          <div className="flex gap-[2.5vw] items-start">
            <div className="font-mono text-[1vw] text-primary font-semibold w-[2.5vw] pt-[0.6vh]">05</div>
            <div className="font-display font-semibold text-[1.5vw] w-[19vw] tracking-[-0.01em] leading-[1.2] text-white">
              Single launch partner
            </div>
            <div className="text-[1.35vw] leading-[1.45] text-muted flex-1">
              One integration, not three half-built ones — so what we ship will
              be exercised by every paying user.
            </div>
          </div>
        </div>
      </div>

      <PageFooter page="06" />
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
