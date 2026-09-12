import { isWebBluetoothSupported } from "../services/bluetooth";
import { CONNECTION_STATUS } from "../hooks/useBluetooth";

const STATUS_LABELS = {
  [CONNECTION_STATUS.DISCONNECTED]: { label: "Desconectado", className: "status-off" },
  [CONNECTION_STATUS.CONNECTING]: { label: "Conectando…", className: "status-pending" },
  [CONNECTION_STATUS.CONNECTED]: { label: "Conectado", className: "status-on" },
  [CONNECTION_STATUS.CAPTURING]: { label: "Capturando", className: "status-on" },
  [CONNECTION_STATUS.RECONNECTING]: { label: "Reconectando…", className: "status-pending" },
};

export default function BluetoothConnect({ status, error, onConnect, onDisconnect }) {
  const supported = isWebBluetoothSupported();
  const isConnected =
    status === CONNECTION_STATUS.CONNECTED ||
    status === CONNECTION_STATUS.CAPTURING ||
    status === CONNECTION_STATUS.RECONNECTING;
  const { label, className } = STATUS_LABELS[status] ?? STATUS_LABELS[CONNECTION_STATUS.DISCONNECTED];

  if (!supported) {
    return (
      <div className="card">
        <p className="error">
          Este navegador no soporta Web Bluetooth. Abre esta página en Bluefy (iOS) o Chrome/Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="status-row">
        <span className={`status-dot ${className}`} />
        <span>{label}</span>
      </div>

      {!isConnected ? (
        <button onClick={onConnect} disabled={status === CONNECTION_STATUS.CONNECTING}>
          Conectar a micro:bit
        </button>
      ) : (
        <button onClick={onDisconnect} className="secondary">
          Desconectar
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
