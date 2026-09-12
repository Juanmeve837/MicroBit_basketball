# microbit_lanzamiento.js
# Corre dentro de la micro:bit

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
        bluetooth.uartWriteString("END\n")
        enviarEnd = 0
    } else if (enviarBasket === 1) {
        bluetooth.uartWriteString("BASKET\n")
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