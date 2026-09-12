import { useBluetooth, CONNECTION_STATUS } from "./hooks/useBluetooth";
import BluetoothConnect from "./components/BluetoothConnect";
import DataIndicator from "./components/DataIndicator";
import LiveCapture from "./components/LiveCapture";
import Instructions from "./components/Instructions";

export default function App() {
  const bluetooth = useBluetooth();
  const isConnected =
    bluetooth.status === CONNECTION_STATUS.CONNECTED ||
    bluetooth.status === CONNECTION_STATUS.CAPTURING ||
    bluetooth.status === CONNECTION_STATUS.RECONNECTING;

  return (
    <div className="app">
      <header>
        <h1>🏀 Basket Tracker</h1>
        <p>Captura de sesión en vivo vía Web Bluetooth</p>
      </header>

      <Instructions />

      <BluetoothConnect
        status={bluetooth.status}
        error={bluetooth.error}
        onConnect={bluetooth.connect}
        onDisconnect={bluetooth.disconnect}
      />

      {isConnected && (
        <>
          <DataIndicator
            sampleCount={bluetooth.samples.length}
            shotCount={bluetooth.shotCount}
            basketCount={bluetooth.basketCount}
            invalidLineCount={bluetooth.invalidLineCount}
          />
          <LiveCapture bluetooth={bluetooth} />
        </>
      )}
    </div>
  );
}
