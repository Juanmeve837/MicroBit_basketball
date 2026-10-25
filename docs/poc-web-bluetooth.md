# PoC original de captura Web Bluetooth (`frontend/`, eliminada)

Esta carpeta se eliminó del árbol de trabajo en la rama `chore/limpieza-repo`.
Su código sigue disponible en el historial de git (ver "Recuperarla").

## Qué era

Webapp React + Vite independiente (con su propio `package.json`) que se
conectaba a la micro:bit directo por Bluetooth UART desde el navegador, sin
pasar por nRF Connect: capturaba en vivo, armaba el CSV en el cliente y lo
enviaba al backend con `POST /api/sesion`. Se creó en los commits `d2c4042`,
`97246be` y `7346c3d`; el último que la tocó fue `1d92a07`.

## Por qué se eliminó

La página `#/captura` del dashboard (`src/pages/Captura.jsx`) la reemplazó
dentro de la app desplegada. La PoC era una copia anterior, no se desplegaba
ni se mantenía, y duplicaba los servicios BLE de `src/`.

## Dónde quedó cada pieza

| PoC (`frontend/src/`)                 | Vigente                                   |
|---------------------------------------|-------------------------------------------|
| `services/bluetooth.js`               | `src/services/bluetooth.js`               |
| `services/ble-parser.js`              | `src/services/ble-parser.js`              |
| `services/csv-generator.js`           | `src/services/csv-generator.js` (por bloques de 5000 filas, `Blob`) |
| `services/api.js`                     | `src/services/api.js` (timeout de 120 s)  |
| `hooks/useBluetooth.js`               | `src/hooks/useBluetooth.js`               |
| `components/LiveCapture.jsx`, `BluetoothConnect.jsx`, `DataIndicator.jsx`, `Instructions.jsx` | `src/pages/Captura.jsx` |

## Conocimiento que no está en el código

- **Navegadores:** Chrome/Edge en escritorio y Android. En iOS, Safari no
  soporta Web Bluetooth: usar **Bluefy**. Fuera de `localhost` se exige HTTPS
  (mkcert + `vite --https`, o un túnel como ngrok/cloudflared).
- **Protocolo UART:** líneas de texto con `\n`, fragmentadas en paquetes BLE
  de ≤20 bytes. `x,y,z` = muestra, `E`/`END` = fin de tiro (2ª pulsación de A),
  `B`/`BASKET` = canasta. El firmware no envía el número de tiro; el cliente lo
  cuenta en cada fin de tiro (misma lógica que `ultimo_tiro` en
  `utils/parsers.py::build_dataframe`).
- **Error 020:** si la primera pulsación tras conectar es **A**, la micro:bit
  muestra 020 (sin memoria). La primera debe ser **B** (activa la sesión, no es
  canasta), también tras cada reconexión.
- **Cambios de firmware probados que empeoran el 020 (no repetir):** handlers
  `onBluetoothConnected/Disconnected` y enviar `x,y,z` en una sola escritura UART.
- **Reconexión:** un solo listener por característica y descartar la línea
  parcial pendiente, para evitar "líneas corruptas".
- La PoC asumía que `/api/sesion` aún no existía en el backend; hoy sí existe.

## Recuperarla

```bash
git show 1d92a07:frontend/README.md          # leer un archivo
git checkout 1d92a07 -- frontend/            # restaurar la carpeta
```
