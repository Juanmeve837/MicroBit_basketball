// csv-generator.js — Construye el CSV de sesión en el mismo esquema que
// utils/parsers.py::build_dataframe, para que sea compatible con
// utils/validators.py y el resto del pipeline Python.

const COLUMNAS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"];

/**
 * @param {Array<{timestamp: string, tiro: number, x: number, y: number, z: number}>} samples
 * @param {Map<number, 0|1>} cestaPorTiro
 * @param {string} sessionId
 */
export function buildSessionRows(samples, cestaPorTiro, sessionId) {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    session: sessionId,
    tiro: s.tiro,
    x: s.x,
    y: s.y,
    z: s.z,
    potencia: Math.round(Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2) * 100) / 100,
    cesta: cestaPorTiro.get(s.tiro) ?? 0,
  }));
}

function escapeCsvField(value) {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows) {
  const header = COLUMNAS.join(",");
  const lineas = rows.map((row) => COLUMNAS.map((col) => escapeCsvField(row[col])).join(","));
  return [header, ...lineas].join("\n") + "\n";
}

export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
