# 🏀 Basket Tracker — micro:bit

Sistema de análisis de lanzamientos de baloncesto usando un micro:bit como
sensor de movimiento (acelerómetro). El micro:bit se lleva en la muñeca o en
el balón, captura los ejes X/Y/Z durante cada tiro y marca si fue canasta
(botón B), y los datos se envían por Bluetooth (UART) o USB al PC para su
post-procesamiento y análisis.

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
tests/            Tests (pendiente de implementar)
logs/             Logs de ejecución (no versionado)
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
(API backend, en desarrollo), `jupyter`.

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

## Pendiente / próximos pasos

- [ ] Escribir tests en `tests/`
- [ ] API FastAPI para consumo en tiempo real (`config.yaml` ya tiene la sección `api`)
- [ ] Modelo de ML para predicción de acierto (dependencias `scikit-learn`/`joblib` ya incluidas)
