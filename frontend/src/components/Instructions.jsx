export default function Instructions() {
  return (
    <div className="card instructions">
      <h2>Antes de empezar</h2>
      <ol>
        <li>
          <strong>Usa Bluefy, no Safari.</strong> iOS no soporta Web Bluetooth
          en Safari — instala{" "}
          <a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055" target="_blank" rel="noreferrer">
            Bluefy
          </a>{" "}
          y abre esta página dentro de la app. En Android o desktop, Chrome o
          Edge funcionan directamente.
        </li>
        <li>Verifica que la micro:bit esté encendida y con el firmware BLE UART flasheado.</li>
        <li>
          Presiona <strong>&quot;Conectar a micro:bit&quot;</strong> y elige tu dispositivo en la
          lista (aparece como &quot;BBC micro:bit [xxxxx]&quot;).
        </li>
        <li>
          <strong>Ceba la placa con B:</strong> tras conectar (y tras cada reconexión) pulsa{" "}
          <strong>B</strong> una vez <em>antes</em> de la primera A. Si la primera pulsación es A,
          la micro:bit muestra el error 020. Esa B de cebado no se cuenta como canasta.
        </li>
        <li>
          Botón <strong>A</strong> en la micro:bit: inicia/detiene la captura de cada tiro.
          Botón <strong>B</strong>: marca canasta.
        </li>
        <li>Cuando termines la sesión, descarga o guarda el CSV.</li>
      </ol>
    </div>
  );
}
