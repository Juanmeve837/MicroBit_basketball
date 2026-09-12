# Configuración Centralizada

Este directorio contiene la configuración centralizada del proyecto Basket Tracker.

## Archivos

| Archivo | Propósito |
|---------|-----------|
| `config.yaml` | **Editable por el usuario** — paths, parámetros, umbrales |
| `config.py` | **Parser** — clase singleton `Config` para Python |

## Parámetros en config.yaml

### `paths`
Rutas relativas a la raíz del repo. Se crean automáticamente al usar `cfg.get_path()`.

### `analysis`
- `sampling_rate_hz`: Frecuencia de muestreo del micro:bit (33 Hz ≈ 30 ms)
- `timeout_cesta_ms`: Ventana para confirmar canasta con botón B
- `potencia_threshold_min/max`: Umbrales para filtrar outliers
- `consistencia_threshold`: Mínimo recomendado (0.7 = 70%)

### `session`
- `date_format`: Formato de fecha para IDs de sesión
- `session_id_format`: Patrón para generar IDs únicos

### `logging`
- `level`: DEBUG, INFO, WARNING, ERROR
- `file`: Ruta del archivo de log

### `api`
Configuración del servidor FastAPI (host, port, CORS).

## Uso

```python
from config.config import Config

cfg = Config.instance()
data_dir = cfg.get_path('data_raw')
sampling_rate = cfg.get_param('analysis', 'sampling_rate_hz')
```
