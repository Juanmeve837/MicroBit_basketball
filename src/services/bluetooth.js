// bluetooth.js — Wrapper sobre Web Bluetooth API para el servicio UART de micro:bit.
//
// Requiere Web Bluetooth (Chrome/Edge en desktop y Android, o Bluefy en iOS —
// Safari no lo soporta). La página debe servirse por HTTPS o localhost.

export const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const UART_TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // escribir hacia micro:bit (write)
export const UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // datos desde micro:bit (indicate)

export function isIOS() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

const PAIRING_HINT =
  'Este firmware de micro:bit exige emparejamiento (pairing) con passkey, que Web Bluetooth no puede completar. ' +
  'En MakeCode: engranaje ⚙️ → Project Settings → activa "No pairing required", vuelve a flashear y reintenta.';

function wrapGattError(err) {
  const msg = String(err?.message || err);
  if (/not supported/i.test(msg)) {
    return new Error(PAIRING_HINT);
  }
  return err instanceof Error ? err : new Error(msg);
}

// Un solo listener por caracteristica: al reconectar, Chrome puede devolver el
// mismo objeto y un addEventListener extra duplicaria cada fragmento.
const rxHandlers = new WeakMap();

export async function attachRx(rxCharacteristic, onData) {
  const previous = rxHandlers.get(rxCharacteristic);
  if (previous) {
    rxCharacteristic.removeEventListener("characteristicvaluechanged", previous);
  }
  const decoder = new TextDecoder("utf-8");
  const handler = (event) => onData?.(decoder.decode(event.target.value));
  rxHandlers.set(rxCharacteristic, handler);
  rxCharacteristic.addEventListener("characteristicvaluechanged", handler);
  await rxCharacteristic.startNotifications();
}

// --- Dispositivos recordados -------------------------------------------------
// Web Bluetooth no permite listar placas cercanas, asi que recordamos las que ya
// conectamos (id estable por origen + nombre). Si el navegador expone
// navigator.bluetooth.getDevices() se pueden reconectar sin abrir el selector.

const KNOWN_DEVICES_KEY = "microbit.knownDevices";
const MAX_KNOWN_DEVICES = 5;

export function loadKnownDevices() {
  try {
    const list = JSON.parse(localStorage.getItem(KNOWN_DEVICES_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveKnownDevices(list) {
  try {
    localStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(list));
  } catch {
    // Sin storage (modo privado, cuota): la lista es solo una comodidad.
  }
}

export function rememberDevice(device) {
  if (!device?.id) return loadKnownDevices();
  const otros = loadKnownDevices().filter((d) => d.id !== device.id);
  const entry = { id: device.id, name: device.name || "micro:bit", lastUsed: Date.now() };
  const list = [entry, ...otros].slice(0, MAX_KNOWN_DEVICES);
  saveKnownDevices(list);
  return list;
}

export function forgetDevice(id) {
  const list = loadKnownDevices().filter((d) => d.id !== id);
  saveKnownDevices(list);
  return list;
}

/** Dispositivos ya autorizados que el navegador deja reconectar sin selector ([] si no soporta getDevices). */
export async function getAuthorizedDevices() {
  if (typeof navigator === "undefined" || typeof navigator.bluetooth?.getDevices !== "function") return [];
  try {
    return await navigator.bluetooth.getDevices();
  } catch {
    return [];
  }
}

// Un solo listener de desconexion por dispositivo: reconectar sobre el mismo
// objeto no debe acumular handlers.
const disconnectHandlers = new WeakMap();

function watchDisconnect(device, onDisconnect) {
  const previous = disconnectHandlers.get(device);
  if (previous) device.removeEventListener("gattserverdisconnected", previous);
  const handler = () => onDisconnect?.();
  disconnectHandlers.set(device, handler);
  device.addEventListener("gattserverdisconnected", handler);
}

async function openUart(device, onData) {
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    const rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    await attachRx(rxCharacteristic, onData);
    return { device, server, rxCharacteristic };
  } catch (err) {
    if (device.gatt.connected) device.gatt.disconnect();
    throw wrapGattError(err);
  }
}

/**
 * Conecta a una micro:bit por BLE UART.
 *
 * @param {Object} callbacks
 * @param {(chunk: string) => void} callbacks.onData - fragmento de texto recibido (≤20 bytes)
 * @param {() => void} callbacks.onDisconnect - se dispara cuando el dispositivo se desconecta
 * @param {BluetoothDevice} [callbacks.device] - dispositivo ya autorizado: salta el selector; si falla se abre el selector
 * @returns {Promise<{device: BluetoothDevice, server: BluetoothRemoteGATTServer, rxCharacteristic: BluetoothRemoteGATTCharacteristic}>}
 */
export async function connectToMicrobit({ onData, onDisconnect, acceptAll = isIOS(), device: knownDevice }) {
  if (!isWebBluetoothSupported()) {
    throw new Error("Este navegador no soporta Web Bluetooth. Usa Bluefy (iOS) o Chrome/Edge.");
  }

  if (knownDevice) {
    try {
      watchDisconnect(knownDevice, onDisconnect);
      return await openUart(knownDevice, onData);
    } catch (err) {
      console.warn("[ble] no se pudo reconectar al dispositivo recordado, abriendo selector:", err);
    }
  }

  // Bluefy (iOS) no lista la micro:bit con filtros: el servicio UART no viene en
  // el anuncio y el nombre no siempre coincide. Sin filtro si aparece.
  const device = await navigator.bluetooth.requestDevice(
    acceptAll
      ? { acceptAllDevices: true, optionalServices: [UART_SERVICE_UUID] }
      : {
          filters: [{ namePrefix: "BBC micro:bit" }, { services: [UART_SERVICE_UUID] }],
          optionalServices: [UART_SERVICE_UUID],
        }
  );

  watchDisconnect(device, onDisconnect);
  return openUart(device, onData);
}

export async function disconnectFromMicrobit(device) {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
  }
}
