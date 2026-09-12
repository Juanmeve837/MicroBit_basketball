// ble-parser.js — Reconstruye líneas UART a partir de fragmentos BLE (≤20 bytes)
// y las convierte en eventos tipados.
//
// Formato de línea enviado por el firmware (utils/microbit_lanzamiento.js):
//   "x,y,z"   → muestra de aceleración (evento DATA)
//   "END"     → fin de tiro (botón A)
//   "BASKET"  → canasta (botón B)

export const EVENT_TYPES = {
  DATA: "DATA",
  END: "END",
  BASKET: "BASKET",
};

/**
 * Acumula fragmentos BLE y devuelve las líneas completas ya reconstruidas
 * (todo lo que hay hasta el último "\n"), guardando el resto en el buffer.
 */
export class LineBuffer {
  constructor() {
    this._buffer = "";
  }

  /** @param {string} chunk fragmento crudo recibido de la característica BLE */
  push(chunk) {
    this._buffer += chunk;
    const lineas = [];
    let idx;
    while ((idx = this._buffer.indexOf("\n")) !== -1) {
      const linea = this._buffer.slice(0, idx).trim();
      this._buffer = this._buffer.slice(idx + 1);
      if (linea.length > 0) {
        lineas.push(linea);
      }
    }
    return lineas;
  }

  flush() {
    return this._buffer;
  }
}

/**
 * Parsea una línea UART reconstruida en un evento tipado, o null si no es
 * válida (línea corrupta / formato inesperado).
 */
export function parseLine(linea) {
  if (linea === "END") {
    return { type: EVENT_TYPES.END };
  }
  if (linea === "BASKET") {
    return { type: EVENT_TYPES.BASKET };
  }

  const partes = linea.split(",");
  if (partes.length !== 3) {
    return null;
  }
  const [x, y, z] = partes.map(Number);
  if ([x, y, z].some((n) => Number.isNaN(n))) {
    return null;
  }
  return { type: EVENT_TYPES.DATA, x, y, z };
}
