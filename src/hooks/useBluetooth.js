import { useCallback, useRef, useState } from "react";
import {
  connectToMicrobit,
  attachRx,
  disconnectFromMicrobit,
  UART_SERVICE_UUID,
  UART_RX_CHARACTERISTIC_UUID,
} from "../services/bluetooth";
import { LineBuffer, parseLine, EVENT_TYPES } from "../services/ble-parser";
import { buildCsvBlob } from "../services/csv-generator";

export const CONNECTION_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  CAPTURING: "capturing",
  RECONNECTING: "reconnecting",
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;
// Las muestras viven en un ref (no en estado) para que una sesion larga no copie
// el array entero en cada linea; la UI se refresca como mucho cada FLUSH_MS.
const FLUSH_MS = 250;
const RECENT_SAMPLES = 150;

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

export function useBluetooth() {
  const [status, setStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [sampleCount, setSampleCount] = useState(0);
  const [recentSamples, setRecentSamples] = useState([]);
  const [shotCount, setShotCount] = useState(0);
  const [basketCount, setBasketCount] = useState(0);
  const [error, setError] = useState(null);
  const [invalidLineCount, setInvalidLineCount] = useState(0);
  const [ignoredBasketCount, setIgnoredBasketCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);

  const samplesRef = useRef([]);
  const flushTimerRef = useRef(null);
  const deviceRef = useRef(null);
  const lineBufferRef = useRef(new LineBuffer());
  const cestaPorTiroRef = useRef(new Map());
  const currentTiroRef = useRef(1);
  const ultimoTiroRef = useRef(null);
  // El primer B tras conectar (o reconectar) activa la sesion: la micro:bit lo
  // exige antes de la primera A y no es una canasta. Los B siguientes si lo son.
  const sessionActiveRef = useRef(false);
  const sessionIdRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);

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
    currentTiroRef.current = 1;
    ultimoTiroRef.current = null;
    sessionActiveRef.current = false;
    sessionIdRef.current = generateSessionId();
    setSessionActive(false);
    setSampleCount(0);
    setRecentSamples([]);
    setShotCount(0);
    setBasketCount(0);
    setInvalidLineCount(0);
    setIgnoredBasketCount(0);
    setError(null);
  }, []);

  const handleLine = useCallback((linea) => {
    const evento = parseLine(linea);
    if (!evento) {
      console.warn("[ble] linea corrupta:", JSON.stringify(linea));
      setInvalidLineCount((n) => n + 1);
      return;
    }

    if (evento.type === EVENT_TYPES.DATA) {
      const tiro = currentTiroRef.current;
      ultimoTiroRef.current = tiro;
      samplesRef.current.push({ timestamp: nowTimestamp(), tiro, x: evento.x, y: evento.y, z: evento.z });
      scheduleFlush();
    } else if (evento.type === EVENT_TYPES.END) {
      const tiro = ultimoTiroRef.current;
      if (tiro !== null) {
        if (!cestaPorTiroRef.current.has(tiro)) {
          cestaPorTiroRef.current.set(tiro, 0);
        }
        currentTiroRef.current = tiro + 1;
        setShotCount(cestaPorTiroRef.current.size);
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
      }
    }
  }, [scheduleFlush]);

  const handleData = useCallback(
    (chunk) => {
      const lineas = lineBufferRef.current.push(chunk);
      lineas.forEach(handleLine);
    },
    [handleLine]
  );

  const attemptReconnect = useCallback(async () => {
    if (intentionalDisconnectRef.current || !deviceRef.current) {
      return;
    }
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setError("Se perdió la conexión BLE y no se pudo reconectar automáticamente.");
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }

    reconnectAttemptsRef.current += 1;
    setStatus(CONNECTION_STATUS.RECONNECTING);

    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));

    try {
      const server = await deviceRef.current.gatt.connect();
      const service = await server.getPrimaryService(UART_SERVICE_UUID);
      const rx = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
      // Descarta media linea pendiente de antes de la caida.
      lineBufferRef.current = new LineBuffer();
      await attachRx(rx, handleData);
      reconnectAttemptsRef.current = 0;
      sessionActiveRef.current = false;
      setSessionActive(false);
      setStatus(CONNECTION_STATUS.CONNECTED);
    } catch (err) {
      attemptReconnect();
    }
  }, [handleData]);

  const handleDisconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) {
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }
    attemptReconnect();
  }, [attemptReconnect]);

  const connect = useCallback(async (options = {}) => {
    setError(null);
    setStatus(CONNECTION_STATUS.CONNECTING);
    intentionalDisconnectRef.current = false;
    resetSessionState();

    try {
      const { device } = await connectToMicrobit({
        onData: handleData,
        onDisconnect: handleDisconnect,
        ...(options.acceptAll ? { acceptAll: true } : {}),
      });
      deviceRef.current = device;
      reconnectAttemptsRef.current = 0;
      setStatus(CONNECTION_STATUS.CONNECTED);
    } catch (err) {
      setError(err.message || String(err));
      setStatus(CONNECTION_STATUS.DISCONNECTED);
    }
  }, [handleData, handleDisconnect, resetSessionState]);

  const disconnect = useCallback(async () => {
    intentionalDisconnectRef.current = true;
    await disconnectFromMicrobit(deviceRef.current);
    setStatus(CONNECTION_STATUS.DISCONNECTED);
  }, []);

  // Devuelve un Blob armado por bloques: en sesiones largas evita un string gigante.
  const getCsv = useCallback(() => {
    const blob = buildCsvBlob(samplesRef.current, cestaPorTiroRef.current, sessionIdRef.current);
    return { blob, sessionId: sessionIdRef.current };
  }, []);

  return {
    status,
    sampleCount,
    recentSamples,
    sessionActive,
    shotCount,
    basketCount,
    invalidLineCount,
    ignoredBasketCount,
    error,
    sessionId: sessionIdRef.current,
    connect,
    newSession: resetSessionState,
    disconnect,
    getCsv,
  };
}
