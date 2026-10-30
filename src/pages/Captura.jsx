import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CONNECTION_STATUS, MAX_RECONNECT_ATTEMPTS, useBluetooth } from "../hooks/useBluetooth.js";
import { isWebBluetoothSupported } from "../services/bluetooth.js";
import { downloadCsv } from "../services/csv-generator.js";
import { postSesionCsv } from "../services/api.js";
import { invalidate } from "../services/sessionCache.js";

const MAX_PUNTOS_GRAFICO = 150;
const STATUS_LABEL = {
  [CONNECTION_STATUS.DISCONNECTED]: "Desconectado",
  [CONNECTION_STATUS.CONNECTING]: "Conectando…",
  [CONNECTION_STATUS.CONNECTED]: "Conectado",
  [CONNECTION_STATUS.CAPTURING]: "Capturando",
  [CONNECTION_STATUS.RECONNECTING]: "Reconectando…",
};

const potencia = (s) => Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);

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
    ctx.strokeStyle = "#ea580c";
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
  return <canvas ref={canvasRef} width={480} height={120} className="w-full h-28" />;
}

function Stat({ value, label, warn }) {
  return (
    <div className={`rounded-md border p-3 text-center ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
      <div className="text-2xl font-bold text-court-dark">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

const card = "bg-white rounded-lg shadow-sm border border-slate-200 p-6";
const btn =
  "px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  "px-4 py-2 rounded-md text-sm font-medium bg-court-orange text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed";

export default function Captura() {
  const bt = useBluetooth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const connected = [
    CONNECTION_STATUS.CONNECTED,
    CONNECTION_STATUS.CAPTURING,
    CONNECTION_STATUS.RECONNECTING,
  ].includes(bt.status);
  const hasData = bt.sampleCount > 0;
  const reconnecting = bt.status === CONNECTION_STATUS.RECONNECTING;
  const statusText = reconnecting
    ? `Reconectando a ${bt.deviceName || "la micro:bit"} (intento ${bt.reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})…`
    : STATUS_LABEL[bt.status];

  // Avisar antes de cerrar la pestaña con una sesion sin guardar (al guardar se navega y se desmonta).
  useEffect(() => {
    if (!hasData) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasData]);

  const porcentaje = bt.shotCount > 0 ? Math.round((bt.basketCount / bt.shotCount) * 100) : 0;

  const handleDownload = () => {
    const { blob, sessionId } = bt.getCsv();
    downloadCsv(blob, `sesion_${sessionId}.csv`);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const { blob, sessionId } = bt.getCsv();
      const result = await postSesionCsv(blob, sessionId);
      bt.markSaved();
      invalidate();
      navigate(`/sessions/${result?.session_id || sessionId}`);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewSession = () => {
    if (hasData && !window.confirm("La sesión actual no se ha guardado. ¿Empezar una nueva de todos modos?")) return;
    bt.newSession();
    setSaveError("");
  };

  if (!isWebBluetoothSupported()) {
    return (
      <div className={card}>
        <h2 className="text-lg font-semibold mb-2">Captura en vivo</h2>
        <p className="text-sm text-slate-600">
          Este navegador no soporta Web Bluetooth. Usa Chrome o Edge (escritorio y Android), o la app{" "}
          <strong>Bluefy</strong> en iOS. Safari no funciona. También puedes subir un CSV desde Inicio.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bt.pendingSnapshot && !hasData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" role="status">
          <p className="text-amber-900">
            Hay una sesión sin guardar de {new Date(bt.pendingSnapshot.savedAt).toLocaleString()} (
            {bt.pendingSnapshot.samples.length} muestras). Se conservó al cerrar o recargar la página.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={bt.restoreSession} className={btnPrimary}>
              Recuperar
            </button>
            <button
              onClick={() => window.confirm("Se perderá esa sesión. ¿Descartarla?") && bt.discardSnapshot()}
              className={btn}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-3">Captura en vivo</h2>
        <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1 mb-4">
          <li>
            Enciende la micro:bit con el firmware BLE UART y pulsa <strong>Conectar</strong>.
          </li>
          <li>
            <strong>Activa la sesión con B:</strong> tras conectar (y tras cada reconexión) pulsa B una vez antes de
            la primera A. Ese primer B <strong>no es una canasta</strong>, solo activa la sesión (el botón se pone
            verde). Si la primera pulsación es A, la micro:bit muestra el error 020.
          </li>
          <li>
            <strong>A</strong> inicia y detiene cada tiro (un tiro va de A a A). Con la sesión activa, <strong>B</strong> marca
            canasta.
          </li>
          <li>
            Al terminar pulsa <strong>Guardar sesión</strong>.
          </li>
        </ol>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-2 text-sm font-medium ${connected ? "text-green-700" : "text-slate-500"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-500" : "bg-slate-400"}`} />
            {statusText}
          </span>
          {connected ? (
            <button
              onClick={bt.disconnect}
              className="px-4 py-2 rounded-md text-sm font-semibold border-2 border-red-700 text-red-700 bg-white hover:bg-red-50"
            >
              Desconectar
            </button>
          ) : (
            <>
              {bt.deviceName && (
                <button
                  onClick={bt.reconnectNow}
                  disabled={bt.status === CONNECTION_STATUS.CONNECTING}
                  className={btnPrimary}
                  title="Reconecta a la misma placa sin abrir el selector"
                >
                  Reconectar a {bt.deviceName}
                </button>
              )}
              <button
                onClick={() => bt.connect()}
                disabled={bt.status === CONNECTION_STATUS.CONNECTING}
                className={bt.deviceName ? btn : btnPrimary}
              >
                {bt.deviceName || bt.recentDevices.length > 0 ? "Buscar otro dispositivo" : "Conectar a micro:bit"}
              </button>
              <button
                onClick={() => bt.connect({ acceptAll: true })}
                disabled={bt.status === CONNECTION_STATUS.CONNECTING}
                className="text-sm text-slate-500 underline hover:text-slate-700"
              >
                ¿No aparece? Mostrar todos los dispositivos
              </button>
            </>
          )}
        </div>
        {!connected && bt.recentDevices.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Dispositivos recientes</p>
            <ul className="space-y-2">
              {bt.recentDevices.map((d) => (
                <li key={d.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <button
                    onClick={() => bt.connect({ deviceId: d.id })}
                    disabled={bt.status === CONNECTION_STATUS.CONNECTING}
                    className={btn}
                    title={d.direct ? "Reconecta sin abrir el selector" : "Abre el selector del navegador"}
                  >
                    {d.name}
                  </button>
                  <span className="text-xs text-slate-400">
                    último uso {new Date(d.lastUsed).toLocaleDateString()}
                    {d.direct ? "" : ` · en el selector elige «${d.name}»`}
                  </span>
                  <button
                    onClick={() => bt.forgetDevice(d.id)}
                    className="text-xs text-slate-400 underline hover:text-slate-600"
                  >
                    Olvidar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {bt.error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {bt.error}
          </p>
        )}
      </div>

      {(connected || hasData) && (
        <div className={card}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs text-slate-400">Sesión: {bt.sessionId}</p>
              {connected && bt.keepAwakeMode === "failed" ? (
                <p className="text-xs text-amber-700">
                  No se pudo mantener la pantalla encendida: no bloquees el teléfono o se perderá la captura.
                </p>
              ) : (
                connected &&
                bt.keepAwakeMode !== "off" && (
                  <p className="text-xs text-slate-400">Pantalla: se mantiene encendida</p>
                )
              )}
            </div>
            {!connected ? (
              <span role="status" className="px-3 py-1 rounded-md text-sm font-medium bg-amber-100 text-amber-800">
                Sin conexión: la sesión sigue en pantalla
              </span>
            ) : bt.sessionActive ? (
              <span role="status" className="px-3 py-1 rounded-md text-sm font-semibold bg-green-600 text-white">
                Sesión activa
              </span>
            ) : (
              <span role="status" className="px-3 py-1 rounded-md text-sm font-medium bg-slate-100 text-slate-500">
                Pulsa B en la micro:bit para activar la sesión
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat value={bt.sampleCount} label="muestras" />
            <Stat value={bt.shotCount} label="tiros" />
            <Stat value={`${bt.basketCount}/${bt.shotCount}`} label={`canastas (${porcentaje}%)`} />
            {bt.invalidLineCount > 0 && <Stat value={bt.invalidLineCount} label="líneas corruptas" warn />}
            {bt.ignoredBasketCount > 0 && <Stat value={bt.ignoredBasketCount} label="B sin tiro previo" warn />}
            {bt.interruptedCount > 0 && <Stat value={bt.interruptedCount} label="tiros interrumpidos" warn />}
          </div>
          {bt.backgroundGapSecs > 0 && (
            <div
              className="mb-4 flex items-start justify-between gap-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3"
              role="status"
            >
              <p>
                La página estuvo en segundo plano {bt.backgroundGapSecs} s: puede faltar un tramo de muestras. Ese tiro
                quedó marcado como interrumpido. Mantén la pantalla encendida y esta pestaña a la vista mientras capturas.
              </p>
              <button onClick={bt.dismissBackgroundGap} className="text-xs underline shrink-0">
                Entendido
              </button>
            </div>
          )}
          {connected && !bt.sessionActive && hasData && (
            <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3" role="status">
              Tras reconectar, el primer B solo reactiva la sesión y <strong>no cuenta como canasta</strong>. Si el
              último tiro fue canasta, no la marques con ese B: se anotaría como fallo.
            </p>
          )}
          <PowerChart samples={bt.recentSamples} />
          <div className="flex gap-2 flex-wrap mt-4">
            <button onClick={handleSave} disabled={!hasData || saving} className={btnPrimary}>
              {saving ? "Guardando…" : "Guardar sesión"}
            </button>
            <button onClick={handleDownload} disabled={!hasData} className={btn}>
              Descargar CSV
            </button>
            <button onClick={handleNewSession} disabled={!hasData} className={btn}>
              Nueva sesión
            </button>
          </div>
          {saveError && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3" role="alert">
              No se pudo guardar en el backend: {saveError}. Descarga el CSV como respaldo (se genera en tu navegador, no depende del servidor).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
