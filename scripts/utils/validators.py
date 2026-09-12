import pandas as pd
from pathlib import Path
from typing import List, Tuple


def validate_dataframe(df: pd.DataFrame) -> Tuple[bool, List[str]]:
    """Valida que un DataFrame de sesión (ya en memoria) tenga el formato esperado."""
    errors = []

    columnas_requeridas = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"]
    for col in columnas_requeridas:
        if col not in df.columns:
            errors.append(f"Falta columna requerida: '{col}'")

    if df.empty:
        errors.append("El DataFrame está vacío")

    if "tiro" in df.columns and df["tiro"].isnull().any():
        errors.append("Hay valores nulos en columna 'tiro'")

    if "potencia" in df.columns:
        invalid = df[df["potencia"] < 0]
        if not invalid.empty:
            errors.append(f"Hay {len(invalid)} filas con potencia negativa")

    if "cesta" in df.columns:
        invalid = df[~df["cesta"].isin([0, 1])]
        if not invalid.empty:
            errors.append(f"Hay {len(invalid)} filas con cesta ∉ {0,1}")

    return len(errors) == 0, errors


def validate_csv(path: Path) -> Tuple[bool, List[str]]:
    """Valida que un CSV de sesión tenga el formato esperado."""
    try:
        df = pd.read_csv(path)
    except Exception as e:
        return False, [f"No se pudo leer el archivo: {e}"]

    return validate_dataframe(df)
