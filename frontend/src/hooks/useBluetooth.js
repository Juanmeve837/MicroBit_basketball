import { useCallback, useRef, useState } from "react";
import {
  connectToMicrobit,
  disconnectFromMicrobit,
  UART_SERVICE_UUID,
  UART_RX_CHARACTERISTIC_UUID,
} from "../services/bluetooth";
import { LineBuffer, parseLine, EVENT_TYPES } from "../services/ble-parser";
import { buildSessionRows, rowsToCsv } from "../services/csv-generator";

export const CONNECTION_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  CAPTURING: "capturing",
  RECONNECTING: "reconnecting",
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

function nowTimestamp() {
  const d = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function generateSessionId() {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const uuid = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${fecha}_${uuid}`;
}

export function useBluetooth() {
  const [status, setStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [samples, setSamples] = useState([]);
  const [shotCount, setShotCount] = useState(0);
  const [basketCount, setBasketCount] = useState(0);
  const [error, setError] = useState(null);
  const [invalidLineCount, setInvalidLineCount] = useState(0);

  const deviceRef = useRef(null);
  const lineBufferRef = useRef(new LineBuffer());
  const cestaPorTiroRef = useRef(new Map());
  const currentTiroRef = useRef(1);
  const ultimoTiroRef = useRef(null);
  const sessionIdRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);

  const resetSessionState = useCallback(() => {
    lineBufferRef.current = new LineBuffer();
    cestaPorTiroRef.current = new Map();
    currentTiroRef.current = 1;
    ultimoTiroRef.current = null;
    sessionIdRef.current = generateSessionId();
    setSamples([]);
    setShotCount(0);
    setBasketCount(0);
    setInvalidLineCount(0);
    setError(null);
  }, []);

  const handleLine = useCallback((linea) => {
    const evento = parseLine(linea);
    if (!evento) {
      setInvalidLineCount((n) => n + 1);
      return;
    }

    if (evento.type === EVENT_TYPES.DATA) {
      const tiro = currentTiroRef.current;
      ultimoTiroRef.current = tiro;
      const sample = { timestamp: nowTimestamp(), tiro, x: evento.x, y: evento.y, z: evento.z };
      setSamples((prev) => [...prev, sample]);
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
      const tiro = ultimoTiroRef.current;
      if (tiro !== null) {
        const eraCesta = cestaPorTiroRef.current.get(tiro) === 1;
        cestaPorTiroRef.current.set(tiro, 1);
        setShotCount(cestaPorTiroRef.current.size);
        if (!eraCesta) setBasketCount((n) => n + 1);
      }
    }
  }, []);

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
      const decoder = new TextDecoder("utf-8");
      rx.addEventListener("characteristicvaluechanged", (event) => {
        handleData(decoder.decode(event.target.value));
      });
      await rx.startNotifications();
      reconnectAttemptsRef.current = 0;
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

  const connect = useCallback(async () => {
    setError(null);
    setStatus(CONNECTION_STATUS.CONNECTING);
    intentionalDisconnectRef.current = false;
    resetSessionState();

    try {
      const { device } = await connectToMicrobit({
        onData: handleData,
        onDisconnect: handleDisconnect,
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

  const getCsv = useCallback(() => {
    const rows = buildSessionRows(samples, cestaPorTiroRef.current, sessionIdRef.current);
    return { csv: rowsToCsv(rows), sessionId: sessionIdRef.current, rows };
  }, [samples]);

  return {
    status,
    samples,
    shotCount,
    basketCount,
    invalidLineCount,
    error,
    sessionId: sessionIdRef.current,
    connect,
    disconnect,
    getCsv,
  };
}
