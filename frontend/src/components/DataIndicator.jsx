export default function DataIndicator({ sampleCount, shotCount, basketCount, invalidLineCount, ignoredBasketCount = 0 }) {
  const porcentaje = shotCount > 0 ? Math.round((basketCount / shotCount) * 100) : 0;

  return (
    <div className="card data-indicator">
      <div className="stat">
        <span className="stat-value">{sampleCount}</span>
        <span className="stat-label">muestras</span>
      </div>
      <div className="stat">
        <span className="stat-value">{shotCount}</span>
        <span className="stat-label">tiros</span>
      </div>
      <div className="stat">
        <span className="stat-value">
          {basketCount}/{shotCount}
        </span>
        <span className="stat-label">canastas ({porcentaje}%)</span>
      </div>
      {invalidLineCount > 0 && (
        <div className="stat stat-warning">
          <span className="stat-value">{invalidLineCount}</span>
          <span className="stat-label">líneas corruptas</span>
        </div>
      )}
      {ignoredBasketCount > 0 && (
        <div className="stat stat-warning">
          <span className="stat-value">{ignoredBasketCount}</span>
          <span className="stat-label">B ignoradas (sin tiro previo)</span>
        </div>
      )}
    </div>
  );
}
