import pandas as pd
import pytest

from validators import validate_dataframe, validate_raw_upload

REQUIRED_COLUMNS = ["timestamp", "session", "tiro", "x", "y", "z", "potencia", "cesta"]


def make_valid_df() -> pd.DataFrame:
    return pd.DataFrame({
        "timestamp": ["18:06:51.000", "18:06:51.060"],
        "session": ["s1", "s1"],
        "tiro": [1, 1],
        "x": [3, 3],
        "y": [4, 4],
        "z": [0, 0],
        "potencia": [5.0, 5.0],
        "cesta": [0, 0],
    })


def test_validate_dataframe_accepts_valid_data():
    ok, errors = validate_dataframe(make_valid_df())
    assert ok is True
    assert errors == []


def test_validate_dataframe_detects_missing_column():
    df = make_valid_df().drop(columns=["potencia"])
    ok, errors = validate_dataframe(df)
    assert ok is False
    assert any("potencia" in e for e in errors)


def test_validate_dataframe_detects_empty_dataframe():
    df = pd.DataFrame(columns=REQUIRED_COLUMNS)
    ok, errors = validate_dataframe(df)
    assert ok is False
    assert any("vacio" in e for e in errors)


def test_validate_dataframe_detects_null_tiro():
    df = make_valid_df()
    df.loc[0, "tiro"] = None
    ok, errors = validate_dataframe(df)
    assert ok is False
    assert any("tiro" in e for e in errors)


def test_validate_dataframe_detects_negative_potencia():
    df = make_valid_df()
    df.loc[0, "potencia"] = -1.0
    ok, errors = validate_dataframe(df)
    assert ok is False
    assert any("potencia negativa" in e for e in errors)


def test_validate_dataframe_detects_invalid_cesta():
    df = make_valid_df()
    df.loc[0, "cesta"] = 2
    ok, errors = validate_dataframe(df)
    assert ok is False
    assert any("cesta" in e for e in errors)


def test_validate_raw_upload_rejects_empty_file():
    ok, errors = validate_raw_upload(b"")
    assert ok is False
    assert any("vacio" in e for e in errors)


def test_validate_raw_upload_rejects_invalid_utf8():
    ok, errors = validate_raw_upload(b"\xff\xfe\x00\x01")
    assert ok is False
    assert any("UTF-8" in e for e in errors)


def test_validate_raw_upload_accepts_text():
    ok, errors = validate_raw_upload("18:06:51.000,Connected Device\n".encode("utf-8"))
    assert ok is True
    assert errors == []
