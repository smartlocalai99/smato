export default function Home() {
  return (
    <main className="landing">
      <span className="landing__mark">smato · ad screens</span>
      <div>
        <h1 className="landing__title">Fleet ad console</h1>
        <p className="landing__subtitle">
          Upload a video, point it at an auto and a time window, and it plays on the
          tablet — even with no signal.
        </p>
      </div>
      <div className="landing__links">
        <a className="landing__link" href="/admin">
          <span className="landing__link-label">Control panel</span>
          <span className="landing__link-title">Admin →</span>
          <span className="landing__link-desc">Sign in, upload ads, watch the fleet</span>
        </a>
        <a className="landing__link" href="/player">
          <span className="landing__link-label">Runs on the tablet</span>
          <span className="landing__link-title">Player →</span>
          <span className="landing__link-desc">What plays on each auto, fully offline</span>
        </a>
      </div>
    </main>
  );
}
