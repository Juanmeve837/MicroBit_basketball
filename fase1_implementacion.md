# Fase 1 – Implementación Paso a Paso

## Estructura de archivos

```
basket_microbit/
├── microbit_lanzamiento.py   # Se sube a la micro:bit
└── receptor_pc.py            # Corre en el computador
```

---

## Paso 1 – Preparar el entorno en el PC

Instalar la librería de comunicación serial:

```bash
pip install pyserial
```

---

## Paso 2 – Código de la micro:bit

Ir a [python.microbit.org](https://python.microbit.org), pegar este código y hacer clic en **Send to micro:bit**.

```python
# microbit_lanzamiento.py
# Corre dentro de la micro:bit

from microbit import *

# --- Constantes ---
TIMEOUT_CESTA_MS = 3000   # Tiempo de espera para confirmar cesta con botón B
INTERVALO_MS     = 20     # Intervalo entre lecturas del acelerómetro (~50 Hz)

# --- Estado inicial ---
capturando   = False
muestras     = []          # Lista de tuplas (x, y, z) del lanzamiento actual
num_tiro     = 0

display.show(Image.YES)    # Señal visual: listo para capturar


# --- Bucle principal ---
while True:

    # BOTÓN A: alterna inicio y fin de captura
    if button_a.was_pressed():

        if not capturando:
            # --- INICIO DE CAPTURA ---
            capturando = True
            muestras   = []
            display.show(Image.ARROW_N)   # Flecha arriba = grabando

        else:
            # --- FIN DE CAPTURA ---
            capturando = False
            display.show(Image.CLOCK12)   # Reloj = esperando confirmación de cesta

            # Esperar botón B hasta TIMEOUT_CESTA_MS
            enceste = 0
            t_inicio = running_time()

            while running_time() - t_inicio < TIMEOUT_CESTA_MS:
                if button_b.was_pressed():
                    enceste = 1
                    break
                sleep(50)

            # Enviar cada muestra al PC por serial (print → USB serial)
            num_tiro += 1
            for (x, y, z) in muestras:
                # Formato CSV: tiro, x, y, z, enceste
                print("{},{},{},{},{}".format(num_tiro, x, y, z, enceste))

            # Confirmación visual en LED
            if enceste:
                display.show(Image.HAPPY)
            else:
                display.show(Image.SAD)
            sleep(600)
            display.show(Image.YES)       # Listo para el siguiente tiro

    # Leer acelerómetro solo mientras se está capturando
    if capturando:
        x, y, z = accelerometer.get_x(), accelerometer.get_y(), accelerometer.get_z()
        muestras.append((x, y, z))

    sleep(INTERVALO_MS)
```

### Iconos en pantalla LED

| Momento | Ícono |
|---------|-------|
| Listo para capturar | ✔ (YES) |
| Capturando | ↑ (ARROW_N) |
| Esperando confirmación de cesta | Reloj |
| Tiro registrado como cesta | 😊 (HAPPY) |
| Tiro registrado como fallo | 😞 (SAD) |

---

## Paso 3 – Código del receptor en el PC

```python
# receptor_pc.py
# Corre en el computador mientras la micro:bit está conectada por USB

import serial
import serial.tools.list_ports
import csv
import os
from datetime import datetime

# --- Configuración ---
BAUD_RATE   = 115200
ARCHIVO_CSV = "sesion_{}.csv".format(datetime.now().strftime("%Y%m%d_%H%M%S"))
CABECERA    = ["tiro", "x", "y", "z", "enceste"]


def encontrar_puerto_microbit():
    """Busca automáticamente el puerto de la micro:bit."""
    puertos = serial.tools.list_ports.comports()
    for p in puertos:
        # La micro:bit aparece con 'mbed' o 'MBED' o 'micro:bit' en la descripción
        if "mbed" in p.description.lower() or "microbit" in p.description.lower().replace(":", ""):
            return p.device
    return None


def main():
    # Detectar puerto
    puerto = encontrar_puerto_microbit()

    if puerto is None:
        print("⚠️  micro:bit no encontrada. Verifica la conexión USB.")
        print("Puertos disponibles:")
        for p in serial.tools.list_ports.comports():
            print("  ", p.device, "-", p.description)
        return

    print(f"✅ micro:bit encontrada en {puerto}")
    print(f"📁 Guardando datos en: {ARCHIVO_CSV}")
    print("─" * 50)
    print("Presiona Ctrl+C para detener la captura.\n")

    # Abrir archivo CSV y puerto serial
    with open(ARCHIVO_CSV, "w", newline="") as archivo:
        escritor = csv.writer(archivo)
        escritor.writerow(CABECERA)

        with serial.Serial(puerto, BAUD_RATE, timeout=1) as ser:
            tiro_anterior = None
            filas_tiro    = 0

            while True:
                try:
                    linea = ser.readline().decode("utf-8").strip()
                except UnicodeDecodeError:
                    continue   # Ignorar bytes corruptos al inicio

                if not linea:
                    continue

                # Validar que la línea tiene exactamente 5 campos
                partes = linea.split(",")
                if len(partes) != 5:
                    continue

                try:
                    tiro, x, y, z, enceste = int(partes[0]), int(partes[1]), \
                                             int(partes[2]), int(partes[3]), \
                                             int(partes[4])
                except ValueError:
                    continue   # Saltar líneas malformadas

                escritor.writerow([tiro, x, y, z, enceste])
                archivo.flush()   # Escribir al disco inmediatamente

                # Mostrar resumen cuando cambia el número de tiro
                if tiro != tiro_anterior:
                    if tiro_anterior is not None:
                        resultado = "CESTA 🏀" if enceste else "FALLO  ❌"
                        print(f"Tiro #{tiro_anterior:>3} | {filas_tiro:>4} muestras | {resultado}")
                    tiro_anterior = tiro
                    filas_tiro    = 0

                filas_tiro += 1


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n✅ Captura detenida. Sesión guardada.")
```

---

## Paso 4 – Ejecutar la sesión de prueba

**Terminal 1 – Iniciar el receptor antes de empezar a tirar:**

```bash
cd basket_microbit
python receptor_pc.py
```

Salida esperada mientras se realizan tiros:

```
✅ micro:bit encontrada en COM5
📁 Guardando datos en: sesion_20250608_143200.csv
──────────────────────────────────────────────────
Presiona Ctrl+C para detener la captura.

Tiro #  1 |   47 muestras | CESTA 🏀
Tiro #  2 |   39 muestras | FALLO  ❌
Tiro #  3 |   52 muestras | CESTA 🏀
```

**Flujo por tiro:**
1. Presionar **A** → LED muestra flecha arriba.
2. Lanzar el balón.
3. Presionar **A** → LED muestra reloj.
4. Si fue cesta, presionar **B** antes de 3 segundos.
5. LED confirma y vuelve al ícono ✔.

---

## Paso 5 – Verificar el CSV

Abrir el archivo generado con cualquier editor o con Python:

```bash
# Vista rápida desde terminal
python -c "
import csv
with open('sesion_20250608_143200.csv') as f:
    for fila in csv.reader(f):
        print(fila)
" | head -20
```

Ejemplo de CSV generado correctamente:

```
tiro,x,y,z,enceste
1,-48,112,1024,1
1,-52,118,1031,1
1,-61,124,1044,1
...
2,10,-30,980,0
2,8,-28,975,0
...
```

Cada fila es una muestra del acelerómetro (una cada ~20 ms).  
Todas las muestras del mismo tiro comparten el mismo valor de `enceste`.

---

## Criterio de éxito

- [ ] El CSV se genera sin errores.
- [ ] Al menos 20 tiros registrados (mezcla de cestas y fallos).
- [ ] Cada tiro tiene entre 30 y 80 muestras (corresponde a 0.6–1.6 segundos de movimiento).
- [ ] Los valores de `x`, `y`, `z` cambian visiblemente entre tiros débiles y fuertes.
- [ ] La columna `enceste` coincide con lo que ocurrió en la cancha.

---

## Nota para la Fase 2

En la siguiente iteración, el segundo toque de **A** (fin de captura) se reemplaza por
detección automática de quietud: cuando la magnitud `√(x²+y²+z²)` baje del umbral
durante al menos 200 ms seguidos, se cierra la ventana automáticamente.
El botón **B** para confirmar cesta se mantiene igual.
