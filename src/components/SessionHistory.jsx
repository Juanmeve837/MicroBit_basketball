import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const COLUMNS = [
  { key: "session_id", label: "Sesión" },
  { key: "date", label: "Fecha" },
  { key: "num_tiros", label: "Tiros" },
  { key: "efectividad", label: "Efectividad" },
  { key: "potencia_avg", label: "Potencia avg" },
];

export default function SessionHistory({ sessions, onDelete }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const navigate = useNavigate();

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (window.confirm(`¿Borrar la sesión "${sessionId}"? Esta acción no se puede deshacer.`)) {
      onDelete(sessionId);
    }
  };

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (dateFrom && s.date < dateFrom) return false;
      if (dateTo && s.date > dateTo) return false;
      return true;
    });
  }, [sessions, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <h2 className="text-lg font-semibold mr-auto">Historial de sesiones</h2>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Desde
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500 flex flex-col gap-1">
          Hasta
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="py-2 px-2 cursor-pointer select-none text-slate-500 font-medium hover:text-slate-700 whitespace-nowrap"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
              <th className="py-2 px-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="py-6 text-center text-slate-400">
                  No hay sesiones para mostrar.
                </td>
              </tr>
            )}
            {sorted.map((s) => (
              <tr
                key={s.session_id}
                onClick={() => navigate(`/sessions/${s.session_id}`)}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="py-2 px-2 font-mono text-xs">{s.session_id}</td>
                <td className="py-2 px-2">{s.date}</td>
                <td className="py-2 px-2">{s.num_tiros}</td>
                <td className="py-2 px-2">{s.efectividad}%</td>
                <td className="py-2 px-2">{s.potencia_avg}</td>
                <td className="py-2 px-2 text-right">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, s.session_id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
