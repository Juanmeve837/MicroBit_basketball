"""Esquemas Pydantic de la API de Basket Tracker.

Nombres de campos alineados al contrato que ya consume el frontend
(feature/frontend-react: src/services/api.js y componentes) en vez de
la nomenclatura original en espanol usada por los scripts de analisis.
"""

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


class AxisStat(BaseModel):
    mean: float
    std: float


class AxisStats(BaseModel):
    x: AxisStat
    y: AxisStat
    z: AxisStat


class AxisStatByResult(BaseModel):
    cesta: AxisStat
    fallo: AxisStat


class AxisBiomechanics(BaseModel):
    x: AxisStatByResult
    y: AxisStatByResult
    z: AxisStatByResult


class SesionResumen(BaseModel):
    """Fila resumida usada en el listado GET /api/sessions."""

    session_id: str
    date: str
    num_tiros: int
    total_canastas: int
    efectividad: float
    potencia_avg: float


class SesionOutput(SesionResumen):
    """Respuesta completa con metricas por tiro (GET /api/sessions/{id}, POST /api/upload)."""

    consistencia: float
    axis_stats: AxisStats
    axis_biomechanics: AxisBiomechanics
    tiros: List[TiroData]


class CompareSession(BaseModel):
    """Fila de sesion usada por el frontend para graficos comparativos."""

    session_id: str
    date: str
    efectividad: float
    potencias: List[float]


class Sample(BaseModel):
    x: float
    y: float
    z: float


class CompareOutput(BaseModel):
    """Respuesta de GET /api/compare."""

    sessions: List[CompareSession]
    samples: List[Sample]


class ErrorResponse(BaseModel):
    """Forma estandar de las respuestas de error (400/404/500)."""

    detail: str
    errors: List[str] = Field(default_factory=list)
