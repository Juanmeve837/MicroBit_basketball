"""Persistencia de sesiones procesadas.

MVP simple basado en archivos: cada sesion se guarda como CSV en
data/processed/, y un indice JSON (data/index.json) mantiene el resumen
de cada una para listarlas sin tener que releer todos los CSV.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PROCESSED_DIR = DATA_DIR / "processed"
INDEX_PATH = DATA_DIR / "index.json"


def _ensure_dirs() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def _load_index() -> List[Dict[str, Any]]:
    _ensure_dirs()
    if not INDEX_PATH.exists():
        return []
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def _save_index(index: List[Dict[str, Any]]) -> None:
    _ensure_dirs()
    INDEX_PATH.write_text(
        json.dumps(index, indent=2, default=str, ensure_ascii=False), encoding="utf-8"
    )


def session_exists(session_id: str) -> bool:
    return any(row["session_id"] == session_id for row in _load_index())


def save_session(df: pd.DataFrame, summary: Dict[str, Any]) -> Path:
    """Guarda el CSV de la sesion y actualiza el indice.

    Lanza ValueError si el session_id ya existe, para evitar duplicados.
    """
    session_id = summary["session_id"]
    if session_exists(session_id):
        raise ValueError(f"La sesion '{session_id}' ya existe")

    _ensure_dirs()
    csv_path = PROCESSED_DIR / f"{session_id}.csv"
    df.to_csv(csv_path, index=False)

    index = _load_index()
    index.append({
        "session_id": session_id,
        "fecha": str(summary["fecha"]),
        "total_tiros": summary["total_tiros"],
        "total_canastas": summary["total_canastas"],
        "efectividad": summary["efectividad"],
    })
    _save_index(index)
    return csv_path


def list_sessions() -> List[Dict[str, Any]]:
    return _load_index()


def get_session_summary_row(session_id: str) -> Optional[Dict[str, Any]]:
    for row in _load_index():
        if row["session_id"] == session_id:
            return row
    return None


def get_session_dataframe(session_id: str) -> Optional[pd.DataFrame]:
    csv_path = PROCESSED_DIR / f"{session_id}.csv"
    if not csv_path.exists():
        return None
    return pd.read_csv(csv_path)
