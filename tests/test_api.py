import pytest
from fastapi.testclient import TestClient

import database
import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def isolate_data_dir(tmp_path, monkeypatch):
    """Redirige la persistencia a un archivo SQLite temporal por test, para no
    tocar data/ real ni acumular estado entre tests."""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    yield


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "commit" in body


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


def test_borrar_sesion(sample_raw_log):
    client.post(
        "/api/upload",
        files={"file": ("log.csv", sample_raw_log, "text/csv")},
        params={"session_id": "api-test-delete"},
    )
    resp = client.delete("/api/sessions/api-test-delete")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "session_id": "api-test-delete"}

    assert client.get("/api/sessions/api-test-delete").status_code == 404
    ids = [row["session_id"] for row in client.get("/api/sessions").json()]
    assert "api-test-delete" not in ids


def test_borrar_sesion_not_found():
    resp = client.delete("/api/sessions/no-existe")
    assert resp.status_code == 404


def test_comparar_sesiones_empty():
    resp = client.get("/api/compare")
    assert resp.status_code == 200
    assert resp.json() == {"sessions": [], "samples": []}


CSV_HEADER = "timestamp,session,tiro,x,y,z,potencia,cesta"


def _csv_sesion(session_id, interrumpido_por_tiro=None):
    """CSV de captura en vivo con 2 tiros de 2 muestras; `interrumpido_por_tiro`
    agrega la columna opcional `interrumpido` (dict tiro -> 0/1)."""
    header = CSV_HEADER + (",interrumpido" if interrumpido_por_tiro is not None else "")
    filas = [header]
    for tiro, cesta in ((1, 0), (2, 1)):
        for _ in range(2):
            fila = f"10:00:00.000,{session_id},{tiro},3,4,0,5.0,{cesta}"
            if interrumpido_por_tiro is not None:
                fila += f",{interrumpido_por_tiro[tiro]}"
            filas.append(fila)
    return "\n".join(filas) + "\n"


def test_sesion_csv_persists_interrupted_shots():
    csv = _csv_sesion("20260101_ABCD1234", {1: 0, 2: 1})
    resp = client.post("/api/sesion", files={"file": ("s.csv", csv, "text/csv")})
    assert resp.status_code == 200
    assert [t["interrumpido"] for t in resp.json()["tiros"]] == [False, True]

    detalle = client.get("/api/sessions/20260101_ABCD1234").json()
    assert [t["interrumpido"] for t in detalle["tiros"]] == [False, True]


def test_sesion_csv_without_interrupted_column_defaults_to_false():
    csv = _csv_sesion("20260101_EFGH5678")
    resp = client.post("/api/sesion", files={"file": ("s.csv", csv, "text/csv")})
    assert resp.status_code == 200

    detalle = client.get("/api/sessions/20260101_EFGH5678").json()
    assert [t["interrumpido"] for t in detalle["tiros"]] == [False, False]


def test_connect_migrates_shots_table_without_interrupted_column(tmp_path, monkeypatch):
    import libsql

    db_file = tmp_path / "old.db"
    conn = libsql.connect(database=str(db_file))
    cur = conn.cursor()
    cur.execute(
        "CREATE TABLE shots (id INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT NOT NULL, "
        "timestamp TEXT, tiro INTEGER NOT NULL, x INTEGER, y INTEGER, z INTEGER, "
        "potencia REAL, cesta INTEGER NOT NULL)"
    )
    cur.execute("INSERT INTO shots (session, timestamp, tiro, x, y, z, potencia, cesta) VALUES ('viejo','t',1,1,2,3,3.7,1)")
    conn.commit()
    conn.close()

    monkeypatch.setattr(database, "DB_PATH", db_file)
    conn = database._connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT interrumpido FROM shots WHERE session = 'viejo'")
        assert cur.fetchall() == [(0,)]
    finally:
        conn.close()
