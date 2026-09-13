"""Persistencia de sesiones procesadas.

Usa SQLite via `libsql` (SDK de Turso, compatible con sqlite3/DBAPI2) como
unico backend. En local/tests escribe a un archivo (DB_PATH); en produccion,
si TURSO_DATABASE_URL esta seteada, el mismo codigo se conecta a una base
remota gratuita en Turso sin cambiar una linea de SQL - resuelve la
limitacion de filesystem efimero de Render free tier sin pagar por un disco.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import libsql
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "db" / "basket.db"

SESSION_COLUMNS = ["session_id", "date", "num_tiros", "total_canastas", "efectividad", "potencia_avg"]
SHOT_COLUMNS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"]


def _connect():
    """Abre una conexion nueva por llamada (barato en SQLite/libSQL, evita
    compartir conexiones entre threads del threadpool de FastAPI).

    Usa Turso (libSQL remoto) si TURSO_DATABASE_URL esta seteada - persistente
    entre redeploys/sleep de Render free tier sin costo. Si no, cae a un
    archivo SQLite local en DB_PATH (dev/tests)."""
    url = os.environ.get("TURSO_DATABASE_URL")
    if url:
        conn = libsql.connect(database=url, auth_token=os.environ.get("TURSO_AUTH_TOKEN"))
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = libsql.connect(database=str(DB_PATH))

    cur = conn.cursor()
    cur.execute(
        """CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            num_tiros INTEGER NOT NULL,
            total_canastas INTEGER NOT NULL,
            efectividad REAL NOT NULL,
            potencia_avg REAL NOT NULL
        )"""
    )
    cur.execute(
        """CREATE TABLE IF NOT EXISTS shots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session TEXT NOT NULL REFERENCES sessions(session_id),
            timestamp TEXT,
            tiro INTEGER NOT NULL,
            x INTEGER, y INTEGER, z INTEGER,
            potencia REAL,
            cesta INTEGER NOT NULL
        )"""
    )
    conn.commit()
    return conn


def _session_exists(conn, session_id: str) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM sessions WHERE session_id = ?", (session_id,))
    return cur.fetchone() is not None


def session_exists(session_id: str) -> bool:
    conn = _connect()
    try:
        return _session_exists(conn, session_id)
    finally:
        conn.close()


def save_session(df: pd.DataFrame, summary: Dict[str, Any]) -> None:
    """Guarda la sesion (fila resumen + tiros) en la base de datos.

    Lanza ValueError si el session_id ya existe, para evitar duplicados.
    """
    session_id = summary["session_id"]
    conn = _connect()
    try:
        if _session_exists(conn, session_id):
            raise ValueError(f"La sesion '{session_id}' ya existe")

        cur = conn.cursor()
        cur.execute(
            "INSERT INTO sessions (session_id, date, num_tiros, total_canastas, efectividad, potencia_avg) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                session_id,
                summary["date"],
                summary["num_tiros"],
                summary["total_canastas"],
                summary["efectividad"],
                summary["potencia_avg"],
            ),
        )

        rows = [
            (
                rec["timestamp"],
                rec["session"],
                int(rec["tiro"]),
                None if pd.isna(rec["x"]) else int(rec["x"]),
                None if pd.isna(rec["y"]) else int(rec["y"]),
                None if pd.isna(rec["z"]) else int(rec["z"]),
                None if pd.isna(rec["potencia"]) else float(rec["potencia"]),
                int(bool(rec["cesta"])),
            )
            for rec in df[SHOT_COLUMNS].to_dict(orient="records")
        ]
        cur.executemany(
            "INSERT INTO shots (timestamp, session, tiro, x, y, z, potencia, cesta) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def delete_session(session_id: str) -> bool:
    """Borra una sesion y sus tiros asociados. Devuelve False si no existia."""
    conn = _connect()
    try:
        if not _session_exists(conn, session_id):
            return False

        cur = conn.cursor()
        cur.execute("DELETE FROM shots WHERE session = ?", (session_id,))
        cur.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def list_sessions(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: Optional[str] = None,
    order: str = "desc",
) -> List[Dict[str, Any]]:
    """Lista sesiones, opcionalmente filtradas por fecha (ISO 'YYYY-MM-DD') y ordenadas."""
    conn = _connect()
    try:
        query = f"SELECT {', '.join(SESSION_COLUMNS)} FROM sessions WHERE 1=1"
        params: List[Any] = []
        if date_from:
            query += " AND date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND date <= ?"
            params.append(date_to)
        if sort_by and sort_by in SESSION_COLUMNS:
            direction = "ASC" if order == "asc" else "DESC"
            query += f" ORDER BY {sort_by} {direction}"

        cur = conn.cursor()
        cur.execute(query, params)
        return [dict(zip(SESSION_COLUMNS, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def get_session_summary_row(session_id: str) -> Optional[Dict[str, Any]]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {', '.join(SESSION_COLUMNS)} FROM sessions WHERE session_id = ?",
            (session_id,),
        )
        row = cur.fetchone()
        return dict(zip(SESSION_COLUMNS, row)) if row else None
    finally:
        conn.close()


def get_session_dataframe(session_id: str) -> Optional[pd.DataFrame]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {', '.join(SHOT_COLUMNS)} FROM shots WHERE session = ? ORDER BY id",
            (session_id,),
        )
        rows = cur.fetchall()
        if not rows:
            return None
        return pd.DataFrame(rows, columns=SHOT_COLUMNS)
    finally:
        conn.close()
