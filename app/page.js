export default function Home() {
  return (
    <main
      className="min-h-screen-safe flex flex-col items-center justify-center gap-10 px-8 py-8 text-center"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(255,176,32,0.08), transparent 45%), radial-gradient(circle at 80% 85%, rgba(52,216,196,0.07), transparent 45%), var(--ink)",
      }}
    >
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-amber">
        smato · ad screens
      </span>
      <div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tight font-display font-semibold">
          Fleet ad console
        </h1>
        <p className="mt-4 max-w-xl text-text-dim leading-relaxed mx-auto">
          Upload a video, point it at an auto and a time window, and it plays on the
          tablet — even with no signal.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        <a
          href="/admin"
          className="flex min-w-56 flex-col items-start gap-1.5 rounded-lg border border-line bg-panel px-6 py-4 no-underline transition-[border-color,transform] duration-150 hover:border-amber-dim hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-text-faint">
            Control panel
          </span>
          <span className="font-display text-lg text-text">Admin →</span>
          <span className="text-sm text-text-dim">Sign in, upload ads, watch the fleet</span>
        </a>
        <a
          href="/player"
          className="flex min-w-56 flex-col items-start gap-1.5 rounded-lg border border-line bg-panel px-6 py-4 no-underline transition-[border-color,transform] duration-150 hover:border-amber-dim hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-text-faint">
            Runs on the tablet
          </span>
          <span className="font-display text-lg text-text">Player →</span>
          <span className="text-sm text-text-dim">What plays on each auto, fully offline</span>
        </a>
      </div>
    </main>
  );
}
