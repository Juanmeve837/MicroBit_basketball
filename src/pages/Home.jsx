import { useEffect, useState } from "react";
import UploadForm from "../components/UploadForm.jsx";
import SessionHistory from "../components/SessionHistory.jsx";
import { getSessions } from "../services/api.js";
import { getCached, setCached } from "../services/sessionCache.js";

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-6">
      <UploadForm />

      {loading && <p className="text-sm text-slate-400">Cargando sesiones…</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          No se pudieron cargar las sesiones: {error}
        </p>
      )}
      {!loading && !error && <SessionHistory sessions={sessions} />}
    </div>
  );
}
