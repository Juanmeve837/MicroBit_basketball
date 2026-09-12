import re
from datetime import datetime, timedelta
from typing import List

import pytest


def build_raw_log(lines: List[str], start: str = "18:06:51.000") -> str:
    """Genera un log BLE crudo (formato nRF Connect) a partir de lineas logicas.

    Cada linea logica ("1,3,4,0", "E", "B", ...) se fragmenta igual que lo hace
    la exportacion real: un fragmento BLE por token separado por comas, mas un
    fragmento final de salto de linea. Reproduce el mismo formato que
    procesa `parse_ble_log` + `rebuild_ble_lines`.
    """
    ts = datetime.strptime(start, "%H:%M:%S.%f")
    raw = ""

    def next_ts() -> str:
        nonlocal ts
        ts += timedelta(milliseconds=60)
        return ts.strftime("%H:%M:%S.%f")[:-3]

    for linea in lines:
        tokens = re.split(r"(,)", linea)
        for tok in tokens:
            raw += f'{next_ts()},Connected Device,Application,""{tok}" value received."\n'
        raw += f'{next_ts()},Connected Device,Application,""\n" value received."\n'

    return raw


@pytest.fixture
def sample_raw_log() -> str:
    """Sesion con 2 tiros: tiro 1 sin canasta, tiro 2 con canasta. Potencia=5.0 en todas las muestras."""
    return build_raw_log([
        "1,3,4,0",
        "1,3,4,0",
        "E",
        "2,3,4,0",
        "2,3,4,0",
        "B",
    ])
