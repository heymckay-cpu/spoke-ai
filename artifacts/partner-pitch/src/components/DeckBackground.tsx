export default function DeckBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
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
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(1200px 600px at 80% -200px, rgba(99,102,241,0.18), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(56,189,248,0.10), transparent 60%)",
        }}
      />
      <div
        className="absolute -left-[20%] -top-[10%] h-[140%] w-[55%] rotate-[18deg] opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(165,180,252,0.10), rgba(165,180,252,0.22), rgba(165,180,252,0.10))",
          filter: "blur(36px)",
        }}
      />
      <div
        className="absolute -left-[10%] -top-[5%] h-[120%] w-[20%] rotate-[18deg] opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent, rgba(199,210,254,0.18), transparent)",
          filter: "blur(20px)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 12% 8%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1px 1px at 28% 22%, rgba(255,255,255,0.7), transparent 60%), radial-gradient(1px 1px at 41% 14%, rgba(255,255,255,0.9), transparent 60%), radial-gradient(1px 1px at 58% 38%, rgba(255,255,255,0.65), transparent 60%), radial-gradient(1px 1px at 72% 18%, rgba(255,255,255,0.8), transparent 60%), radial-gradient(1px 1px at 86% 30%, rgba(255,255,255,0.95), transparent 60%), radial-gradient(1px 1px at 6% 52%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(1px 1px at 22% 68%, rgba(255,255,255,0.8), transparent 60%), radial-gradient(1px 1px at 47% 78%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(1px 1px at 64% 88%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1px 1px at 81% 64%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(1px 1px at 94% 92%, rgba(255,255,255,0.7), transparent 60%)",
          backgroundSize: "100% 1400px",
          backgroundRepeat: "repeat-y",
          maskImage:
            "linear-gradient(to bottom, black 60%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      />
    </div>
  );
}
