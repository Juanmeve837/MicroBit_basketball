import { useMemo, useState } from "react";
import KPICard from "./KPICard.jsx";
import { AxisStatsChart, PotenciaBarChart } from "./Charts.jsx";

const SHOT_COLUMNS = [
  { key: "tiro", label: "Tiro" },
  { key: "muestras", label: "Muestras" },
  { key: "potencia_max", label: "Potencia máx" },
  { key: "potencia_avg", label: "Potencia avg" },
  { key: "cesta", label: "Cesta" },
];

export default function Dashboard({ session }) {
  const [sortKey, setSortKey] = useState("tiro");
  const [sortDir, setSortDir] = useState("asc");

  const sortedTiros = useMemo(() => {
    const copy = [...(session.tiros || [])];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [session.tiros, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Efectividad"
          value={session.efectividad}
          suffix="%"
          tone={session.efectividad >= 50 ? "good" : "bad"}
        />
        <KPICard label="Potencia promedio" value={session.potencia_avg} />
        <KPICard label="Consistencia" value={session.consistencia} suffix="%" />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">Potencia por tiro</h3>
        <PotenciaBarChart tiros={session.tiros || []} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">Estadísticas por eje</h3>
        <AxisStatsChart axisStats={session.axis_stats || {}} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <h3 className="font-semibold mb-3">Tiros individuales</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200">
                {SHOT_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="py-2 px-2 cursor-pointer select-none text-slate-500 font-medium hover:text-slate-700 whitespace-nowrap"
                  >
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTiros.map((t) => (
                <tr key={t.tiro} className="border-b border-slate-100">
                  <td className="py-2 px-2">{t.tiro}</td>
                  <td className="py-2 px-2">{t.muestras}</td>
                  <td className="py-2 px-2">{t.potencia_max}</td>
                  <td className="py-2 px-2">{t.potencia_avg}</td>
                  <td className="py-2 px-2">
                    {t.cesta ? (
                      <span className="text-green-600 font-medium">✔ Sí</span>
                    ) : (
                      <span className="text-red-500 font-medium">✘ No</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedTiros.length === 0 && (
                <tr>
                  <td colSpan={SHOT_COLUMNS.length} className="py-6 text-center text-slate-400">
                    No hay tiros registrados en esta sesión.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
