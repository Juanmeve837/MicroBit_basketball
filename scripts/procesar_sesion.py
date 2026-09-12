#!/usr/bin/env python3
"""
procesar_sesion.py — Post-procesa un log crudo BLE (nRF Connect) de una
sesión de tiros y genera un CSV limpio y ordenado en data/processed/.

Uso:
    python scripts/procesar_sesion.py <archivo_log>
    python scripts/procesar_sesion.py <archivo_log> --output RUTA.csv
    python scripts/procesar_sesion.py <archivo_log> --session-id 20260901_ABCD1234
"""

import argparse
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.config import Config
from scripts.utils.parsers import (
    parse_ble_log,
    rebuild_ble_lines,
    parse_events,
    build_dataframe,
)
from scripts.utils.validators import validate_dataframe


def resolve_input_path(archivo_log: str, data_raw: Path) -> Path:
    """Resuelve la ruta del log: tal cual, o buscándolo dentro de data/raw/."""
    ruta = Path(archivo_log)
    if ruta.exists():
        return ruta
    candidata = data_raw / archivo_log
    if candidata.exists():
        return candidata
    print(f"[ERROR] No se encontró el archivo: {archivo_log}")
    print(f"        (buscado tal cual y dentro de {data_raw})")
    sys.exit(1)


def next_output_path(data_processed: Path) -> Path:
    """Autogenera el siguiente sesion_procesada_N.csv libre."""
    existentes = list(data_processed.glob("sesion_procesada_*.csv"))
    numeros = []
    for archivo in existentes:
        sufijo = archivo.stem.replace("sesion_procesada_", "")
        if sufijo.isdigit():
            numeros.append(int(sufijo))
    siguiente = max(numeros, default=0) + 1
    return data_processed / f"sesion_procesada_{siguiente}.csv"


def generate_session_id(config: Config) -> str:
    date_format = config.get_param("session", "date_format") or "%Y%m%d"
    fecha = datetime.now().strftime(date_format)
    return f"{fecha}_{str(uuid.uuid4())[:8].upper()}"


def print_resumen(df, session_id: str):
    resumen = (
        df.groupby("tiro")
        .agg(
            muestras=("x", "count"),
            potencia_max=("potencia", "max"),
            potencia_avg=("potencia", "mean"),
            cesta=("cesta", "first"),
        )
        .round(2)
        .reset_index()
    )

    print(f"\n[*] Sesion: {session_id}")
    print(f"    DataFrame: {df.shape[0]} filas x {df.shape[1]} columnas")
    print("\nResumen por tiro:")
    print(resumen.to_string(index=False))
    print(f"\nTotal tiros:    {resumen.shape[0]}")
    print(f"Total canastas: {int(resumen['cesta'].sum())}")
    print(f"% acierto:      {resumen['cesta'].mean() * 100:.1f}%")


def main():
    parser = argparse.ArgumentParser(
        description="Post-procesa un log BLE (nRF Connect) en un CSV de sesion limpio."
    )
    parser.add_argument(
        "archivo_log",
        help="Ruta al log crudo, o nombre de archivo dentro de data/raw/.",
    )
    parser.add_argument(
        "--output",
        help="Ruta de salida. Si se omite, se autogenera sesion_procesada_N.csv en data/processed/.",
    )
    parser.add_argument(
        "--session-id",
        help="ID de sesion a forzar. Si se omite, se autogenera con fecha + UUID.",
    )
    args = parser.parse_args()

    config = Config.instance()
    data_raw = config.get_path("data_raw")
    data_processed = config.get_path("data_processed")

    ruta_log = resolve_input_path(args.archivo_log, data_raw)
    ruta_salida = Path(args.output) if args.output else next_output_path(data_processed)
    session_id = args.session_id or generate_session_id(config)

    print(f"[*] Leyendo log: {ruta_log}")
    fragmentos = parse_ble_log(ruta_log)
    print(f"    Fragmentos BLE encontrados: {len(fragmentos)}")
    if not fragmentos:
        print("[ERROR] No se encontraron fragmentos BLE en el log. Verifica el formato del archivo.")
        sys.exit(1)

    lineas_ble = rebuild_ble_lines(fragmentos)
    print(f"    Lineas BLE reconstruidas: {len(lineas_ble)}")

    eventos = parse_events(lineas_ble)
    total_muestras = sum(1 for e in eventos if e["tipo"] == "D")
    total_tiros = sum(1 for e in eventos if e["tipo"] == "E")
    total_canastas = sum(1 for e in eventos if e["tipo"] == "B")
    print(f"    Eventos: {total_muestras} muestras (D), {total_tiros} fin de tiro (E), {total_canastas} canastas (B)")

    df = build_dataframe(eventos, session_id)
    if df.empty:
        print("[ERROR] No se pudo construir ninguna fila de datos a partir del log.")
        sys.exit(1)

    ok, errores = validate_dataframe(df)
    if not ok:
        print("\n[WARN] El DataFrame generado tiene inconsistencias:")
        for error in errores:
            print(f"       {error}")

    print_resumen(df, session_id)

    ruta_salida.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(ruta_salida, index=False)
    print(f"\n[OK] CSV guardado en: {ruta_salida}")


if __name__ == "__main__":
    main()
