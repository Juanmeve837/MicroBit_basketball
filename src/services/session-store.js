// session-store.js — Copia local (localStorage) de la sesion en curso para no
// perderla si se recarga la pestaña. Solo es una red de seguridad: todo acceso
// va en try/catch porque el storage puede estar bloqueado o lleno.

const SNAPSHOT_KEY = "microbit.sessionSnapshot";

/**
 * @param {Object} data
 * @param {string} data.sessionId
 * @param {Array<{timestamp: string, tiro: number, x: number, y: number, z: number}>} data.samples
 * @param {Map<number, 0|1>} data.cestaPorTiro
 * @param {number} data.currentTiro
 * @param {number|null} data.ultimoTiro
 * @param {Set<number>} data.interrumpidos
 */
export function saveSnapshot(data) {
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        sessionId: data.sessionId,
        samples: data.samples.map((s) => [s.timestamp, s.tiro, s.x, s.y, s.z]),
        cesta: [...data.cestaPorTiro],
        currentTiro: data.currentTiro,
        ultimoTiro: data.ultimoTiro,
        interrumpidos: [...data.interrumpidos],
      })
    );
  } catch {
    // Cuota llena o storage bloqueado: la sesion sigue en memoria.
  }
}

/** Devuelve la sesion guardada ya deserializada, o null. */
export function loadSnapshot() {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    if (!raw || raw.v !== 1 || !Array.isArray(raw.samples) || raw.samples.length === 0) return null;
    return {
      savedAt: raw.savedAt,
      sessionId: raw.sessionId,
      samples: raw.samples.map(([timestamp, tiro, x, y, z]) => ({ timestamp, tiro, x, y, z })),
      cestaPorTiro: new Map(raw.cesta),
      currentTiro: raw.currentTiro,
      ultimoTiro: raw.ultimoTiro,
      interrumpidos: new Set(raw.interrumpidos),
    };
  } catch {
    return null;
  }
}

export function clearSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // nada que limpiar
  }
}
