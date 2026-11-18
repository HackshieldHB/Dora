export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skeleton line" style={{ width: 220, height: 28 }} />
      <div className="skeleton line" style={{ width: 360 }} />
      <div className="grid stats">
        <div className="card skeleton block" />
        <div className="card skeleton block" />
        <div className="card skeleton block" />
      </div>
      <div className="card stack">
        <div className="skeleton line" />
        <div className="skeleton line" style={{ width: "80%" }} />
        <div className="skeleton line" style={{ width: "62%" }} />
      </div>
    </div>
  );
}
