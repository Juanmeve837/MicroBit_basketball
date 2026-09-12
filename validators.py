"""Validacion de datos de entrada: archivo crudo subido y DataFrame de sesion."""

from typing import List, Tuple

import pandas as pd

REQUIRED_COLUMNS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"]


def validate_raw_upload(content: bytes) -> Tuple[bool, List[str]]:
    """Valida el archivo crudo subido antes de intentar parsearlo como log BLE."""
    errors: List[str] = []
    if not content:
        errors.append("El archivo esta vacio")
        return False, errors
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        errors.append("El archivo no es texto UTF-8 valido")
    return len(errors) == 0, errors


def validate_dataframe(df: pd.DataFrame) -> Tuple[bool, List[str]]:
    """Valida que un DataFrame de sesion (ya parseado) tenga el formato esperado."""
    errors: List[str] = []

    for col in REQUIRED_COLUMNS:
        if col not in df.columns:
            errors.append(f"Falta columna requerida: '{col}'")
    if errors:
        # Sin las columnas base no tiene sentido seguir validando contenido.
        return False, errors

    if df.empty:
        errors.append("El DataFrame esta vacio")

    if df["tiro"].isnull().any():
        errors.append("Hay valores nulos en columna 'tiro'")

    invalid_potencia = df[df["potencia"] < 0]
    if not invalid_potencia.empty:
        errors.append(f"Hay {len(invalid_potencia)} filas con potencia negativa")

    invalid_cesta = df[~df["cesta"].isin([0, 1])]
    if not invalid_cesta.empty:
        errors.append(f"Hay {len(invalid_cesta)} filas con cesta fuera de {{0,1}}")

    return len(errors) == 0, errors
