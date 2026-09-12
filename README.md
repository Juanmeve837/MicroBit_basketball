# Basket Tracker — Backend API

API FastAPI que recibe logs BLE crudos (export de nRF Connect) de sesiones de
tiro con micro:bit, los procesa en metricas por tiro/sesion y las expone al
frontend React.

## Stack

- **FastAPI** (Python 3.11)
- **Pandas / NumPy** — parseo del log BLE y calculo de metricas
- **Pydantic** — esquemas de request/response
- **Persistencia por archivos** — CSV por sesion + indice JSON en `data/`
- **Pytest** — tests unitarios y de integracion (TestClient)

## Estructura

```
main.py            App FastAPI y endpoints
models.py          Esquemas Pydantic (SessionInput, SesionOutput, TiroData, ErrorResponse)
processors.py       Parseo BLE (D/E/B) + calculo de metricas por tiro/sesion
validators.py       Validacion de upload crudo y del DataFrame resultante
database.py         Persistencia: CSV por sesion + indice JSON, previene duplicados
conftest.py         Hace importables los modulos de la raiz desde tests/
Procfile            Comando de arranque para Render
render.yaml         Blueprint de deploy para Render (free tier)
tests/
  conftest.py       Fixture sample_raw_log + generador build_raw_log
  test_validators.py
  test_processors.py
  test_api.py
```

## Setup

```bash
cd D:\worktrees\basket-backend
pip install -r requirements.txt
```

## Correr el servidor

```bash
uvicorn main:app --reload --port 8000
```

Docs interactivas (Swagger) en `http://localhost:8000/docs`.

## Endpoints

Nombres de ruta y de campos alineados al contrato que ya consume
`feature/frontend-react` (`src/services/api.js`), no a la nomenclatura
en espanol de los scripts de analisis.

| Metodo | Ruta                       | Descripcion                                              |
|--------|----------------------------|-----------------------------------------------------------|
| GET    | `/api/health`              | Healthcheck                                                |
| POST   | `/api/upload`               | Sube un log BLE crudo (`multipart/form-data`, campo `file`); opcional `session_id` como query param. Devuelve `SesionOutput` con metricas por tiro. |
| GET    | `/api/sessions`             | Lista sesiones (resumen). Query opcionales: `date_from`, `date_to` (ISO `YYYY-MM-DD`), `sort_by`, `order` (`asc`/`desc`). |
| GET    | `/api/sessions/{session_id}` | Detalle completo de una sesion (metricas por tiro, ejes, consistencia) |
| GET    | `/api/compare`              | Datos agregados de todas las sesiones para graficos comparativos (evolucion de efectividad, boxplot de potencia, distribucion de ejes) |

### Ejemplo

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@data/raw/sesion_ejemplo.csv"
```

## Pipeline de procesamiento

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
5. **Persistencia** (`database.save_session`) — CSV en `data/processed/{session_id}.csv` + fila en `data/index.json`. Un `session_id` repetido devuelve **400** en vez de sobrescribir.

## Manejo de errores

- CSV/log invalido o sin datos parseables → **400** con `{"detail": ..., "errors": [...]}`.
- `session_id` duplicado → **400**.
- Sesion/CSV no encontrado → **404**.
- Excepcion no controlada → **500**, loggeada con `logger.exception` (nunca se cae el proceso).

## Tests

```bash
pytest
```

Cobertura:
- `test_validators.py` — validacion de DataFrame (columnas, nulos, rangos) y de upload crudo.
- `test_processors.py` — parseo BLE completo y calculo de metricas, sobre un log sintetico generado con el mismo formato que exporta nRF Connect.
- `test_api.py` — endpoints end-to-end con `TestClient`, persistencia redirigida a un directorio temporal por test (no toca `data/` real).

## Deploy (Render)

GitHub Pages solo sirve estatico, asi que este backend se despliega aparte
(Render free tier) y el frontend le apunta via `VITE_API_URL`.

1. En [render.com](https://render.com) → **New +** → **Blueprint**, conecta el
   repo `MicroBit_basketball` y selecciona la rama `feature/backend-api` (o
   `main` despues del merge). Render detecta `render.yaml` automaticamente.
2. Si preferis configurarlo a mano en vez del Blueprint: **New +** → **Web
   Service**, root directory apuntando a esta carpeta, build command
   `pip install -r requirements.txt`, start command
   `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Copia la URL publica que asigna Render (`https://<nombre>.onrender.com`) y
   configurala como `VITE_API_URL=https://<nombre>.onrender.com/api` en el
   frontend.

**Limitacion del free tier**: el filesystem es efimero — `data/processed/` y
`data/index.json` se pierden en cada redeploy o cuando el servicio se duerme
por inactividad y vuelve a arrancar. Para una v1 de demo esta bien; antes de
un uso real hay que migrar la persistencia a un servicio externo (ej. un
volumen persistente, SQLite en un disco montado, o una base de datos
gestionada).

## Pendiente / fuera del MVP

- Rate limiting (marcado opcional en el plan original).
- Migrar la persistencia de CSV+JSON a SQLite o una base de datos gestionada (necesario en Render free tier, ver arriba).
- CORS actualmente abierto (`allow_origins=["*"]`) para desarrollo local del frontend — restringir al dominio de GitHub Pages antes de un deploy real.
