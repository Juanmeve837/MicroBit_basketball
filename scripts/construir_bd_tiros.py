#!/usr/bin/env python3
"""
construir_bd_tiros.py — Une las sesiones procesadas en una base de datos
unica de tiros (data/db/BD_tiros.csv), con el mismo esquema de columnas que
un sesion_procesada_N.csv (timestamp, session, tiro, x, y, z, potencia, cesta)
para que notebooks/02_analisis_sesion.ipynb pueda leerla directamente.

El problema que resuelve: cada sesion procesada numera sus tiros desde 1,
asi que "tiro" se repite entre sesiones. Aqui se reasigna un ID de tiro
global (unico en toda la BD) mantenendo el orden original de cada sesion.

Comportamiento (siempre incremental):
    - Lee todas las sesiones en data/processed/.
    - Si BD_tiros.csv ya existe, detecta que sesiones (por session_id) ya
      estan incluidas y solo agrega las que faltan.
    - Las sesiones nuevas se agregan en el orden de su numero de archivo
      (sesion_procesada_N.csv -> N), que es el orden en que fueron
      procesadas. Los tiros ya guardados en la BD nunca se renumeran.

Uso:
    python scripts/construir_bd_tiros.py              # agrega solo lo que falta
    python scripts/construir_bd_tiros.py --rebuild     # reconstruye desde cero (con backup)
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from config.config import Config
from utils.validators import validate_dataframe

COLUMNAS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"]
PATRON_ARCHIVO = re.compile(r"sesion_procesada_(\d+)\.csv$")


def numero_de_archivo(path: Path) -> int:
    m = PATRON_ARCHIVO.search(path.name)
    return int(m.group(1)) if m else 0


def discover_sessions(processed_dir: Path):
    archivos = sorted(processed_dir.glob("sesion_procesada_*.csv"), key=numero_de_archivo)
    if not archivos:
        print(f"[WARN] No se encontraron archivos 'sesion_procesada_*.csv' en {processed_dir}")
    return archivos


def load_bd(bd_path: Path) -> pd.DataFrame:
    if bd_path.exists():
        return pd.read_csv(bd_path)
    return pd.DataFrame(columns=COLUMNAS)


def backup_bd(bd_path: Path) -> Optional[Path]:
    if not bd_path.exists():
        return None
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = bd_path.parent / f"BACKUP_BD_tiros_{timestamp}.csv"
    backup_path.write_bytes(bd_path.read_bytes())
    return backup_path


def asignar_tiros_globales(df: pd.DataFrame, siguiente_tiro: int) -> pd.DataFrame:
    """Reasigna 'tiro' a IDs globales unicos, preservando el orden de aparicion."""
    tiros_locales_en_orden = df["tiro"].drop_duplicates().tolist()
    mapa = {}
    for tiro_local in tiros_locales_en_orden:
        mapa[tiro_local] = siguiente_tiro
        siguiente_tiro += 1
    df = df.copy()
    df["tiro"] = df["tiro"].map(mapa)
    return df, siguiente_tiro


def main():
    parser = argparse.ArgumentParser(
        description="Une las sesiones procesadas en data/db/BD_tiros.csv con IDs de tiro globales."
    )
    parser.add_argument(
        "--rebuild", action="store_true",
        help="Ignora la BD existente y la reconstruye desde cero (crea backup antes).",
    )
    args = parser.parse_args()

    config = Config.instance()
    processed_dir = config.get_path("data_processed")
    db_dir = config.get_path("data_db")
    bd_path = db_dir / "BD_tiros.csv"

    print("[*] Descubriendo sesiones procesadas...")
    archivos = discover_sessions(processed_dir)
    if not archivos:
        sys.exit(1)
    print(f"    Encontrados: {len(archivos)} archivos")

    if args.rebuild:
        backup = backup_bd(bd_path)
        if backup:
            print(f"[BACKUP] BD anterior guardada en: {backup.name}")
        bd = pd.DataFrame(columns=COLUMNAS)
    else:
        bd = load_bd(bd_path)

    sesiones_existentes = set(bd["session"].unique()) if not bd.empty else set()

    print("\n[*] Detectando sesiones nuevas...")
    faltantes = []
    for archivo in archivos:
        df = pd.read_csv(archivo)
        ok, errores = validate_dataframe(df)
        if not ok:
            print(f"  [WARN] {archivo.name} tiene inconsistencias, se omite:")
            for error in errores:
                print(f"         {error}")
            continue
        session_id = df["session"].iloc[0]
        if session_id not in sesiones_existentes:
            faltantes.append((archivo, df))

    if not faltantes:
        print("  [i] La BD ya esta al dia. No hay sesiones nuevas que agregar.")
        sys.exit(0)

    print(f"  Sesiones nuevas a agregar: {len(faltantes)}")
    for archivo, _ in faltantes:
        print(f"    - {archivo.name}")

    siguiente_tiro = int(bd["tiro"].max()) + 1 if not bd.empty else 1

    print("\n[*] Asignando IDs de tiro globales...")
    bloques_nuevos = []
    for archivo, df in faltantes:
        df_global, siguiente_tiro = asignar_tiros_globales(df, siguiente_tiro)
        bloques_nuevos.append(df_global)

    bd_final = pd.concat([bd] + bloques_nuevos, ignore_index=True)

    ok, errores = validate_dataframe(bd_final)
    if not ok:
        print("\n[WARN] La BD final tiene inconsistencias:")
        for error in errores:
            print(f"       {error}")

    bd_path.parent.mkdir(parents=True, exist_ok=True)
    bd_final.to_csv(bd_path, index=False)

    print("\n" + "=" * 55)
    print("  [RESUMEN] BD DE TIROS")
    print("=" * 55)
    print(f"  Sesiones agregadas esta corrida:  {len(faltantes)}")
    print(f"  Sesiones totales en la BD:        {bd_final['session'].nunique()}")
    print(f"  Tiros totales en la BD:           {bd_final['tiro'].nunique()}")
    print(f"  Muestras totales en la BD:        {len(bd_final)}")
    canastas = bd_final[bd_final["cesta"] == 1]["tiro"].nunique()
    total_tiros = bd_final["tiro"].nunique()
    efectividad = round(canastas / total_tiros * 100, 1) if total_tiros else 0.0
    print(f"  Efectividad global:               {efectividad}%")
    print("=" * 55)
    print(f"\n[OK] BD guardada en: {bd_path}")


if __name__ == "__main__":
    main()
