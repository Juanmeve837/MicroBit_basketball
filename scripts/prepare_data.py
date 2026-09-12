#!/usr/bin/env python3
"""
prepare_data.py — Convierte data/db/BD_tiros.csv (una fila por muestra) en un
dataset agregado por tiro (una fila por lanzamiento), con features de
aceleracion y potencia listas para entrenar un modelo de clasificacion
cesta/fallo.

Uso:
    python scripts/prepare_data.py
    python scripts/prepare_data.py --input data/db/BD_tiros.csv --output data/processed/features_por_tiro.csv
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from scipy.stats import kurtosis, skew

from config.config import Config

EJES = ["x", "y", "z", "potencia"]


def parse_timestamp_ms(ts: pd.Series) -> pd.Series:
    """Convierte 'HH:MM:SS.mmm' a milisegundos desde medianoche."""
    partes = ts.str.split(":", expand=True)
    h = partes[0].astype(int)
    m = partes[1].astype(int)
    s_ms = partes[2].astype(float)
    return ((h * 3600 + m * 60) * 1000) + (s_ms * 1000)


def safe_skew(values: np.ndarray) -> float:
    return float(skew(values)) if len(values) >= 3 and np.std(values) > 0 else 0.0


def safe_kurtosis(values: np.ndarray) -> float:
    return float(kurtosis(values)) if len(values) >= 4 and np.std(values) > 0 else 0.0


def aggregate_shot(grupo: pd.DataFrame) -> dict:
    n = len(grupo)
    fila = {
        "tiro": grupo["tiro"].iloc[0],
        "session": grupo["session"].iloc[0],
        "n_muestras": n,
        "duracion_ms": float(grupo["timestamp_ms"].max() - grupo["timestamp_ms"].min()),
        "cesta": int(grupo["cesta"].iloc[0]),
    }
    mitad = max(n // 2, 1)
    potencia = grupo["potencia"].to_numpy(dtype=float)
    for eje in EJES:
        valores = grupo[eje].to_numpy(dtype=float)
        fila[f"{eje}_max"] = float(valores.max())
        fila[f"{eje}_min"] = float(valores.min())
        fila[f"{eje}_mean"] = float(valores.mean())
        fila[f"{eje}_std"] = float(valores.std())
        fila[f"{eje}_range"] = float(valores.max() - valores.min())
        fila[f"{eje}_skew"] = safe_skew(valores)
        fila[f"{eje}_kurtosis"] = safe_kurtosis(valores)

        # Forma del movimiento: momento del pico, asimetria temprano/tarde, suavidad (jerk)
        fila[f"{eje}_idx_max_frac"] = float(np.argmax(valores) / max(n - 1, 1))
        fila[f"{eje}_first_half_mean"] = float(valores[:mitad].mean())
        fila[f"{eje}_second_half_mean"] = float(valores[mitad:].mean()) if n > mitad else fila[f"{eje}_first_half_mean"]
        fila[f"{eje}_asimetria_temporal"] = fila[f"{eje}_second_half_mean"] - fila[f"{eje}_first_half_mean"]
        if n > 1:
            jerk = np.diff(valores)
            fila[f"{eje}_jerk_mean"] = float(np.abs(jerk).mean())
            fila[f"{eje}_jerk_std"] = float(jerk.std())
        else:
            fila[f"{eje}_jerk_mean"] = 0.0
            fila[f"{eje}_jerk_std"] = 0.0

    # Proxies de angulo de lanzamiento: proporcion de cada eje respecto a la potencia total
    potencia_segura = np.where(potencia == 0, 1e-6, potencia)
    for eje in ("x", "y", "z"):
        valores = grupo[eje].to_numpy(dtype=float)
        fila[f"{eje}_sobre_potencia_mean"] = float((valores / potencia_segura).mean())

    return fila


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["timestamp_ms"] = parse_timestamp_ms(df["timestamp"])
    filas = [aggregate_shot(grupo) for _, grupo in df.groupby("tiro", sort=True)]
    features = pd.DataFrame(filas).sort_values("tiro").reset_index(drop=True)
    return features


def report(features: pd.DataFrame) -> None:
    print("=" * 55)
    print("  DATASET AGREGADO POR TIRO")
    print("=" * 55)
    print(f"  Tiros totales:        {len(features)}")
    print(f"  Features generadas:   {features.shape[1] - 3}")  # menos tiro/session/cesta
    balance = features["cesta"].value_counts(normalize=True).sort_index()
    print(f"  Fallos (0):           {balance.get(0, 0):.1%}")
    print(f"  Cestas (1):           {balance.get(1, 0):.1%}")
    faltantes = features.isnull().sum().sum()
    print(f"  Valores faltantes:    {faltantes}")
    print("=" * 55)


def main():
    parser = argparse.ArgumentParser(description="Agrega BD_tiros.csv por tiro y genera features para ML.")
    parser.add_argument("--input", type=Path, default=None, help="CSV de entrada (por defecto: data/db/BD_tiros.csv)")
    parser.add_argument("--output", type=Path, default=None, help="CSV de salida (por defecto: data/processed/features_por_tiro.csv)")
    args = parser.parse_args()

    config = Config.instance()
    input_path = args.input or (config.get_path("data_db") / "BD_tiros.csv")
    output_path = args.output or (config.get_path("data_processed") / "features_por_tiro.csv")

    if not input_path.exists():
        print(f"[ERROR] No se encontro el archivo de entrada: {input_path}")
        sys.exit(1)

    print(f"[*] Cargando {input_path} ...")
    df = pd.read_csv(input_path)
    print(f"    {len(df)} muestras, {df['tiro'].nunique()} tiros")

    print("[*] Agregando por tiro y calculando features ...")
    features = build_features(df)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(output_path, index=False)
    print(f"[OK] Guardado en: {output_path}")

    report(features)


if __name__ == "__main__":
    main()
