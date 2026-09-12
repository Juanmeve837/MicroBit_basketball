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
5. **Machine Learning** — `scripts/prepare_data.py` agrega `BD_tiros.csv` por
   tiro, `scripts/train_model.py` entrena/compara/ajusta modelos de
   clasificación cesta-fallo y guarda el mejor en `models/best_model.pkl`,
   y `scripts/predictor.py` lo usa para predecir un tiro nuevo. Ver
   [Predicción de cesta/fallo (ML)](#predicción-de-cestafallo-ml) más abajo.

## Estructura del repositorio

```
config/           Configuración centralizada (config.yaml + parser Config)
data/
  raw/            Sesiones crudas (BLE/USB), no versionadas
  processed/       Sesiones procesadas (CSV) + features_por_tiro.csv (dataset ML)
  db/             BD_tiros.csv — todas las sesiones unidas por tiro
  backup/         Backups automáticos
notebooks/
  02_analisis_sesion.ipynb        Análisis exploratorio general + archived/
  01_eda.ipynb                    EDA orientado a ML (calidad de datos, balance, distribuciones)
  02_feature_engineering.ipynb    Construcción del dataset agregado por tiro
  03_model_training.ipynb         Comparación de modelos + tuning
  04_evaluation.ipynb             Métricas finales, gráficos, limitaciones
scripts/
  procesar_sesion.py     Post-procesa un log BLE crudo en CSV limpio
  construir_bd_tiros.py  Une las sesiones procesadas en data/db/BD_tiros.csv
  prepare_data.py        Agrega BD_tiros.csv por tiro → features_por_tiro.csv
  train_model.py         Entrena, compara y ajusta modelos → models/best_model.pkl
  predictor.py           Carga el modelo y predice cesta/fallo para un tiro
  utils/          Funciones reutilizables (parsers, validators, paths)
                  y firmware de referencia (microbit_lanzamiento.js)
  archived/       Planes y documentos superados
models/
  best_model.pkl  Modelo entrenado (pipeline sklearn + threshold), no versionado
results/
  figures/        Gráficos (confusion_matrix.png, roc_curve.png, feature_importance.png, …)
  tables/         Tablas resumen (CSV)
  reports/        Reportes
  metrics.json    Métricas del modelo ML (CV, test, hiperparámetros)
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

## Predicción de cesta/fallo (ML)

Pipeline completo para predecir si un lanzamiento fue canasta a partir de las
muestras de aceleración capturadas durante el tiro.

### Entrenar / regenerar el modelo

```bash
python scripts/prepare_data.py      # BD_tiros.csv -> data/processed/features_por_tiro.csv
python scripts/train_model.py       # entrena, compara, ajusta y guarda models/best_model.pkl
```

`train_model.py` acepta `--imbalance class_weight` (por defecto) o
`--imbalance smote` para el manejo de la clase desbalanceada. Guarda:

- `models/best_model.pkl` — pipeline sklearn (scaler + modelo) + umbral óptimo.
- `results/metrics.json` — comparación de baselines (CV), hiperparámetros,
  métricas de test con umbral por defecto y óptimo.
- `results/figures/{confusion_matrix,roc_curve,feature_importance}.png`.

### Usar el modelo entrenado

```bash
python scripts/predictor.py data/db/BD_tiros.csv --tiro 5
python scripts/predictor.py --json '{"x":[-84,-68,-40],"y":[744,752,732],"z":[-688,-684,-708],"potencia":[1016.83,1018.81,1019.16]}'
```

```python
from scripts.predictor import ShotPredictor

predictor = ShotPredictor()
resultado = predictor.predict_shot(samples_df)  # DataFrame con columnas x,y,z,potencia
# {'prob_cesta': 0.27, 'prediccion': 'fallo', 'cesta': 0, 'threshold': 0.41}
```

### Notebooks (exploración paso a paso)

```bash
jupyter notebook notebooks/01_eda.ipynb
```

`01_eda.ipynb` → `02_feature_engineering.ipynb` → `03_model_training.ipynb` →
`04_evaluation.ipynb`, en ese orden.

### Resultado actual (honesto, sin ajustar artificialmente)

Con 411 tiros (139 cestas) y las features agregadas por tiro (estadísticos de
`x`/`y`/`z`/`potencia`: max/min/mean/std/range/skew/kurtosis, forma temporal del
gesto y proxies de ángulo — 57 features en total):

| Métrica    | Objetivo | Resultado (test) |
|------------|----------|-------------------|
| Accuracy   | > 70-75% | ~0.55             |
| Precision  | > 65%    | ~0.37-0.44        |
| Recall     | > 60%    | ~0.57-0.79        |
| F1         | > 0.62   | ~0.46-0.50        |
| ROC-AUC    | —        | ~0.60             |

**No se alcanzan los objetivos planteados.** El ROC-AUC (~0.60) indica que hay
señal real (mejor que azar) pero débil, no que el pipeline esté mal construido.
Motivo principal: cada tiro solo tiene 5-10 muestras de acelerómetro a 33 Hz,
lo que deja poco detalle temporal para diferenciar el patrón de un tiro
encestado de uno fallado. Se probaron 57 features (incluyendo timing del pico,
asimetría temporal, jerk y proxies de ángulo), SMOTE vs. `class_weight`, y
GridSearchCV sobre Logistic Regression / Decision Tree / Random Forest — el
techo de F1 en validación cruzada se mantiene en ~0.40-0.45. Ver la sección
"Interpretación y limitaciones" de `notebooks/04_evaluation.ipynb` para el
detalle y las recomendaciones (mayor tasa de muestreo o serie temporal completa
en vez de agregados, sumar giroscopio, más datos).

## Pendiente / próximos pasos

- [ ] Escribir tests en `tests/`
- [ ] API FastAPI para consumo en tiempo real (`config.yaml` ya tiene la sección `api`)
- [x] Modelo de ML para predicción de acierto — implementado
      (`scripts/prepare_data.py`, `scripts/train_model.py`, `scripts/predictor.py`);
      no alcanza aún el objetivo de accuracy/F1 planteado (ver sección de arriba)
- [ ] Mejorar la señal del modelo ML: mayor frecuencia de muestreo o serie
      temporal completa por tiro (CNN 1D / LSTM en vez de agregados), sumar
      giroscopio, y recolectar más datos
