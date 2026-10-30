// csv-generator.js — Construye el CSV de sesión en el mismo esquema que
// utils/parsers.py::build_dataframe, para que sea compatible con
// utils/validators.py y el resto del pipeline Python.

const COLUMNAS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta", "interrumpido"];

/**
 * @param {Array<{timestamp: string, tiro: number, x: number, y: number, z: number}>} samples
 * @param {Map<number, 0|1>} cestaPorTiro
 * @param {string} sessionId
 * @param {Set<number>} [interrumpidos] tiros cortados por una caida del BLE
 */
export function buildSessionRows(samples, cestaPorTiro, sessionId, interrumpidos = new Set()) {
  return samples.map((s) => ({
    timestamp: s.timestamp,
    session: sessionId,
    tiro: s.tiro,
    x: s.x,
    y: s.y,
    z: s.z,
    potencia: Math.round(Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2) * 100) / 100,
    cesta: cestaPorTiro.get(s.tiro) ?? 0,
    interrumpido: interrumpidos.has(s.tiro) ? 1 : 0,
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

const CHUNK_ROWS = 5000;

// Arma el CSV por bloques y lo devuelve como Blob: en sesiones largas evita
// materializar todas las filas y un unico string enorme.
export function buildCsvBlob(samples, cestaPorTiro, sessionId, interrumpidos) {
  const partes = [COLUMNAS.join(",") + "\n"];
  for (let i = 0; i < samples.length; i += CHUNK_ROWS) {
    const filas = buildSessionRows(samples.slice(i, i + CHUNK_ROWS), cestaPorTiro, sessionId, interrumpidos);
    partes.push(filas.map((row) => COLUMNAS.map((col) => escapeCsvField(row[col])).join(",")).join("\n") + "\n");
  }
  return new Blob(partes, { type: "text/csv;charset=utf-8;" });
}

export function downloadCsv(csvOrBlob, filename) {
  const blob =
    csvOrBlob instanceof Blob ? csvOrBlob : new Blob([csvOrBlob], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revocar al instante puede cancelar la descarga de archivos grandes.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
