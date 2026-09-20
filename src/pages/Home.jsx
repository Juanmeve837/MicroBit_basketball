import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import UploadForm from "../components/UploadForm.jsx";
import SessionHistory from "../components/SessionHistory.jsx";
import { deleteSession, getSessions } from "../services/api.js";
import { getCached, invalidate, setCached } from "../services/sessionCache.js";

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = getCached("sessions");
      if (cached) {
        setSessions(cached);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getSessions();
        if (cancelled) return;
        setSessions(data);
        setCached("sessions", data);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(sessionId) {
    setDeleteError("");
    const previous = sessions;
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    try {
      await deleteSession(sessionId);
      invalidate("sessions");
    } catch (err) {
      setSessions(previous);
      setDeleteError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <UploadForm />
        </div>
        <Link
          to="/captura"
          className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col justify-center hover:border-court-orange transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">Capturar en vivo (Bluetooth)</h2>
          <p className="text-sm text-slate-500">
            Conecta la micro:bit desde el navegador y guarda la sesión sin pasar por nRF Connect.
          </p>
          <span className="mt-4 text-sm font-medium text-court-orange">Ir a captura →</span>
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-400">Cargando sesiones…</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          No se pudieron cargar las sesiones: {error}
        </p>
      )}
      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          No se pudo borrar la sesión: {deleteError}
        </p>
      )}
      {!loading && !error && <SessionHistory sessions={sessions} onDelete={handleDelete} />}
    </div>
  );
}
