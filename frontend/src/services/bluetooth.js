// bluetooth.js — Wrapper sobre Web Bluetooth API para el servicio UART de micro:bit.
//
// Requiere Web Bluetooth (Chrome/Edge en desktop y Android, o Bluefy en iOS —
// Safari no lo soporta). La página debe servirse por HTTPS o localhost.

export const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // escribir hacia micro:bit
export const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notificaciones desde micro:bit

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

/**
 * Conecta a una micro:bit por BLE UART.
 *
 * @param {Object} callbacks
 * @param {(chunk: string) => void} callbacks.onData - fragmento de texto recibido (≤20 bytes)
 * @param {() => void} callbacks.onDisconnect - se dispara cuando el dispositivo se desconecta
 * @returns {Promise<{device: BluetoothDevice, server: BluetoothRemoteGATTServer, rxCharacteristic: BluetoothRemoteGATTCharacteristic}>}
 */
export async function connectToMicrobit({ onData, onDisconnect }) {
  if (!isWebBluetoothSupported()) {
    throw new Error("Este navegador no soporta Web Bluetooth. Usa Bluefy (iOS) o Chrome/Edge.");
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "BBC micro:bit" }, { services: [UART_SERVICE_UUID] }],
    optionalServices: [UART_SERVICE_UUID],
  });

  device.addEventListener("gattserverdisconnected", () => {
    onDisconnect?.();
  });

  let server, service, rxCharacteristic;
  try {
    server = await device.gatt.connect();
    service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);

    const decoder = new TextDecoder("utf-8");
    rxCharacteristic.addEventListener("characteristicvaluechanged", (event) => {
      const chunk = decoder.decode(event.target.value);
      onData?.(chunk);
    });
    await rxCharacteristic.startNotifications();
  } catch (err) {
    if (device.gatt.connected) device.gatt.disconnect();
    throw wrapGattError(err);
  }

  return { device, server, rxCharacteristic };
}

export async function disconnectFromMicrobit(device) {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
  }
}
