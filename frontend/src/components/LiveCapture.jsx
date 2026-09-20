import { useEffect, useRef, useState } from "react";
import { downloadCsv } from "../services/csv-generator";
import { postSesion } from "../services/api";

const MAX_PUNTOS_GRAFICO = 150;

function potencia(sample) {
  return Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
}

function PowerChart({ samples }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const puntos = samples.slice(-MAX_PUNTOS_GRAFICO).map(potencia);
    if (puntos.length < 2) return;

    const max = Math.max(...puntos, 1);
    const min = Math.min(...puntos, 0);
    const rango = max - min || 1;

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    puntos.forEach((p, i) => {
      const x = (i / (puntos.length - 1)) * width;
      const y = height - ((p - min) / rango) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [samples]);

  return <canvas ref={canvasRef} width={480} height={120} className="power-chart" />;
}

export default function LiveCapture({ bluetooth }) {
  const { samples, getCsv, sessionId, newSession } = bluetooth;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  const handleDownload = () => {
    const { csv, sessionId: sid } = getCsv();
    downloadCsv(csv, `sesion_${sid}.csv`);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const { csv, sessionId: sid } = getCsv();
      const respuesta = await postSesion(csv, sid);
      setSaveResult(respuesta);
    } catch (err) {
      setSaveError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleNewSession = () => {
    if (samples.length > 0 && !saveResult) {
      const ok = window.confirm("La sesión actual no se ha guardado en el backend. ¿Empezar una nueva de todos modos?");
      if (!ok) return;
    }
    newSession();
    setSaveError(null);
    setSaveResult(null);
  };

  return (
    <div className="card live-capture">
      <h2>Captura en vivo</h2>
      <p className="session-id">Sesión: {sessionId}</p>
      <PowerChart samples={samples} />

      <div className="actions">
        <button onClick={handleDownload} disabled={samples.length === 0}>
          Descargar sesión (CSV)
        </button>
        <button onClick={handleSave} disabled={samples.length === 0 || saving} className="primary">
          {saving ? "Guardando…" : "Guardar sesión"}
        </button>
        <button onClick={handleNewSession} disabled={samples.length === 0}>
          Nueva sesión
        </button>
      </div>

      {saveError && (
        <div className="error-box">
          <p className="error">No se pudo enviar al backend: {saveError}</p>
          <button onClick={handleDownload} className="secondary">
            Guardar lo que llegó (descargar CSV)
          </button>
        </div>
      )}

      {saveResult && (
        <div className="success-box">
          <p>Sesión guardada correctamente.</p>
          <pre>{JSON.stringify(saveResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
