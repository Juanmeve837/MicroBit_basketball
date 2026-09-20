"""API FastAPI de Basket Tracker.

Recibe logs BLE crudos (export de nRF Connect) de sesiones de tiro,
los procesa en metricas por tiro/sesion y las expone para el frontend.

Correr con:
    uvicorn main:app --reload --port 8000
"""

import io
import logging
import os
import re
from datetime import datetime
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

import database
import processors
from models import CompareOutput, ErrorResponse, SesionOutput, SesionResumen
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

# Muestras crudas (x, y, z) devueltas por sesion en /api/compare, para no
# mandar sesiones enteras cuando hay muchas muestras por tiro.
MAX_COMPARE_SAMPLES_PER_SESSION = 200
MAX_COMPARE_SAMPLES_TOTAL = 2000


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no manejado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor", "errors": [str(exc)]},
    )


def _date_from_session_id(session_id: str) -> Optional[str]:
    match = re.match(r"^(\d{8})_", session_id)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


@app.get("/api/health")
def health() -> dict:
    # RENDER_GIT_COMMIT lo setea Render automaticamente en cada deploy con el
    # SHA del commit desplegado. Permite confirmar desde afuera que rama/commit
    # esta realmente corriendo en produccion, sin adivinar (ver incidente de
    # deploy desincronizado documentado en el README).
    return {"status": "ok", "commit": os.environ.get("RENDER_GIT_COMMIT")}


@app.post(
    "/api/upload",
    response_model=SesionOutput,
    responses={400: {"model": ErrorResponse}},
)
async def upload_sesion(
    file: UploadFile = File(..., description="Log BLE crudo exportado de nRF Connect"),
    session_id: Optional[str] = None,
) -> dict:
    content = await file.read()

    ok, errors = validate_raw_upload(content)
    if not ok:
        logger.info("Upload rechazado (%s): %s", file.filename, errors)
        raise HTTPException(status_code=400, detail={"detail": "Archivo invalido", "errors": errors})

    try:
        df, resolved_session_id = processors.process_raw_log(content.decode("utf-8"), session_id)
    except ValueError as exc:
        logger.info("No se pudo procesar %s: %s", file.filename, exc)
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
        resolved_session_id, summary["num_tiros"], summary["efectividad"],
    )
    return summary


@app.post(
    "/api/sesion",
    response_model=SesionOutput,
    responses={400: {"model": ErrorResponse}},
)
async def sesion_csv(
    file: UploadFile = File(..., description="CSV ya armado por el frontend (captura Web Bluetooth)"),
    session_id: Optional[str] = Form(None),
) -> dict:
    """Recibe la sesion ya parseada (timestamp,session,tiro,x,y,z,potencia,cesta).

    Ruta alterna a /api/upload: mismo esquema y misma persistencia, pero sin
    pasar por el log crudo de nRF Connect.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail={"detail": "Archivo invalido", "errors": ["El archivo esta vacio"]})
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"detail": "CSV invalido", "errors": [str(exc)]})

    ok, errors = validate_dataframe(df)
    if not ok:
        raise HTTPException(status_code=400, detail={"detail": "CSV invalido", "errors": errors})

    resolved_session_id = session_id or str(df["session"].iloc[0])
    df["session"] = resolved_session_id
    summary = processors.compute_session_summary(df, resolved_session_id)
    # El servidor corre en UTC: la fecha "de hoy" del usuario puede ser distinta.
    # El ID de sesion ya trae la fecha local del cliente (YYYYMMDD_xxxx).
    summary["date"] = _date_from_session_id(resolved_session_id) or summary["date"]
    try:
        database.save_session(df, summary)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"detail": str(exc), "errors": [str(exc)]})

    logger.info("Sesion %s guardada via CSV: %s tiros", resolved_session_id, summary["num_tiros"])
    return summary


@app.get("/api/sessions", response_model=List[SesionResumen])
def listar_sesiones(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: Optional[str] = None,
    order: str = "desc",
) -> list:
    return database.list_sessions(date_from=date_from, date_to=date_to, sort_by=sort_by, order=order)


@app.get(
    "/api/sessions/{session_id}",
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
    summary["date"] = row["date"]
    return summary


@app.delete(
    "/api/sessions/{session_id}",
    responses={404: {"model": ErrorResponse}},
)
def borrar_sesion(session_id: str) -> dict:
    deleted = database.delete_session(session_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"detail": f"Sesion '{session_id}' no encontrada", "errors": []},
        )
    logger.info("Sesion %s borrada", session_id)
    return {"status": "ok", "session_id": session_id}


@app.get("/api/compare", response_model=CompareOutput)
def comparar_sesiones() -> dict:
    """Datos agregados de todas las sesiones para los graficos de comparativas."""
    compare_sessions = []
    samples: List[dict] = []

    for row in database.list_sessions(sort_by="date", order="asc"):
        df = database.get_session_dataframe(row["session_id"])
        if df is None:
            continue

        tiros = processors.compute_tiro_metrics(df)
        compare_sessions.append({
            "session_id": row["session_id"],
            "date": row["date"],
            "efectividad": row["efectividad"],
            "potencias": [t["potencia_avg"] for t in tiros],
        })

        if len(samples) < MAX_COMPARE_SAMPLES_TOTAL:
            restantes = MAX_COMPARE_SAMPLES_TOTAL - len(samples)
            n = min(MAX_COMPARE_SAMPLES_PER_SESSION, restantes)
            samples.extend(df[["x", "y", "z"]].head(n).to_dict(orient="records"))

    return {"sessions": compare_sessions, "samples": samples}
