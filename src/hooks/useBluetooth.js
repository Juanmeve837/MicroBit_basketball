import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectToMicrobit,
  attachRx,
  disconnectFromMicrobit,
  getAuthorizedDevices,
  loadKnownDevices,
  rememberDevice,
  forgetDevice,
  UART_SERVICE_UUID,
  UART_RX_CHARACTERISTIC_UUID,
} from "../services/bluetooth";
import { LineBuffer, parseLine, EVENT_TYPES } from "../services/ble-parser";
import { buildCsvBlob } from "../services/csv-generator";
import { saveSnapshot, loadSnapshot, clearSnapshot } from "../services/session-store";
import {
  enableKeepAwake,
  disableKeepAwake,
  onKeepAwakeChange,
  getKeepAwakeMode,
} from "../services/keep-awake";

export const CONNECTION_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  CAPTURING: "capturing",
  RECONNECTING: "reconnecting",
};

// La micro:bit tarda en volver a anunciarse: espera creciente entre intentos.
const RECONNECT_DELAYS_MS = [2000, 3000, 5000, 8000, 10000];
export const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;
// gatt.connect() puede quedarse colgado sin fallar (sobre todo en iOS).
const CONNECT_TIMEOUT_MS = 10000;
// El firmware manda ~10 muestras/s: un silencio mayor dentro de un tiro es un hueco.
const GAP_MS = 1500;
// Tiempo oculta (pantalla bloqueada / otra app) a partir del cual se avisa.
const HIDDEN_WARN_S = 3;
// Las muestras viven en un ref (no en estado) para que una sesion larga no copie
// el array entero en cada linea; la UI se refresca como mucho cada FLUSH_MS.
const FLUSH_MS = 250;
const RECENT_SAMPLES = 150;
// La copia local de la sesion se escribe como mucho cada SNAPSHOT_MS.
const SNAPSHOT_MS = 2000;

function nowTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function generateSessionId() {
  // Fecha local (no toISOString: es UTC y de noche ya marca el dia siguiente).
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const uuid = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${fecha}_${uuid}`;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tiempo de espera agotado al conectar")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function countBaskets(cestaPorTiro) {
  let n = 0;
  cestaPorTiro.forEach((v) => {
    if (v === 1) n += 1;
  });
  return n;
}

export function useBluetooth() {
  const [status, setStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [sampleCount, setSampleCount] = useState(0);
  const [recentSamples, setRecentSamples] = useState([]);
  const [shotCount, setShotCount] = useState(0);
  const [basketCount, setBasketCount] = useState(0);
  const [interruptedCount, setInterruptedCount] = useState(0);
  const [error, setError] = useState(null);
  const [invalidLineCount, setInvalidLineCount] = useState(0);
  const [ignoredBasketCount, setIgnoredBasketCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [deviceName, setDeviceName] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [recentDevices, setRecentDevices] = useState([]);
  // Sesion sin guardar encontrada en localStorage al abrir la pagina.
  const [pendingSnapshot, setPendingSnapshot] = useState(() => loadSnapshot());
  const [keepAwakeMode, setKeepAwakeMode] = useState(getKeepAwakeMode());
  // Segundos que la pagina estuvo oculta con un tiro abierto (aviso de hueco).
  const [backgroundGapSecs, setBackgroundGapSecs] = useState(0);

  const samplesRef = useRef([]);
  const flushTimerRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const deviceRef = useRef(null);
  const authorizedDevicesRef = useRef(new Map());
  const lineBufferRef = useRef(new LineBuffer());
  const cestaPorTiroRef = useRef(new Map());
  const interrumpidosRef = useRef(new Set());
  const currentTiroRef = useRef(1);
  const ultimoTiroRef = useRef(null);
  // El primer B tras conectar (o reconectar) activa la sesion: la micro:bit lo
  // exige antes de la primera A y no es una canasta. Los B siguientes si lo son.
  const sessionActiveRef = useRef(false);
  const sessionIdRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  // Mientras connect() esta en curso, un gattserverdisconnected es parte del
  // propio intento (p. ej. fallo del dispositivo recordado) y no una caida.
  const connectingRef = useRef(false);
  // true mientras corre el bucle de reconexion (evita bucles paralelos).
  const reconnectingRef = useRef(false);
  const ultimaMuestraRef = useRef(null);
  const hiddenSinceRef = useRef(null);

  const writeSnapshotNow = useCallback(() => {
    clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = null;
    if (samplesRef.current.length === 0) return;
    saveSnapshot({
      sessionId: sessionIdRef.current,
      samples: samplesRef.current,
      cestaPorTiro: cestaPorTiroRef.current,
      currentTiro: currentTiroRef.current,
      ultimoTiro: ultimoTiroRef.current,
      interrumpidos: interrumpidosRef.current,
    });
  }, []);

  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimerRef.current === null) {
      snapshotTimerRef.current = setTimeout(writeSnapshotNow, SNAPSHOT_MS);
    }
  }, [writeSnapshotNow]);

  const dropSnapshot = useCallback(() => {
    clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = null;
    clearSnapshot();
    setPendingSnapshot(null);
  }, []);

  // Marca un tiro como cortado (caida, hueco de muestras o segundo plano):
  // se guarda igual, pero queda senalado en el CSV y en el detalle.
  const markInterrumpido = useCallback(
    (tiro) => {
      if (interrumpidosRef.current.has(tiro)) return;
      interrumpidosRef.current.add(tiro);
      setInterruptedCount(interrumpidosRef.current.size);
      scheduleSnapshot();
    },
    [scheduleSnapshot]
  );

  const flushSamples = useCallback(() => {
    flushTimerRef.current = null;
    setSampleCount(samplesRef.current.length);
    setRecentSamples(samplesRef.current.slice(-RECENT_SAMPLES));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(flushSamples, FLUSH_MS);
    }
  }, [flushSamples]);

  const resetSessionState = useCallback(() => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    samplesRef.current = [];
    lineBufferRef.current = new LineBuffer();
    cestaPorTiroRef.current = new Map();
    interrumpidosRef.current = new Set();
    currentTiroRef.current = 1;
    ultimoTiroRef.current = null;
    sessionActiveRef.current = false;
    sessionIdRef.current = generateSessionId();
    ultimaMuestraRef.current = null;
    dropSnapshot();
    setBackgroundGapSecs(0);
    setSessionActive(false);
    setSampleCount(0);
    setRecentSamples([]);
    setShotCount(0);
    setBasketCount(0);
    setInterruptedCount(0);
    setInvalidLineCount(0);
    setIgnoredBasketCount(0);
    setError(null);
  }, [dropSnapshot]);

  const handleLine = useCallback((linea) => {
    const evento = parseLine(linea);
    if (!evento) {
      console.warn("[ble] linea corrupta:", JSON.stringify(linea));
      setInvalidLineCount((n) => n + 1);
      return;
    }

    if (evento.type === EVENT_TYPES.DATA) {
      const tiro = currentTiroRef.current;
      const ahora = performance.now();
      // Silencio largo dentro del mismo tiro: se perdieron muestras aunque no
      // llegara ningun evento de desconexion.
      if (
        ultimoTiroRef.current === tiro &&
        ultimaMuestraRef.current !== null &&
        ahora - ultimaMuestraRef.current > GAP_MS
      ) {
        markInterrumpido(tiro);
      }
      ultimaMuestraRef.current = ahora;
      ultimoTiroRef.current = tiro;
      samplesRef.current.push({ timestamp: nowTimestamp(), tiro, x: evento.x, y: evento.y, z: evento.z });
      scheduleFlush();
      scheduleSnapshot();
    } else if (evento.type === EVENT_TYPES.END) {
      const tiro = ultimoTiroRef.current;
      if (tiro !== null) {
        if (!cestaPorTiroRef.current.has(tiro)) {
          cestaPorTiroRef.current.set(tiro, 0);
        }
        currentTiroRef.current = tiro + 1;
        setShotCount(cestaPorTiroRef.current.size);
        scheduleSnapshot();
      }
    } else if (evento.type === EVENT_TYPES.BASKET) {
      if (!sessionActiveRef.current) {
        sessionActiveRef.current = true;
        setSessionActive(true);
        return;
      }
      const tiro = ultimoTiroRef.current;
      if (tiro === null) {
        setIgnoredBasketCount((n) => n + 1);
      } else {
        const eraCesta = cestaPorTiroRef.current.get(tiro) === 1;
        cestaPorTiroRef.current.set(tiro, 1);
        setShotCount(cestaPorTiroRef.current.size);
        if (!eraCesta) setBasketCount((n) => n + 1);
        scheduleSnapshot();
      }
    }
  }, [scheduleFlush, scheduleSnapshot, markInterrumpido]);

  const handleData = useCallback(
    (chunk) => {
      const lineas = lineBufferRef.current.push(chunk);
      lineas.forEach(handleLine);
    },
    [handleLine]
  );

  const attemptReconnect = useCallback(async (immediate = false) => {
    if (intentionalDisconnectRef.current || !deviceRef.current) {
      reconnectingRef.current = false;
      return;
    }
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      const nombre = deviceRef.current.name || "la micro:bit";
      setError(
        `Se perdió la conexión con ${nombre} y no se pudo reconectar automáticamente. ` +
          "Lo capturado sigue en pantalla: reconecta para continuar o guarda la sesión."
      );
      reconnectingRef.current = false;
      setReconnectAttempt(0);
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      disableKeepAwake();
      return;
    }

    reconnectingRef.current = true;
    reconnectAttemptsRef.current += 1;
    const intento = reconnectAttemptsRef.current;
    setReconnectAttempt(intento);
    setStatus(CONNECTION_STATUS.RECONNECTING);

    if (!immediate) {
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAYS_MS[intento - 1]));
      // El usuario pudo desconectar durante la espera.
      if (intentionalDisconnectRef.current) {
        reconnectingRef.current = false;
        return;
      }
    }

    const gatt = deviceRef.current.gatt;
    try {
      const server = await withTimeout(gatt.connect(), CONNECT_TIMEOUT_MS);
      const service = await server.getPrimaryService(UART_SERVICE_UUID);
      const rx = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
      // Descarta media linea pendiente de antes de la caida.
      lineBufferRef.current = new LineBuffer();
      await attachRx(rx, handleData);
      reconnectAttemptsRef.current = 0;
      reconnectingRef.current = false;
      sessionActiveRef.current = false;
      setReconnectAttempt(0);
      setSessionActive(false);
      setStatus(CONNECTION_STATUS.CONNECTED);
    } catch (err) {
      // Cancelar un connect colgado antes del siguiente intento.
      try {
        if (gatt.connected) gatt.disconnect();
      } catch {
        // ya estaba desconectado
      }
      attemptReconnect();
    }
  }, [handleData]);

  const handleDisconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) {
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    // Durante connect() o un bucle de reconexion en curso, un
    // gattserverdisconnected es parte del propio intento, no una caida nueva.
    if (connectingRef.current || reconnectingRef.current) {
      return;
    }
    // Caida a mitad de un tiro: el tiro abierto ya tiene muestras y le faltara
    // el tramo del hueco. Se marca (no se descarta) para poder revisarlo.
    const tiroAbierto = currentTiroRef.current;
    if (ultimoTiroRef.current === tiroAbierto) {
      markInterrumpido(tiroAbierto);
    }
    writeSnapshotNow();
    attemptReconnect();
  }, [attemptReconnect, writeSnapshotNow, markInterrumpido]);

  // Reconecta a la placa ya elegida en esta carga de la pagina, sin abrir el
  // selector del navegador (sirve tras agotar los intentos o un desconectar).
  const reconnectNow = useCallback(() => {
    if (!deviceRef.current || reconnectingRef.current || connectingRef.current) return;
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    setError(null);
    enableKeepAwake();
    attemptReconnect(true);
  }, [attemptReconnect]);

  // Pantalla bloqueada / otra app: el JS se suspende y las notificaciones BLE se
  // pierden, a veces sin evento de desconexion. Al volver: avisar del hueco y
  // reconectar de inmediato si la conexion ya no esta.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        writeSnapshotNow();
        return;
      }
      const since = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      const device = deviceRef.current;
      if (since === null || !device || intentionalDisconnectRef.current) return;

      const secs = Math.round((Date.now() - since) / 1000);
      const capturando = samplesRef.current.length > 0 && ultimoTiroRef.current === currentTiroRef.current;
      if (secs >= HIDDEN_WARN_S && capturando && device.gatt?.connected) {
        markInterrumpido(currentTiroRef.current);
        setBackgroundGapSecs(secs);
      }
      if (!device.gatt?.connected && !reconnectingRef.current && !connectingRef.current) {
        if (capturando) {
          markInterrumpido(currentTiroRef.current);
          setBackgroundGapSecs(secs);
        }
        reconnectAttemptsRef.current = 0;
        attemptReconnect(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [attemptReconnect, markInterrumpido, writeSnapshotNow]);

  const refreshRecentDevices = useCallback(async () => {
    const authorized = await getAuthorizedDevices();
    authorizedDevicesRef.current = new Map(authorized.map((d) => [d.id, d]));
    setRecentDevices(
      loadKnownDevices().map((d) => ({ ...d, direct: authorizedDevicesRef.current.has(d.id) }))
    );
  }, []);

  useEffect(() => {
    refreshRecentDevices();
  }, [refreshRecentDevices]);

  useEffect(() => {
    const unsubscribe = onKeepAwakeChange(setKeepAwakeMode);
    return () => {
      unsubscribe();
      disableKeepAwake();
    };
  }, []);

  // Al cerrar la pestaña, escribir al instante lo que haya pendiente.
  useEffect(() => {
    const onPageHide = () => writeSnapshotNow();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      clearTimeout(flushTimerRef.current);
      // Al salir de la pagina (sin guardar) no perder la ultima escritura pendiente.
      if (snapshotTimerRef.current !== null) writeSnapshotNow();
    };
  }, [writeSnapshotNow]);

  const connect = useCallback(async (options = {}) => {
    setError(null);
    setStatus(CONNECTION_STATUS.CONNECTING);
    intentionalDisconnectRef.current = false;
    connectingRef.current = true;
    // Conectar no borra lo capturado (p. ej. tras agotar las reconexiones);
    // solo "Nueva sesion" reinicia. Cada conexion exige activar de nuevo con B.
    if (sessionIdRef.current === null) sessionIdRef.current = generateSessionId();
    sessionActiveRef.current = false;
    setSessionActive(false);
    lineBufferRef.current = new LineBuffer();
    // Sin await: debe arrancar dentro del gesto del usuario y no retrasar el selector.
    enableKeepAwake();

    try {
      const { device } = await connectToMicrobit({
        onData: handleData,
        onDisconnect: handleDisconnect,
        device: options.deviceId ? authorizedDevicesRef.current.get(options.deviceId) : undefined,
        ...(options.acceptAll ? { acceptAll: true } : {}),
      });
      deviceRef.current = device;
      reconnectAttemptsRef.current = 0;
      setDeviceName(device.name || "micro:bit");
      setRecentDevices(rememberDevice(device).map((d) => ({ ...d, direct: true })));
      setStatus(CONNECTION_STATUS.CONNECTED);
      refreshRecentDevices();
    } catch (err) {
      setError(err.message || String(err));
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      disableKeepAwake();
    } finally {
      connectingRef.current = false;
    }
  }, [handleData, handleDisconnect, refreshRecentDevices]);

  const disconnect = useCallback(async () => {
    intentionalDisconnectRef.current = true;
    await disconnectFromMicrobit(deviceRef.current);
    setStatus(CONNECTION_STATUS.DISCONNECTED);
    disableKeepAwake();
  }, []);

  const forgetKnownDevice = useCallback(
    (id) => {
      forgetDevice(id);
      refreshRecentDevices();
    },
    [refreshRecentDevices]
  );

  // Rehidrata la sesion guardada en localStorage (tras recargar la pestaña).
  const restoreSession = useCallback(() => {
    if (!pendingSnapshot) return;
    samplesRef.current = pendingSnapshot.samples;
    cestaPorTiroRef.current = pendingSnapshot.cestaPorTiro;
    interrumpidosRef.current = pendingSnapshot.interrumpidos;
    currentTiroRef.current = pendingSnapshot.currentTiro;
    ultimoTiroRef.current = pendingSnapshot.ultimoTiro;
    sessionIdRef.current = pendingSnapshot.sessionId;
    sessionActiveRef.current = false;
    setSessionActive(false);
    setSampleCount(samplesRef.current.length);
    setRecentSamples(samplesRef.current.slice(-RECENT_SAMPLES));
    setShotCount(cestaPorTiroRef.current.size);
    setBasketCount(countBaskets(cestaPorTiroRef.current));
    setInterruptedCount(interrumpidosRef.current.size);
    setPendingSnapshot(null);
  }, [pendingSnapshot]);

  // Tras guardar en el backend la copia local ya no hace falta.
  const markSaved = useCallback(() => {
    dropSnapshot();
  }, [dropSnapshot]);

  // Devuelve un Blob armado por bloques: en sesiones largas evita un string gigante.
  const getCsv = useCallback(() => {
    const blob = buildCsvBlob(
      samplesRef.current,
      cestaPorTiroRef.current,
      sessionIdRef.current,
      interrumpidosRef.current
    );
    return { blob, sessionId: sessionIdRef.current };
  }, []);

  return {
    status,
    sampleCount,
    recentSamples,
    sessionActive,
    shotCount,
    basketCount,
    interruptedCount,
    invalidLineCount,
    ignoredBasketCount,
    error,
    deviceName,
    keepAwakeMode,
    reconnectAttempt,
    backgroundGapSecs,
    dismissBackgroundGap: () => setBackgroundGapSecs(0),
    recentDevices,
    pendingSnapshot,
    sessionId: sessionIdRef.current,
    connect,
    reconnectNow,
    newSession: resetSessionState,
    disconnect,
    forgetDevice: forgetKnownDevice,
    restoreSession,
    discardSnapshot: dropSnapshot,
    markSaved,
    getCsv,
  };
}
