# Basket Tracker — Frontend (Web Bluetooth)

Webapp React que se conecta directamente a la micro:bit por Bluetooth (UART),
sin pasar por nRF Connect: captura en vivo, genera el CSV en el navegador y
lo envía al backend.

## Correr en desarrollo

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

- **Desktop:** Chrome o Edge, funciona directo sobre `localhost`.
- **iOS:** Web Bluetooth no existe en Safari. Usa la app **Bluefy** y, dentro
  de ella, navega a la URL de tu máquina en la red local
  (`npm run dev` ya expone `--host`). Web Bluetooth exige HTTPS fuera de
  `localhost`, así que para probar desde el celular necesitas servir con
  HTTPS (por ejemplo con [mkcert](https://github.com/FiloSottile/mkcert) +
  `vite --https`, o un túnel como `ngrok`/`cloudflared`).
- **Android:** Chrome funciona igual que en desktop.

## Variables de entorno

`VITE_API_URL` — URL del backend (default `http://localhost:8000`, ver
`config/config.yaml` en la raíz del repo). Configúrala en `frontend/.env.local`
si el backend corre en otro host/puerto.

## Estructura

```
src/
├── services/
│   ├── bluetooth.js       Web Bluetooth: requestDevice, GATT, UART
│   ├── ble-parser.js      Reconstruye líneas UART + parsea eventos DATA/END/BASKET
│   ├── csv-generator.js   Arma filas + CSV (mismo esquema que utils/parsers.py)
│   └── api.js             POST /api/sesion al backend
├── hooks/
│   └── useBluetooth.js    Estado de conexión, buffer, reconexión automática
└── components/
    ├── BluetoothConnect.jsx   Botón + estado de conexión
    ├── LiveCapture.jsx        Gráfico de potencia en vivo + guardar/descargar
    ├── DataIndicator.jsx      Contador de muestras/tiros/canastas
    └── Instructions.jsx       Guía paso a paso (Bluefy, botones A/B)
```

## Formato del protocolo UART

El firmware (`utils/microbit_lanzamiento.js`) envía líneas de texto
terminadas en `\n`, fragmentadas en paquetes BLE de ≤20 bytes:

| Línea     | Significado                          |
|-----------|----------------------------------------|
| `x,y,z`   | Muestra de aceleración (mg)           |
| `END`     | Fin de tiro (botón A)                  |
| `BASKET`  | Canasta (botón B)                      |

El firmware no envía número de tiro; `useBluetooth.js` lo cuenta localmente
(incrementa en cada `END`), replicando la lógica de `ultimo_tiro` en
`utils/parsers.py::build_dataframe` para poder reasignar `BASKET` incluso si
llega antes o después del `END`.

## Backend

`services/api.js` asume `POST {VITE_API_URL}/api/sesion` con un
`multipart/form-data` (`session_id`, `file`). **El backend FastAPI todavía
no está implementado en este repo** (ver `config/config.yaml` sección `api`
y el README raíz, "Pendiente"). Hasta que exista, "Guardar sesión" fallará
con un error de red — el botón "Guardar lo que llegó" siempre permite
descargar el CSV localmente como respaldo.
