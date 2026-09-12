import { useEffect, useState } from "react";
import {
  AxisDistributionChart,
  EffectivenessEvolutionChart,
  PotenciaBoxplot,
} from "../components/Charts.jsx";
import { getCompareData } from "../services/api.js";
import { getCached, setCached } from "../services/sessionCache.js";

export default function Compare() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = getCached("compare");
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const result = await getCompareData();
        if (cancelled) return;
        setData(result);
        setCached("compare", result);
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

  if (loading) return <p className="text-sm text-slate-400">Cargando comparativas…</p>;
  if (error) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
        No se pudieron cargar las comparativas: {error}
      </p>
    );
  }
  if (!data || !data.sessions?.length) {
    return <p className="text-sm text-slate-400">No hay suficientes sesiones para comparar.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Comparativas entre sesiones</h1>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">Evolución de efectividad</h3>
        <EffectivenessEvolutionChart sessions={data.sessions} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">Distribución de potencia por sesión</h3>
        <PotenciaBoxplot sessions={data.sessions} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">Distribución de ejes X/Y/Z</h3>
        <AxisDistributionChart samples={data.samples || []} />
      </div>
    </div>
  );
}
