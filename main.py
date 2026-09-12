"""API FastAPI de Basket Tracker.

Recibe logs BLE crudos (export de nRF Connect) de sesiones de tiro,
los procesa en metricas por tiro/sesion y las expone para el frontend.

Correr con:
    uvicorn main:app --reload --port 8000
"""

import logging
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

import database
import processors
from models import ErrorResponse, SesionOutput, SesionResumen
from validators import validate_dataframe, validate_raw_upload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("basket_backend")

app = FastAPI(title="Basket Tracker API", version="0.1.0")

# MVP: abierto a cualquier origen para desarrollo local del frontend.
# Restringir a dominios concretos antes de desplegar a produccion.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no manejado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor", "errors": [str(exc)]},
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post(
    "/api/sesion",
    response_model=SesionOutput,
    responses={400: {"model": ErrorResponse}},
)
async def crear_sesion(
    archivo: UploadFile = File(..., description="Log BLE crudo exportado de nRF Connect"),
    session_id: Optional[str] = None,
) -> dict:
    content = await archivo.read()

    ok, errors = validate_raw_upload(content)
    if not ok:
        logger.info("Upload rechazado (%s): %s", archivo.filename, errors)
        raise HTTPException(status_code=400, detail={"detail": "Archivo invalido", "errors": errors})

    try:
        df, resolved_session_id = processors.process_raw_log(content.decode("utf-8"), session_id)
    except ValueError as exc:
        logger.info("No se pudo procesar %s: %s", archivo.filename, exc)
        raise HTTPException(status_code=400, detail={"detail": str(exc), "errors": [str(exc)]})

    ok, errors = validate_dataframe(df)
    if not ok:
        logger.warning("Sesion %s generada con inconsistencias: %s", resolved_session_id, errors)

    summary = processors.compute_session_summary(df, resolved_session_id)

    try:
        database.save_session(df, summary)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"detail": str(exc), "errors": [str(exc)]})

    logger.info(
        "Sesion %s guardada: %s tiros, %s%% efectividad",
        resolved_session_id, summary["total_tiros"], summary["efectividad"],
    )
    return summary


@app.get("/api/sesiones", response_model=List[SesionResumen])
def listar_sesiones() -> list:
    return database.list_sessions()


@app.get(
    "/api/sesion/{session_id}",
    response_model=SesionOutput,
    responses={404: {"model": ErrorResponse}},
)
def detalle_sesion(session_id: str) -> dict:
    row = database.get_session_summary_row(session_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"detail": f"Sesion '{session_id}' no encontrada", "errors": []},
        )

    df = database.get_session_dataframe(session_id)
    if df is None:
        raise HTTPException(
            status_code=404,
            detail={"detail": f"CSV de la sesion '{session_id}' no encontrado", "errors": []},
        )

    summary = processors.compute_session_summary(df, session_id)
    summary["fecha"] = row["fecha"]
    return summary
