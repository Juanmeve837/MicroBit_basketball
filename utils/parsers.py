import re
import numpy as np
import pandas as pd
from pathlib import Path
from typing import List, Tuple, Optional


def parse_ble_log(log_path: Path) -> List[Tuple[str, str]]:
    """Extrae fragmentos BLE del log exportado de nRF Connect."""
    with open(log_path, "r", encoding="utf-8") as f:
        raw = f.read()
    patron = re.compile(
        r'(\d{2}:\d{2}:\d{2}\.\d{3}),Connected Device,Application,""(.*?)" value received\."',
        re.DOTALL
    )
    return patron.findall(raw)


def rebuild_ble_lines(fragmentos: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """Reconstruye líneas BLE completas a partir de fragmentos."""
    lineas_ble = []
    buf_ts = None
    buf_val = ""
    for ts, frag in fragmentos:
        if buf_ts is None:
            buf_ts = ts
        if "\n" in frag:
            buf_val += frag.replace("\n", "")
            lineas_ble.append((buf_ts, buf_val.strip()))
            buf_ts = None
            buf_val = ""
        else:
            buf_val += frag
    return lineas_ble


def parse_events(lineas_ble: List[Tuple[str, str]]) -> List[dict]:
    """Convierte lineas BLE en eventos tipados (D=data, E=end, B=basket).

    Acepta los dos formatos de firmware: el anterior manda `tiro,x,y,z` y el
    actual solo `x,y,z` (el tiro se deduce contando los fin de tiro `E`).
    """
    eventos = []
    tiro_actual = 1
    # Un log es de un solo firmware: si trae lineas `tiro,x,y,z`, las de 3 campos son fragmentos corruptos.
    campos = 4 if any(linea.count(",") == 3 for _, linea in lineas_ble) else 3
    for ts, linea in lineas_ble:
        if linea in ("E", "END"):
            eventos.append({"ts": ts, "tipo": "E", "tiro": None, "x": None, "y": None, "z": None})
            tiro_actual += 1
        elif linea in ("B", "BASKET"):
            eventos.append({"ts": ts, "tipo": "B", "tiro": None, "x": None, "y": None, "z": None})
        else:
            partes = linea.split(",")
            if len(partes) != campos:
                continue
            try:
                valores = [int(p) for p in partes]
            except ValueError:
                continue
            tiro = valores.pop(0) if campos == 4 else tiro_actual
            x, y, z = valores
            eventos.append({"ts": ts, "tipo": "D", "tiro": tiro, "x": x, "y": y, "z": z})
    return eventos


def build_dataframe(eventos: List[dict], session_id: str) -> pd.DataFrame:
    """Construye DataFrame final con métricas de potencia y etiqueta cesta."""
    tiros_cesta = {}
    ultimo_tiro = None
    for evento in eventos:
        if evento["tipo"] == "D":
            ultimo_tiro = evento["tiro"]
        elif evento["tipo"] == "E":
            if ultimo_tiro is not None and ultimo_tiro not in tiros_cesta:
                tiros_cesta[ultimo_tiro] = 0
        elif evento["tipo"] == "B":
            if ultimo_tiro is not None:
                tiros_cesta[ultimo_tiro] = 1

    filas = []
    for evento in eventos:
        if evento["tipo"] != "D":
            continue
        tiro = evento["tiro"]
        x, y, z = evento["x"], evento["y"], evento["z"]
        filas.append({
            "timestamp": evento["ts"],
            "session": session_id,
            "tiro": tiro,
            "x": x, "y": y, "z": z,
            "potencia": round(np.sqrt(x**2 + y**2 + z**2), 2),
            "cesta": tiros_cesta.get(tiro, 0)
        })
    return pd.DataFrame(filas)
