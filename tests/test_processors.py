import pytest

import processors
from conftest import build_raw_log


def test_parse_ble_log_extracts_fragments(sample_raw_log):
    fragmentos = processors.parse_ble_log(sample_raw_log)
    assert len(fragmentos) > 0
    # Primer fragmento de la sesion de ejemplo es el tiro "1"
    assert fragmentos[0][1] == "1"


def test_process_raw_log_builds_expected_dataframe(sample_raw_log):
    df, session_id = processors.process_raw_log(sample_raw_log, session_id="test-session")

    assert session_id == "test-session"
    assert list(df["tiro"]) == [1, 1, 2, 2]
    assert list(df["potencia"]) == [5.0, 5.0, 5.0, 5.0]
    # tiro 1 termina con "E" (sin canasta), tiro 2 con "B" (canasta)
    assert df[df["tiro"] == 1]["cesta"].unique().tolist() == [0]
    assert df[df["tiro"] == 2]["cesta"].unique().tolist() == [1]


def test_process_raw_log_raises_when_no_fragments():
    with pytest.raises(ValueError, match="fragmentos BLE"):
        processors.process_raw_log("texto sin formato BLE")


def test_process_raw_log_raises_when_no_data_rows():
    # Solo eventos E/B, ningun evento D -> no hay filas para el DataFrame.
    raw = build_raw_log(["E", "B"])
    with pytest.raises(ValueError, match="ninguna fila"):
        processors.process_raw_log(raw)


def test_compute_tiro_metrics(sample_raw_log):
    df, _ = processors.process_raw_log(sample_raw_log, session_id="test-session")
    metrics = processors.compute_tiro_metrics(df)

    assert len(metrics) == 2
    tiro1, tiro2 = metrics
    assert tiro1["tiro"] == 1
    assert tiro1["muestras"] == 2
    assert tiro1["potencia_max"] == 5.0
    assert tiro1["potencia_avg"] == 5.0
    assert tiro1["cesta"] is False
    assert tiro2["cesta"] is True


def test_compute_session_summary(sample_raw_log):
    df, session_id = processors.process_raw_log(sample_raw_log, session_id="test-session")
    summary = processors.compute_session_summary(df, session_id)

    assert summary["session_id"] == "test-session"
    assert summary["num_tiros"] == 2
    assert summary["total_canastas"] == 1
    assert summary["efectividad"] == 50.0
    assert summary["potencia_avg"] == 5.0
    assert len(summary["tiros"]) == 2
    assert summary["consistencia"] == 100.0  # misma potencia en ambos tiros -> CV=0
    assert set(summary["axis_stats"].keys()) == {"x", "y", "z"}
    assert summary["axis_stats"]["x"]["mean"] == 3.0
    assert summary["axis_stats"]["x"]["std"] == 0.0
    assert set(summary["axis_biomechanics"].keys()) == {"x", "y", "z"}
    assert set(summary["axis_biomechanics"]["x"].keys()) == {"cesta", "fallo"}
    assert summary["axis_biomechanics"]["x"]["cesta"]["mean"] == 3.0
    assert summary["axis_biomechanics"]["x"]["fallo"]["mean"] == 3.0


def test_compute_axis_biomechanics_splits_by_resultado(sample_raw_log):
    df, _ = processors.process_raw_log(sample_raw_log, session_id="test-session")
    biomechanics = processors.compute_axis_biomechanics(df)

    assert biomechanics["y"]["cesta"]["mean"] == 4.0
    assert biomechanics["y"]["fallo"]["mean"] == 4.0
    assert biomechanics["z"]["cesta"]["mean"] == 0.0
    assert biomechanics["z"]["fallo"]["mean"] == 0.0


def test_compute_consistencia_lower_when_potencia_varies():
    tiros_consistentes = [{"potencia_avg": 5.0}, {"potencia_avg": 5.0}]
    tiros_variables = [{"potencia_avg": 2.0}, {"potencia_avg": 10.0}]

    assert processors.compute_consistencia(tiros_consistentes) == 100.0
    assert processors.compute_consistencia(tiros_variables) < 100.0


def test_compute_consistencia_single_tiro_is_perfect():
    assert processors.compute_consistencia([{"potencia_avg": 7.0}]) == 100.0


def test_generate_session_id_has_date_prefix():
    from datetime import datetime

    session_id = processors.generate_session_id()
    assert session_id.startswith(datetime.now().strftime("%Y%m%d"))
