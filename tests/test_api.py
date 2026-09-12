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


def test_crear_sesion_success(sample_raw_log):
    resp = client.post(
        "/api/sesion",
        files={"archivo": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "api-test-1"
    assert body["total_tiros"] == 2
    assert body["total_canastas"] == 1
    assert body["efectividad"] == 50.0
    assert len(body["tiros"]) == 2


def test_crear_sesion_rejects_empty_file():
    resp = client.post("/api/sesion", files={"archivo": ("log.csv", b"", "text/csv")})
    assert resp.status_code == 400
    assert "errors" in resp.json()["detail"]


def test_crear_sesion_rejects_log_without_ble_data():
    resp = client.post(
        "/api/sesion",
        files={"archivo": ("log.csv", b"esto no es un log BLE", "text/csv")},
    )
    assert resp.status_code == 400


def test_crear_sesion_rejects_duplicate_session_id(sample_raw_log):
    params = {"session_id": "api-test-dup"}
    files = {"archivo": ("log.csv", sample_raw_log, "text/csv")}

    first = client.post("/api/sesion", files=files, params=params)
    assert first.status_code == 200

    second = client.post("/api/sesion", files=files, params=params)
    assert second.status_code == 400


def test_listar_sesiones(sample_raw_log):
    client.post(
        "/api/sesion",
        files={"archivo": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-list"},
    )
    resp = client.get("/api/sesiones")
    assert resp.status_code == 200
    ids = [row["session_id"] for row in resp.json()]
    assert "api-test-list" in ids


def test_detalle_sesion(sample_raw_log):
    client.post(
        "/api/sesion",
        files={"archivo": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-detail"},
    )
    resp = client.get("/api/sesion/api-test-detail")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "api-test-detail"
    assert body["total_tiros"] == 2


def test_detalle_sesion_not_found():
    resp = client.get("/api/sesion/no-existe")
    assert resp.status_code == 404
