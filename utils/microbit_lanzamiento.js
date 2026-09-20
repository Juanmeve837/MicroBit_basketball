# microbit_lanzamiento.js
# Corre dentro de la micro:bit (MakeCode, modo JavaScript).
# Protocolo UART (una linea por evento, terminada en \n):
#   "x,y,z"  muestra de aceleracion mientras se captura
#   "E"      fin de tiro (un tiro va de A a A)
#   "B"      canasta del ultimo tiro (boton B)
# Requiere Project Settings -> "No pairing required".
#
# Esta version es la que funciona en la placa. Quirk conocido: la primera
# pulsacion tras conectar debe ser B ("cebado"); si es A sale el error 020.
# Probado y peor: handlers onBluetoothConnected/Disconnected, y enviar la linea
# x,y,z en una sola escritura. El frontend ignora la B de cebado.

bluetooth.startUartService()

let capturando = 0
let enviarEnd = 0
let enviarBasket = 0

basic.showIcon(IconNames.Yes)

input.onButtonPressed(Button.A, function () {
    if (capturando === 0) {
        capturando = 1
    } else {
        capturando = 0
        enviarEnd = 1
    }
})

input.onButtonPressed(Button.B, function () {
    enviarBasket = 1
})

basic.forever(function () {
    if (enviarEnd === 1) {
        bluetooth.uartWriteString("E\n")
        enviarEnd = 0
    } else if (enviarBasket === 1) {
        bluetooth.uartWriteString("B\n")
        enviarBasket = 0
    } else if (capturando === 1) {
        bluetooth.uartWriteString("" + input.acceleration(Dimension.X))
        bluetooth.uartWriteString(",")
        bluetooth.uartWriteString("" + input.acceleration(Dimension.Y))
        bluetooth.uartWriteString(",")
        bluetooth.uartWriteString("" + input.acceleration(Dimension.Z))
        bluetooth.uartWriteString("\n")
    }
    basic.pause(100)
})
