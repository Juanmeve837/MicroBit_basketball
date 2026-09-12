import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Dashboard from "../components/Dashboard.jsx";
import { getSession } from "../services/api.js";
import { getCached, setCached } from "../services/sessionCache.js";

export default function SessionDetail() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `session:${sessionId}`;

    async function load() {
      const cached = getCached(cacheKey);
      if (cached) {
        setSession(cached);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await getSession(sessionId);
        if (cancelled) return;
        setSession(data);
        setCached(cacheKey, data);
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
  }, [sessionId]);

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-court-orange hover:underline">
        ← Volver al historial
      </Link>
      <h1 className="text-xl font-bold font-mono">{sessionId}</h1>

      {loading && <p className="text-sm text-slate-400">Cargando sesión…</p>}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          No se pudo cargar la sesión: {error}
        </p>
      )}
      {!loading && !error && session && <Dashboard session={session} />}
    </div>
  );
}
