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