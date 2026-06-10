# Sistema de Análisis de Lanzamientos de Baloncesto con micro:bit

> **Tipo de proyecto:** Wearable IoT + Analítica de Datos + Machine Learning  
> **Duración estimada:** 9 semanas  
> **Nivel:** Intermedio–Avanzado (STEM)

---

## 1. Descripción General

Sistema wearable basado en una BBC micro:bit que detecta, mide y analiza lanzamientos de baloncesto. El dispositivo se fija a la muñeca del jugador y captura datos del acelerómetro durante cada tiro. Los datos se transmiten a un computador donde se visualizan y, en fases avanzadas, se usa machine learning para predecir la probabilidad de enceste.

---

## 2. Materiales Necesarios

### Hardware principal
| Ítem | Cantidad | Notas |
|------|----------|-------|
| BBC micro:bit v2 | 2 | Una para muñeca, otra para el aro (Fase 7) |
| Banda elástica o soporte wearable para muñeca | 1 | Para fijar la micro:bit al brazo |
| Cable micro-USB | 1 | Programación y carga |
| Computador con puerto USB | 1 | Windows, Mac o Linux |
| Batería portátil (AAA ×2 o USB) | 1 | Para uso en cancha sin cable |
| Smartphone Android/iOS (opcional) | 1 | Recepción de datos Bluetooth – Fase 4 |

### Accesorios recomendados
- Cinta de velcro para asegurar la batería
- Funda protectora para la micro:bit (uso deportivo)

---

## 3. Stack Tecnológico

### Capa de firmware (micro:bit)
- **Lenguaje:** MicroPython (recomendado) o Microsoft MakeCode Blocks para Fases 1–2
- **Entorno de programación:** [MicroPython Editor](https://python.microbit.org) o [MakeCode](https://makecode.microbit.org)
- **Sensores usados:** Acelerómetro integrado (3 ejes: X, Y, Z), botones A/B, matriz LED 5×5
- **Comunicación:** Radio (micro:bit a micro:bit), Bluetooth BLE (micro:bit a PC/smartphone)

### Capa de software (PC)
| Herramienta | Uso |
|-------------|-----|
| Python 3.x | Procesamiento y análisis de datos |
| pandas | Manipulación de datasets |
| matplotlib / plotly | Visualización de datos |
| Streamlit | Dashboard web interactivo |
| scikit-learn | Modelos de machine learning |
| XGBoost | Modelo predictivo avanzado |
| pyserial / bleak | Lectura de datos desde micro:bit vía USB o BLE |
| Jupyter Notebook | Exploración y prototipado de modelos |

---

## 4. Requisitos del Sistema

### Requisitos Funcionales
1. Capturar valores del acelerómetro (ejes X, Y, Z) a al menos 50 Hz durante el lanzamiento.
2. Detectar automáticamente el inicio y fin de un lanzamiento basándose en umbrales de aceleración.
3. Calcular métricas por lanzamiento: potencia (magnitud del vector), duración y ángulo de salida.
4. Mostrar retroalimentación visual en la matriz LED después de cada tiro.
5. Registrar histórico de lanzamientos en archivo CSV.
6. Transmitir datos en tiempo real al computador vía USB o Bluetooth.
7. Visualizar métricas en un dashboard interactivo.
8. Predecir probabilidad de enceste con base en los datos históricos.
9. Etiquetar lanzamientos como exitosos/fallidos usando la segunda micro:bit (opcional).

### Requisitos No Funcionales
1. **Portabilidad:** El dispositivo debe operar sin cable durante al menos 2 horas de entrenamiento.
2. **Latencia:** El tiempo entre el tiro y la retroalimentación LED no debe superar 500 ms.
3. **Precisión:** La detección automática debe tener menos del 10% de falsos positivos en condiciones normales de juego.
4. **Facilidad de uso:** No debe requerir intervención del jugador para registrar tiros (modo automático).
5. **Escalabilidad:** El sistema de datos debe soportar al menos 1.000 lanzamientos registrados sin degradación.
6. **Reproducibilidad:** Los experimentos de ML deben ser reproducibles con semilla fija.

---

## 5. Fases del Proyecto

---

### Fase 1 – Prueba de Concepto *(Semana 1)*

**Objetivo:** Confirmar que el acelerómetro de la micro:bit distingue un lanzamiento de otros movimientos cotidianos.

**Pasos:**
1. Fijar la micro:bit a la muñeca del brazo dominante.
2. Programar lectura continua de los tres ejes del acelerómetro.
3. Calcular la magnitud del vector de aceleración: `a = √(x² + y² + z²)`.
4. Mostrar el valor máximo de `a` en la matriz LED después de cada movimiento.
5. Probar con tres movimientos distintos: lanzamiento, caminar y saltar.
6. Registrar los valores observados en una tabla manual.

**Criterio de éxito:** El lanzamiento produce consistentemente valores de `a` más altos que los demás movimientos.

**Entregable:** Programa funcional + tabla comparativa de movimientos.

---

### Fase 2 – Detección Automática de Lanzamientos *(Semana 2)*

**Objetivo:** Que la micro:bit detecte y cuente lanzamientos sin intervención del jugador.

**Pasos:**
1. Definir un umbral de aceleración que marque el inicio del lanzamiento (ej. `a > 2000 mg`).
2. Definir una ventana de tiempo mínima (ej. 300 ms) para filtrar movimientos accidentales.
3. Detectar el fin del lanzamiento cuando `a` baje del umbral por al menos 200 ms.
4. Mostrar el conteo acumulado de tiros en la pantalla LED.
5. Ajustar los umbrales hasta lograr detección confiable en 10 lanzamientos consecutivos.

**Criterio de éxito:** Detección correcta en al menos 8 de 10 tiros reales.

**Entregable:** Programa con detección automática y conteo en pantalla.

---

### Fase 3 – Calificación del Lanzamiento *(Semana 3)*

**Objetivo:** Calcular métricas cuantitativas por cada lanzamiento detectado.

**Métricas a calcular:**
- **Potencia:** valor máximo de `a` durante el tiro.
- **Duración:** tiempo en milisegundos entre inicio y fin.
- **Orientación:** ángulo aproximado de la muñeca al soltar el balón (eje Z).

**Pasos:**
1. Durante la ventana de lanzamiento, registrar todos los valores de `a`.
2. Calcular potencia (máximo), duración (tiempo total) y orientación (valor Z al pico).
3. Crear tres índices en escala 0–9 basados en rangos predefinidos.
4. Mostrar un ícono visual en el LED según la calidad del tiro (débil / normal / fuerte).
5. Probar con al menos 20 lanzamientos y anotar las métricas en papel.

**Criterio de éxito:** Las métricas cambian de forma coherente al modificar intencionalmente la fuerza del tiro.

**Entregable:** Sistema de puntuación funcionando con retroalimentación visual.

---

### Fase 4 – Transmisión de Datos a PC *(Semana 4)*

**Objetivo:** Enviar las métricas de cada lanzamiento a un computador para almacenarlas.

**Opción A (más sencilla) – USB Serial:**
1. Configurar la micro:bit para imprimir métricas por puerto serial en formato CSV.
2. En Python, usar `pyserial` para leer el puerto y guardar en un archivo `.csv`.

**Opción B – Bluetooth BLE:**
1. Activar el servicio Bluetooth de acelerómetro en la micro:bit v2.
2. Usar la librería `bleak` en Python para recibir los datos inalámbricamente.

**Pasos comunes:**
1. Elegir la opción según disponibilidad (USB para inicio, BLE para cancha).
2. Crear el script Python que recibe y guarda datos en `lanzamientos.csv`.
3. Realizar una sesión de 30 tiros y verificar que el archivo se llene correctamente.

**Formato del CSV:**
```
timestamp, potencia, duracion_ms, orientacion_z, indice_potencia, indice_control
```

**Criterio de éxito:** Archivo CSV generado correctamente con 30+ registros sin errores.

**Entregable:** Pipeline de captura de datos funcional.

---

### Fase 5 – Dashboard Analítico *(Semanas 5–6)*

**Objetivo:** Visualizar el histórico de lanzamientos en un dashboard web interactivo.

**Pasos:**
1. Cargar `lanzamientos.csv` con pandas y hacer limpieza básica de datos.
2. Calcular estadísticas de sesión: promedio, máximo, mínimo y desviación estándar por métrica.
3. Crear gráficos con plotly: evolución temporal de potencia, histograma de duraciones.
4. Construir el dashboard en Streamlit con al menos tres vistas:
   - Resumen de la sesión actual.
   - Comparativa de sesiones anteriores.
   - Tabla de lanzamientos individuales con filtros.
5. Agregar indicador de consistencia (varianza baja = mayor consistencia).

**Criterio de éxito:** Dashboard accesible desde navegador, carga en menos de 3 segundos con 500 registros.

**Entregable:** App Streamlit funcional con datos reales del jugador.

---

### Fase 6 – Analítica Predictiva *(Semanas 7–8)*

**Objetivo:** Construir un modelo que prediga si un lanzamiento resultó en enceste.

> **Prerequisito:** Contar con al menos 200 lanzamientos etiquetados (enceste / fallo). El etiquetado puede hacerse manualmente en esta fase; la automatización viene en Fase 7.

**Pasos:**
1. Agregar columna `enceste` (1/0) al CSV de forma manual durante una sesión de práctica.
2. Explorar correlaciones entre las métricas y la columna objetivo.
3. Dividir datos: 80% entrenamiento, 20% prueba.
4. Entrenar tres modelos: Regresión Logística, Random Forest y XGBoost.
5. Evaluar con métricas: accuracy, precisión, recall y AUC-ROC.
6. Elegir el mejor modelo y exportarlo con `joblib`.
7. Integrar la predicción al dashboard de Streamlit.

**Criterio de éxito:** Al menos un modelo supera el 65% de accuracy con datos reales.

**Entregable:** Modelo exportado + predicción en vivo dentro del dashboard.

---

### Fase 7 – Etiquetado Automático de Encestes *(Semana 9)*

**Objetivo:** Usar una segunda micro:bit fija al aro para detectar encestes automáticamente y etiquetar el dataset sin intervención humana.

**Pasos:**
1. Fijar la segunda micro:bit al aro o tablero con cinta de doble cara.
2. Cuando el balón pase por el aro, genera una vibración/impacto que el acelerómetro detecta.
3. Programar la micro:bit del aro para transmitir una señal de "enceste" vía Radio.
4. La micro:bit de la muñeca recibe la señal y asocia el enceste al último lanzamiento registrado.
5. El CSV se genera ya etiquetado automáticamente.
6. Validar el sistema realizando 50 lanzamientos con etiquetado simultáneo manual y automático.
7. Calcular la tasa de coincidencia (objetivo: > 85%).

**Criterio de éxito:** Tasa de coincidencia entre etiquetado automático y manual superior al 85%.

**Entregable:** Pipeline completo de captura y etiquetado automático.

---

## 6. Cronograma

| Semana | Fase | Entregable clave |
|--------|------|-----------------|
| 1 | Fase 1 – Prueba de concepto | Programa + tabla comparativa |
| 2 | Fase 2 – Detección automática | Conteo automático en LED |
| 3 | Fase 3 – Calificación | Métricas + retroalimentación visual |
| 4 | Fase 4 – Transmisión a PC | CSV con datos reales |
| 5–6 | Fase 5 – Dashboard | App Streamlit funcional |
| 7–8 | Fase 6 – ML predictivo | Modelo exportado + predicción en dashboard |
| 9 | Fase 7 – Etiquetado automático | Pipeline completo de datos etiquetados |

---

## 7. Resultado Esperado

Al finalizar el proyecto, se tendrá:

- Un wearable funcional basado en micro:bit que mide y califica lanzamientos en tiempo real.
- Un pipeline automático de captura, transmisión y almacenamiento de datos.
- Un dashboard analítico con histórico de sesiones de entrenamiento.
- Un modelo de machine learning entrenado con datos reales del jugador.
- Un sistema de etiquetado automático de encestes con dos micro:bits comunicadas.
- Una plataforma STEM completa que integra IoT, programación, ciencia de datos y ML.

---

## 8. Notas y Recomendaciones

- **Empezar con MakeCode Blocks** en las Fases 1–2 si es el primer contacto con micro:bit; migrar a MicroPython desde la Fase 3.
- **Mantener un diario de sesiones** anotando condiciones (tipo de balón, distancia al aro) para enriquecer el dataset.
- **La calidad del dataset es más importante que la complejidad del modelo.** 200 lanzamientos bien etiquetados superan a 50 con errores.
- **Backup frecuente del CSV.** Un archivo corrupto en la Fase 6 detiene todo el trabajo de ML.
- La Fase 7 requiere condiciones de cancha controladas; la vibración del tablero puede generar falsos positivos que deben filtrarse con un umbral de duración mínima.
