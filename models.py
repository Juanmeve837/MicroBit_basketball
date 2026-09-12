"""Esquemas Pydantic de la API de Basket Tracker."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TiroData(BaseModel):
    """Metricas de un tiro individual dentro de una sesion."""

    tiro: int
    muestras: int
    potencia_max: float
    potencia_avg: float
    potencia_min: float
    cesta: bool


class SessionInput(BaseModel):
    """Parametros opcionales al crear una sesion (el archivo va como multipart)."""

    session_id: Optional[str] = Field(
        default=None,
        description="ID de sesion a forzar. Si se omite, se autogenera con fecha + UUID.",
    )


class SesionResumen(BaseModel):
    """Fila resumida usada en el listado GET /api/sesiones."""

    session_id: str
    fecha: datetime
    total_tiros: int
    total_canastas: int
    efectividad: float


class SesionOutput(SesionResumen):
    """Respuesta completa con metricas por tiro."""

    potencia_promedio: float
    tiros: List[TiroData]


class ErrorResponse(BaseModel):
    """Forma estandar de las respuestas de error (400/404/500)."""

    detail: str
    errors: List[str] = Field(default_factory=list)
