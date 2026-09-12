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

| Metodo | Ruta                    | Descripcion                                              |
|--------|-------------------------|-----------------------------------------------------------|
| GET    | `/api/health`           | Healthcheck                                                |
| POST   | `/api/sesion`           | Sube un log BLE crudo (`multipart/form-data`, campo `archivo`); opcional `session_id` como query param. Devuelve `SesionOutput` con metricas por tiro. |
| GET    | `/api/sesiones`         | Lista todas las sesiones procesadas (resumen)              |
| GET    | `/api/sesion/{session_id}` | Detalle completo de una sesion (metricas por tiro)      |

### Ejemplo

```bash
curl -X POST http://localhost:8000/api/sesion \
  -F "archivo=@data/raw/sesion_ejemplo.csv"
```

## Pipeline de procesamiento

1. **Validacion de upload** (`validators.validate_raw_upload`) — archivo no vacio, UTF-8 valido.
2. **Parseo BLE** (`processors.process_raw_log`):
   - `parse_ble_log` extrae fragmentos del export nRF Connect.
   - `rebuild_ble_lines` reconstruye lineas completas a partir de fragmentos.
   - `parse_events` tipa cada linea como `D` (dato de eje), `E` (fin de tiro) o `B` (canasta).
   - `build_dataframe` arma el DataFrame final: `timestamp, session, tiro, x, y, z, potencia, cesta`.
3. **Validacion de datos** (`validators.validate_dataframe`) — columnas requeridas, nulos, rangos. No bloquea la respuesta; los problemas quedan en el log del servidor.
4. **Metricas** (`processors.compute_session_summary` / `compute_tiro_metrics`) — potencia max/avg/min y cesta por tiro; efectividad y potencia promedio por sesion.
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

## Pendiente / fuera del MVP

- Rate limiting (marcado opcional en el plan original).
- Migrar la persistencia de CSV+JSON a SQLite si el volumen de sesiones crece.
- CORS actualmente abierto (`allow_origins=["*"]`) para desarrollo local del frontend — restringir antes de desplegar.
