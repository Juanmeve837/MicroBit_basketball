// keep-awake.js — Mantiene la pantalla encendida mientras se captura.
//
// En Bluefy (WKWebView) bloquear la pantalla o pasar a segundo plano suspende el
// JavaScript y se pierden notificaciones BLE. Primero Screen Wake Lock; si el
// navegador no lo tiene (o lo rechaza), un video oculto en bucle (nosleep.js).
// Debe iniciarse desde un gesto del usuario (el clic en "Conectar"). Todo va en
// try/catch: si falla, la captura sigue y la UI avisa.

import NoSleep from "nosleep.js";

export const KEEP_AWAKE_MODE = {
  OFF: "off",
  WAKE_LOCK: "wakelock",
  VIDEO: "video",
  FAILED: "failed",
};

let mode = KEEP_AWAKE_MODE.OFF;
let wanted = false;
let sentinel = null;
let noSleep = null;
let visibilityBound = false;
const listeners = new Set();

function setMode(next) {
  if (mode === next) return;
  mode = next;
  listeners.forEach((cb) => cb(mode));
}

async function acquire() {
  if (typeof navigator !== "undefined" && navigator.wakeLock?.request) {
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        sentinel = null;
      });
      setMode(KEEP_AWAKE_MODE.WAKE_LOCK);
      return;
    } catch (err) {
      console.warn("[keep-awake] Wake Lock rechazado, usando video:", err);
    }
  }
  try {
    if (!noSleep) noSleep = new NoSleep();
    await noSleep.enable();
    setMode(KEEP_AWAKE_MODE.VIDEO);
  } catch (err) {
    console.warn("[keep-awake] no se pudo mantener la pantalla encendida:", err);
    setMode(KEEP_AWAKE_MODE.FAILED);
  }
}

// El sistema libera el Wake Lock al ocultar la pagina: pedirlo de nuevo al volver.
function onVisibilityChange() {
  if (!wanted || document.visibilityState !== "visible") return;
  if (mode === KEEP_AWAKE_MODE.WAKE_LOCK && sentinel) return;
  acquire();
}

export async function enableKeepAwake() {
  wanted = true;
  if (!visibilityBound && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = true;
  }
  await acquire();
  return mode;
}

export function disableKeepAwake() {
  wanted = false;
  try {
    sentinel?.release();
    noSleep?.disable();
  } catch {
    // nada que liberar
  }
  sentinel = null;
  setMode(KEEP_AWAKE_MODE.OFF);
}

/** Suscribe a cambios de modo; devuelve la funcion para desuscribirse. */
export function onKeepAwakeChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getKeepAwakeMode() {
  return mode;
}
