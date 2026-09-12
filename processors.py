"""Parseo del log BLE crudo y calculo de metricas de sesion/tiro.

Puerto de la logica de scripts/utils/parsers.py a un pipeline in-memory
(recibe texto, no rutas de archivo) para poder usarla desde la API.
"""

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

BLE_FRAGMENT_PATTERN = re.compile(
    r'(\d{2}:\d{2}:\d{2}\.\d{3}),Connected Device,Application,""(.*?)" value received\."',
    re.DOTALL,
)


def parse_ble_log(raw_text: str) -> List[Tuple[str, str]]:
    """Extrae fragmentos BLE del log exportado de nRF Connect."""
    return BLE_FRAGMENT_PATTERN.findall(raw_text)


def rebuild_ble_lines(fragmentos: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    """Reconstruye lineas BLE completas a partir de fragmentos."""
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
    """Convierte lineas BLE en eventos tipados (D=data, E=end, B=basket)."""
    eventos = []
    for ts, linea in lineas_ble:
        if linea == "E":
            eventos.append({"ts": ts, "tipo": "E", "tiro": None, "x": None, "y": None, "z": None})
        elif linea == "B":
            eventos.append({"ts": ts, "tipo": "B", "tiro": None, "x": None, "y": None, "z": None})
        else:
            partes = linea.split(",")
            if len(partes) == 4:
                try:
                    eventos.append({
                        "ts": ts, "tipo": "D",
                        "tiro": int(partes[0]), "x": int(partes[1]),
                        "y": int(partes[2]), "z": int(partes[3]),
                    })
                except ValueError:
                    continue
    return eventos


def build_dataframe(eventos: List[dict], session_id: str) -> pd.DataFrame:
    """Construye DataFrame final con metricas de potencia y etiqueta cesta."""
    tiros_cesta: Dict[int, int] = {}
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
            "potencia": round(float(np.sqrt(x**2 + y**2 + z**2)), 2),
            "cesta": tiros_cesta.get(tiro, 0),
        })
    return pd.DataFrame(filas)


def generate_session_id() -> str:
    fecha = datetime.now().strftime("%Y%m%d")
    return f"{fecha}_{str(uuid.uuid4())[:8].upper()}"


def process_raw_log(raw_text: str, session_id: str = None) -> Tuple[pd.DataFrame, str]:
    """Pipeline completo: texto de log crudo BLE -> DataFrame de sesion.

    Lanza ValueError con un mensaje claro si el log no trae datos utilizables,
    para que la capa de API lo traduzca directamente a un 400.
    """
    session_id = session_id or generate_session_id()

    fragmentos = parse_ble_log(raw_text)
    if not fragmentos:
        raise ValueError("No se encontraron fragmentos BLE en el log")

    lineas_ble = rebuild_ble_lines(fragmentos)
    eventos = parse_events(lineas_ble)

    df = build_dataframe(eventos, session_id)
    if df.empty:
        raise ValueError("No se pudo construir ninguna fila de datos a partir del log")

    return df, session_id


def compute_tiro_metrics(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Agrega el DataFrame por tiro: muestras, potencia max/avg/min, cesta."""
    resumen = (
        df.groupby("tiro")
        .agg(
            muestras=("x", "count"),
            potencia_max=("potencia", "max"),
            potencia_avg=("potencia", "mean"),
            potencia_min=("potencia", "min"),
            cesta=("cesta", "first"),
        )
        .round(2)
        .reset_index()
    )
    resumen["cesta"] = resumen["cesta"].astype(bool)
    return resumen.to_dict(orient="records")


def compute_session_summary(df: pd.DataFrame, session_id: str) -> Dict[str, Any]:
    """Calcula los KPIs de sesion (efectividad, potencia promedio) + metricas por tiro."""
    tiros = compute_tiro_metrics(df)
    total_tiros = len(tiros)
    total_canastas = sum(1 for t in tiros if t["cesta"])
    efectividad = round(total_canastas / total_tiros * 100, 1) if total_tiros else 0.0
    potencia_promedio = round(float(df["potencia"].mean()), 2) if not df.empty else 0.0

    return {
        "session_id": session_id,
        "fecha": datetime.now(),
        "total_tiros": total_tiros,
        "total_canastas": total_canastas,
        "efectividad": efectividad,
        "potencia_promedio": potencia_promedio,
        "tiros": tiros,
    }
