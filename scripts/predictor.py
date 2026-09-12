#!/usr/bin/env python3
"""
predictor.py — Carga el modelo entrenado (models/best_model.pkl) y expone
predict_shot() para clasificar un lanzamiento como cesta (1) o fallo (0)
a partir de sus muestras crudas de aceleracion.

Uso como script:
    python scripts/predictor.py data/db/BD_tiros.csv --tiro 5
    python scripts/predictor.py --json '{"x":[...], "y":[...], "z":[...], "potencia":[...], "timestamp_ms":[...]}'

Uso como libreria:
    from scripts.predictor import ShotPredictor
    predictor = ShotPredictor()
    resultado = predictor.predict_shot(samples_df)  # DataFrame con columnas x,y,z,potencia,timestamp_ms
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib
import numpy as np
import pandas as pd

from scripts.prepare_data import aggregate_shot, parse_timestamp_ms

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "best_model.pkl"


class ShotPredictor:
    def __init__(self, model_path: Path = DEFAULT_MODEL_PATH):
        if not model_path.exists():
            raise FileNotFoundError(
                f"No se encontro el modelo en {model_path}. Ejecuta scripts/train_model.py primero."
            )
        bundle = joblib.load(model_path)
        self.model = bundle["model"]
        self.feature_cols = bundle["feature_cols"]
        self.threshold = bundle["threshold"]

    def _samples_to_features(self, samples: pd.DataFrame) -> pd.DataFrame:
        """Convierte muestras crudas de un tiro (x,y,z,potencia[,timestamp/timestamp_ms])
        en el mismo vector de features usado en entrenamiento."""
        df = samples.copy()
        if "timestamp_ms" not in df.columns:
            if "timestamp" in df.columns:
                df["timestamp_ms"] = parse_timestamp_ms(df["timestamp"])
            else:
                df["timestamp_ms"] = np.arange(len(df)) * 30.0  # ~33Hz por defecto
        df["tiro"] = 0
        df["session"] = "manual"
        df["cesta"] = 0  # placeholder, no se usa para predecir
        fila = aggregate_shot(df)
        vector = pd.DataFrame([fila])[self.feature_cols]
        return vector

    def predict_shot(self, samples: pd.DataFrame) -> dict:
        """samples: DataFrame con columnas x, y, z, potencia (y opcionalmente timestamp/timestamp_ms)."""
        X = self._samples_to_features(samples)
        proba = float(self.model.predict_proba(X)[0, 1])
        return {
            "prob_cesta": proba,
            "prediccion": "cesta" if proba >= self.threshold else "fallo",
            "cesta": int(proba >= self.threshold),
            "threshold": self.threshold,
        }

    def predict_from_features(self, features: dict) -> dict:
        """features: dict ya con las columnas agregadas (mismo esquema que features_por_tiro.csv)."""
        vector = pd.DataFrame([features])[self.feature_cols]
        proba = float(self.model.predict_proba(vector)[0, 1])
        return {
            "prob_cesta": proba,
            "prediccion": "cesta" if proba >= self.threshold else "fallo",
            "cesta": int(proba >= self.threshold),
            "threshold": self.threshold,
        }


def main():
    parser = argparse.ArgumentParser(description="Predice cesta/fallo para un tiro.")
    parser.add_argument("csv", nargs="?", type=Path, help="CSV con formato BD_tiros.csv (timestamp,session,tiro,x,y,z,potencia,cesta)")
    parser.add_argument("--tiro", type=int, help="ID del tiro a predecir dentro del CSV")
    parser.add_argument("--json", type=str, help="JSON con listas x,y,z,potencia[,timestamp_ms] para un tiro suelto")
    args = parser.parse_args()

    predictor = ShotPredictor()

    if args.json:
        data = json.loads(args.json)
        samples = pd.DataFrame(data)
        resultado = predictor.predict_shot(samples)
    elif args.csv and args.tiro is not None:
        df = pd.read_csv(args.csv)
        samples = df[df["tiro"] == args.tiro]
        if samples.empty:
            print(f"[ERROR] No hay muestras para tiro={args.tiro} en {args.csv}")
            sys.exit(1)
        real = samples["cesta"].iloc[0]
        resultado = predictor.predict_shot(samples)
        resultado["real"] = int(real)
    else:
        parser.error("Debes indicar --json o (csv + --tiro)")
        return

    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
