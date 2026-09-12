import pytest
from fastapi.testclient import TestClient

import database
import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def isolate_data_dir(tmp_path, monkeypatch):
    """Redirige la persistencia a un directorio temporal por test, para no
    tocar data/ real ni acumular estado entre tests."""
    monkeypatch.setattr(database, "DATA_DIR", tmp_path)
    monkeypatch.setattr(database, "PROCESSED_DIR", tmp_path / "processed")
    monkeypatch.setattr(database, "INDEX_PATH", tmp_path / "index.json")
    yield


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_upload_sesion_success(sample_raw_log):
    resp = client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "api-test-1"
    assert body["num_tiros"] == 2
    assert body["total_canastas"] == 1
    assert body["efectividad"] == 50.0
    assert body["potencia_avg"] == 5.0
    assert body["consistencia"] == 100.0
    assert set(body["axis_stats"].keys()) == {"x", "y", "z"}
    assert len(body["tiros"]) == 2


def test_upload_sesion_rejects_empty_file():
    resp = client.post("/api/upload", files={"file": ("log.csv", b"", "text/csv")})
    assert resp.status_code == 400
    assert "errors" in resp.json()["detail"]


def test_upload_sesion_rejects_log_without_ble_data():
    resp = client.post(
        "/api/upload",
        files={"file": ("log.csv", b"esto no es un log BLE", "text/csv")},
    )
    assert resp.status_code == 400


def test_upload_sesion_rejects_duplicate_session_id(sample_raw_log):
    params = {"session_id": "api-test-dup"}
    files = {"file": ("log.csv", sample_raw_log, "text/csv")}

    first = client.post("/api/upload", files=files, params=params)
    assert first.status_code == 200

    second = client.post("/api/upload", files=files, params=params)
    assert second.status_code == 400


def test_listar_sesiones(sample_raw_log):
    client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-list"},
    )
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    body = resp.json()
    ids = [row["session_id"] for row in body]
    assert "api-test-list" in ids
    row = next(r for r in body if r["session_id"] == "api-test-list")
    assert row["num_tiros"] == 2
    assert row["potencia_avg"] == 5.0


def test_listar_sesiones_filters_by_date(sample_raw_log):
    client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-date"},
    )
    from datetime import datetime, timedelta

    manana = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    resp = client.get("/api/sessions", params={"date_from": manana})
    assert resp.status_code == 200
    assert resp.json() == []


def test_detalle_sesion(sample_raw_log):
    client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-detail"},
    )
    resp = client.get("/api/sessions/api-test-detail")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "api-test-detail"
    assert body["num_tiros"] == 2


def test_detalle_sesion_not_found():
    resp = client.get("/api/sessions/no-existe")
    assert resp.status_code == 404


def test_comparar_sesiones(sample_raw_log):
    client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-compare-1"},
    )
    resp = client.get("/api/compare")
    assert resp.status_code == 200
    body = resp.json()
    ids = [s["session_id"] for s in body["sessions"]]
    assert "api-test-compare-1" in ids
    session_row = next(s for s in body["sessions"] if s["session_id"] == "api-test-compare-1")
    assert session_row["potencias"] == [5.0, 5.0]
    assert len(body["samples"]) == 4  # 2 tiros x 2 muestras cada uno


def test_comparar_sesiones_empty():
    resp = client.get("/api/compare")
    assert resp.status_code == 200
    assert resp.json() == {"sessions": [], "samples": []}
