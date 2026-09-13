# 🏀 Basket Tracker — micro:bit

Sistema de análisis de lanzamientos de baloncesto usando un micro:bit como
sensor de movimiento (acelerómetro). El micro:bit se lleva en la muñeca o en
el balón, captura los ejes X/Y/Z durante cada tiro y marca si fue canasta
(botón B), y los datos se envían por Bluetooth (UART) o USB al PC para su
post-procesamiento y análisis. Incluye un backend API (FastAPI) y un
dashboard web (React) para subir sesiones y visualizar métricas sin pasar
por los notebooks.

> **Estado:** proyecto en desarrollo activo. Este README se irá actualizando
> a medida que avance el proyecto.

## Flujo del proyecto

1. **Captura** — firmware en la micro:bit (`scripts/utils/microbit_lanzamiento.js`,
   MakeCode) transmite muestras de aceleración por sesión.
2. **Post-procesamiento** — `scripts/procesar_sesion.py` limpia y estructura
   una sesión cruda BLE (`data/raw/`) en un CSV procesado (`data/processed/`).
3. **Base de datos de tiros** — `scripts/construir_bd_tiros.py` une todas las
   sesiones procesadas en `data/db/BD_tiros.csv`, asignando a cada tiro un
   ID único global (nunca se repite entre sesiones).
4. **Análisis** — `notebooks/02_analisis_sesion.ipynb` lee `data/db/BD_tiros.csv`
   y genera gráficos y métricas tratando todos los tiros de todas las
   sesiones como un solo conjunto (`results/figures/`).
5. **Dashboard web** (alternativa a los notebooks) — el backend FastAPI
   (`main.py`) recibe el log crudo directamente, calcula las mismas métricas
   y las expone a un frontend React que se despliega en GitHub Pages. Ver
   las secciones [Backend](#backend-fastapi) y [Frontend](#frontend-react--vite).

## Estructura del repositorio

```
config/           Configuración centralizada (config.yaml + parser Config)
data/
  raw/            Sesiones crudas (BLE/USB), no versionadas
  processed/       Sesiones procesadas (CSV)
  db/             BD_tiros.csv — todas las sesiones unidas por tiro
  backup/         Backups automáticos
notebooks/        Pipeline en notebooks (02) + archived/
scripts/
  procesar_sesion.py     Post-procesa un log BLE crudo en CSV limpio
  construir_bd_tiros.py  Une las sesiones procesadas en data/db/BD_tiros.csv
  utils/          Funciones reutilizables (parsers, validators, paths)
                  y firmware de referencia (microbit_lanzamiento.js)
  archived/       Planes y documentos superados
results/
  figures/        Gráficos generados por los notebooks
  tables/         Tablas resumen (CSV)
  reports/        Reportes
  latest_session/ Resultados de la última sesión (no versionado)
logs/             Logs de ejecución (no versionado)

main.py, models.py,          Backend API (FastAPI) — ver sección Backend
processors.py, validators.py,
database.py, tests/

src/, index.html,            Frontend (React + Vite) — ver sección Frontend
package.json, vite.config.js

.github/workflows/           CI/CD (deploy del frontend a GitHub Pages)
```

## Configuración

Todo el proyecto lee su configuración desde `config/config.yaml` a través de
la clase singleton `Config` (`config/config.py`):

```python
from config.config import Config

cfg = Config.instance()
data_dir = cfg.get_path('data_raw')
sampling_rate = cfg.get_param('analysis', 'sampling_rate_hz')
```

Ver [`config/README.md`](config/README.md) para el detalle de parámetros
(frecuencia de muestreo, umbrales de potencia, logging, API).

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

Requiere Python 3.8+. Dependencias principales: `pandas`, `numpy`, `matplotlib`,
`seaborn`, `scipy`, `pyserial`/`bleak` (comunicación micro:bit), `fastapi`
(API backend), `jupyter`, `scikit-learn`/`joblib` (ML).

## Cómo correr el proyecto completo

Guía paso a paso de todo el pipeline, desde una captura nueva hasta el análisis.

### 1. Instalar dependencias

Ver [Instalación](#instalación) arriba (`python -m venv .venv` + `pip install -r requirements.txt`).

### 2. Capturar una sesión con la micro:bit

Flashear `scripts/utils/microbit_lanzamiento.js` a la micro:bit (MakeCode).
Botón **A** inicia/detiene la captura, botón **B** marca canasta. Exportar
el log desde nRF Connect (Android/iOS) como CSV y guardarlo en `data/raw/`.

### 3. Procesar la sesión cruda

```bash
python scripts/procesar_sesion.py "BBC microbit [vipiv] (11).csv"
```

Acepta una ruta absoluta o el nombre de un archivo dentro de `data/raw/`. Si
no se pasa `--output`, autogenera el siguiente `sesion_procesada_N.csv` libre
en `data/processed/`. Ver `python scripts/procesar_sesion.py --help` para
todas las opciones.

### 4. Actualizar la base de datos de tiros

```bash
python scripts/construir_bd_tiros.py
```

Lee todo `data/processed/`, detecta qué sesiones todavía no están en
`data/db/BD_tiros.csv` y las agrega, asignando a cada tiro un ID único
global. Es seguro correrlo repetidas veces: si no hay sesiones nuevas, no
hace nada; las ya guardadas nunca se renumeran. Usa `--rebuild` solo si
necesitas reconstruir la BD desde cero (crea backup automático antes).

### 5. Analizar

```bash
jupyter notebook notebooks/02_analisis_sesion.ipynb
```

Lee `data/db/BD_tiros.csv` y trata todos los tiros de todas las sesiones
como un solo conjunto: curvas de potencia, comparativa cesta/fallo, firma
de movimiento por eje, KPIs globales. Los PNG se guardan en `results/figures/`.

Alternativa: subir el log crudo directo al [backend](#backend-fastapi) y
verlo en el [dashboard web](#frontend-react--vite), sin pasar por notebooks.

### Agregar una sesión nueva más adelante

Repetir los pasos 3 y 4 (procesar la sesión + actualizar la BD) y volver a
correr el notebook del paso 5 para incluirla en el análisis.

## Formato de datos (CSV procesado)

| Columna     | Tipo   | Descripción                          |
|-------------|--------|---------------------------------------|
| `timestamp` | string | Hora de la muestra (`HH:MM:SS.mmm`)  |
| `session`   | string | ID de sesión (`YYYYMMDD_UUID[8]`)    |
| `tiro`      | int    | Número de tiro                        |
| `x/y/z`     | int    | Aceleración en mg                     |
| `potencia`  | float  | Magnitud √(x²+y²+z²)                  |
| `cesta`     | int    | 1 = canasta, 0 = fallo                |

`data/processed/sesion_procesada_N.csv` y `data/db/BD_tiros.csv` comparten
este mismo esquema, pero `tiro` significa cosas distintas: en el primero es
el contador local de esa sesión (se reinicia en cada captura); en el segundo
es un ID único en toda la base de datos, que nunca se repite entre sesiones.

## Backend (FastAPI)

API que recibe el mismo log BLE crudo del paso 2, lo procesa en memoria
(sin pasar por `data/processed/` ni notebooks) y expone las métricas al
frontend.

### Stack

- **FastAPI** (Python 3.11)
- **Pandas / NumPy** — parseo del log BLE y calculo de metricas
- **Pydantic** — esquemas de request/response
- **Persistencia** — SQLite via [libSQL](https://docs.turso.tech/libsql) (archivo local en dev/tests, Turso remoto en produccion)
- **Pytest** — tests unitarios y de integracion (TestClient)

### Estructura

```
main.py            App FastAPI y endpoints
models.py          Esquemas Pydantic (SessionInput, SesionOutput, TiroData, ErrorResponse)
processors.py       Parseo BLE (D/E/B) + calculo de metricas por tiro/sesion
validators.py       Validacion de upload crudo y del DataFrame resultante
database.py         Persistencia: SQLite/libSQL (tablas sessions + shots), previene duplicados
conftest.py         Hace importables los modulos de la raiz desde tests/
Procfile            Comando de arranque para Render
render.yaml         Blueprint de deploy para Render (free tier)
tests/
  conftest.py       Fixture sample_raw_log + generador build_raw_log
  test_validators.py
  test_processors.py
  test_api.py
```

### Correr el servidor

```bash
uvicorn main:app --reload --port 8000
```

Docs interactivas (Swagger) en `http://localhost:8000/docs`.

### Endpoints

Nombres de ruta y de campos alineados al contrato que consume el frontend
(`src/services/api.js`), no a la nomenclatura en español de los scripts
de análisis.

| Metodo | Ruta                       | Descripcion                                              |
|--------|----------------------------|-----------------------------------------------------------|
| GET    | `/api/health`              | Healthcheck                                                |
| POST   | `/api/upload`               | Sube un log BLE crudo (`multipart/form-data`, campo `file`); opcional `session_id` como query param. Devuelve `SesionOutput` con metricas por tiro. |
| GET    | `/api/sessions`             | Lista sesiones (resumen). Query opcionales: `date_from`, `date_to` (ISO `YYYY-MM-DD`), `sort_by`, `order` (`asc`/`desc`). |
| GET    | `/api/sessions/{session_id}` | Detalle completo de una sesion (metricas por tiro, ejes, consistencia) |
| GET    | `/api/compare`              | Datos agregados de todas las sesiones para graficos comparativos (evolucion de efectividad, boxplot de potencia, distribucion de ejes) |

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@data/raw/sesion_ejemplo.csv"
```

### Pipeline de procesamiento

1. **Validacion de upload** (`validators.validate_raw_upload`) — archivo no vacio, UTF-8 valido.
2. **Parseo BLE** (`processors.process_raw_log`):
   - `parse_ble_log` extrae fragmentos del export nRF Connect.
   - `rebuild_ble_lines` reconstruye lineas completas a partir de fragmentos.
   - `parse_events` tipa cada linea como `D` (dato de eje), `E` (fin de tiro) o `B` (canasta).
   - `build_dataframe` arma el DataFrame final: `timestamp, session, tiro, x, y, z, potencia, cesta`.
3. **Validacion de datos** (`validators.validate_dataframe`) — columnas requeridas, nulos, rangos. No bloquea la respuesta; los problemas quedan en el log del servidor.
4. **Metricas** (`processors.compute_session_summary` / `compute_tiro_metrics`):
   - Por tiro: `potencia_max/avg/min`, `cesta`.
   - Por sesion: `efectividad`, `potencia_avg`, `consistencia` (indice 0-100 basado en el coeficiente de variacion de la potencia entre tiros — 100 = misma potencia en todos los tiros), `axis_stats` (media/desviacion de `x`, `y`, `z`).
5. **Persistencia** (`database.save_session`) — fila en la tabla `sessions` + filas en `shots` (SQLite/libSQL). Un `session_id` repetido devuelve **400** en vez de sobrescribir.

### Manejo de errores

- CSV/log invalido o sin datos parseables → **400** con `{"detail": ..., "errors": [...]}`.
- `session_id` duplicado → **400**.
- Sesion/CSV no encontrado → **404**.
- Excepcion no controlada → **500**, loggeada con `logger.exception` (nunca se cae el proceso).

### Tests del backend

```bash
pytest
```

Cobertura:
- `test_validators.py` — validacion de DataFrame (columnas, nulos, rangos) y de upload crudo.
- `test_processors.py` — parseo BLE completo y calculo de metricas, sobre un log sintetico generado con el mismo formato que exporta nRF Connect.
- `test_api.py` — endpoints end-to-end con `TestClient`, persistencia redirigida a un directorio temporal por test (no toca `data/` real).

### Deploy (Render)

GitHub Pages solo sirve estatico, asi que este backend se despliega aparte
(Render free tier) y el frontend le apunta via `VITE_API_URL`.

1. En [render.com](https://render.com) → **New +** → **Blueprint**, conecta el
   repo `MicroBit_basketball` y selecciona la rama a desplegar (`main`).
   Render detecta `render.yaml` automaticamente.
2. Si preferis configurarlo a mano en vez del Blueprint: **New +** → **Web
   Service**, build command `pip install -r requirements.txt`, start command
   `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Copia la URL publica que asigna Render (`https://<nombre>.onrender.com`) y
   configurala como `VITE_API_URL=https://<nombre>.onrender.com/api` en el
   frontend (ver sección Frontend → Deploy).

**Persistencia (Turso)**: el filesystem de Render free tier es efimero — un
archivo SQLite local se perderia en cada redeploy o cuando el servicio se
duerme por inactividad. Por eso `database.py` usa [Turso](https://turso.tech)
(libSQL) en produccion, que persiste los datos gratis fuera del filesystem
del servicio:

1. Crear cuenta en [turso.tech](https://turso.tech) y una base de datos:
   `turso db create basket-tracker`.
2. Obtener la URL de conexion: `turso db show basket-tracker --url`.
3. Generar un token: `turso db tokens create basket-tracker`.
4. En Render, agregar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` como
   variables de entorno (Environment → Secret File o Environment Variables)
   con los valores de los pasos 2 y 3.

Sin estas dos variables seteadas, `database.py` cae automaticamente a un
archivo SQLite local (`data/db/basket.db`) — asi es como corren los tests y
el desarrollo local, sin necesidad de una cuenta de Turso.

## Frontend (React + Vite)

Interfaz web para subir sesiones y visualizar dashboards.

### Correr en local

```bash
npm install
npm run dev      # http://localhost:5173
```

Por defecto apunta a la API en `http://localhost:8000/api` (ver `.env.example`
→ copiar a `.env` y ajustar `VITE_API_URL` si es distinto). El `vite.config.js`
también proxea `/api` hacia `http://localhost:8000` en desarrollo.

### Estructura

```
src/
  components/   UploadForm, Dashboard, KPICard, Charts, SessionHistory
  pages/        Home, SessionDetail, Compare
  services/     api.js (cliente Axios), sessionCache.js (cache en memoria, TTL 5 min)
```

### Contrato de API

Ver la tabla de endpoints en la sección [Backend](#backend-fastapi) — el
frontend consume ese mismo esquema de rutas y campos.

### Deploy a GitHub Pages

El repo incluye `.github/workflows/deploy-pages.yml`: en cada push a `main`
compila (`npm run build`) y publica `dist/` vía GitHub Pages (source =
"GitHub Actions", configurado en Settings → Pages).

Pasos para que funcione en producción:

1. Desplegar el backend en Render (ver sección Backend → Deploy) y copiar
   la URL pública (`https://<nombre>.onrender.com`).
2. En GitHub → Settings → Secrets and variables → Actions → **Variables**,
   crear `VITE_API_URL` = `https://<nombre>.onrender.com/api`. Sin esto, el
   build usa `http://localhost:8000/api` y el sitio publicado no podrá
   hablar con ningún backend real.

Notas de la config para que funcione bajo un subpath de GitHub Pages
(`https://<user>.github.io/MicroBit_basketball/`):
- `vite.config.js` fija `base: "/MicroBit_basketball/"` solo en build (en
  dev sigue en `/` para que el proxy de `/api` funcione igual).
- El router usa `HashRouter` en vez de `BrowserRouter` (`main.jsx`) porque
  GitHub Pages no soporta rewrites del lado del servidor — con
  `BrowserRouter`, recargar directamente en `/sessions/:id` daría 404.

## Pendiente / próximos pasos

- [x] API FastAPI para consumo en tiempo real — ver sección Backend
- [x] Dashboard web (React) — ver sección Frontend
- [ ] Modelo de ML para predicción de acierto (rama `feature/ml-predictor`, dependencias `scikit-learn`/`joblib` ya incluidas)
- [ ] Captura en vivo por Web Bluetooth desde el navegador (rama `feature/web-bluetooth`)
- [ ] Rate limiting en el backend (opcional, no bloqueante para el MVP)
- [x] Migrar la persistencia del backend de CSV+JSON a SQLite/Turso (ver sección Backend → Deploy)
- [ ] Migrar `scripts/construir_bd_tiros.py` y el notebook de análisis a la misma base de datos (hoy siguen usando CSVs locales, fuera del alcance de la API desplegada)
- [ ] Restringir CORS del backend al dominio de GitHub Pages antes de un uso real (hoy abierto con `allow_origins=["*"]`)
