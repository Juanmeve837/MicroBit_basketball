#!/usr/bin/env python3
"""
train_model.py — Entrena y compara modelos de clasificacion cesta/fallo
sobre el dataset agregado por tiro (data/processed/features_por_tiro.csv).

Pipeline:
    1. Carga features y hace train/test split (80/20, estratificado).
    2. Compara baselines: Logistic Regression, Decision Tree, Random Forest
       (validacion cruzada 5-fold sobre el set de entrenamiento).
    3. Ajusta hiperparametros del mejor modelo con GridSearchCV.
    4. Evalua en el set de test: accuracy, precision, recall, F1, ROC-AUC,
       matriz de confusion, umbral optimo.
    5. Analiza feature importance.
    6. Guarda modelo (models/best_model.pkl), metricas (results/metrics.json)
       y graficos (results/feature_importance.png, confusion_matrix.png,
       roc_curve.png).

Manejo del desbalance de clases (~34% cestas / 66% fallos):
    --imbalance class_weight (por defecto): class_weight="balanced" en cada modelo.
    --imbalance smote: SMOTE sobre el set de entrenamiento (imbalanced-learn).

Uso:
    python scripts/train_model.py
    python scripts/train_model.py --imbalance smote
"""

import argparse
import json
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    RocCurveDisplay,
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from config.config import Config

warnings.filterwarnings("ignore", category=FutureWarning)

RANDOM_STATE = 42
FEATURE_EXCLUDE = {"tiro", "session", "cesta"}


def load_dataset(path: Path) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    df = pd.read_csv(path)
    feature_cols = [c for c in df.columns if c not in FEATURE_EXCLUDE]
    X = df[feature_cols]
    y = df["cesta"]
    return X, y, feature_cols


def make_pipeline(model, imbalance: str):
    steps = [("scaler", StandardScaler())]
    if imbalance == "smote":
        from imblearn.over_sampling import SMOTE
        from imblearn.pipeline import Pipeline as ImbPipeline

        steps.append(("smote", SMOTE(random_state=RANDOM_STATE)))
        steps.append(("model", model))
        return ImbPipeline(steps)
    steps.append(("model", model))
    return Pipeline(steps)


def build_models(imbalance: str) -> dict:
    class_weight = None if imbalance == "smote" else "balanced"
    return {
        "logistic_regression": make_pipeline(
            LogisticRegression(max_iter=2000, class_weight=class_weight, random_state=RANDOM_STATE), imbalance
        ),
        "decision_tree": make_pipeline(
            DecisionTreeClassifier(class_weight=class_weight, random_state=RANDOM_STATE), imbalance
        ),
        "random_forest": make_pipeline(
            RandomForestClassifier(
                n_estimators=300, class_weight=class_weight, random_state=RANDOM_STATE
            ),
            imbalance,
        ),
    }


def cross_validate_models(models: dict, X_train, y_train) -> pd.DataFrame:
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    scoring = ["accuracy", "precision", "recall", "f1"]
    rows = []
    for name, pipeline in models.items():
        scores = cross_validate(pipeline, X_train, y_train, cv=cv, scoring=scoring)
        rows.append({
            "modelo": name,
            "accuracy": scores["test_accuracy"].mean(),
            "precision": scores["test_precision"].mean(),
            "recall": scores["test_recall"].mean(),
            "f1": scores["test_f1"].mean(),
        })
    return pd.DataFrame(rows).sort_values("f1", ascending=False).reset_index(drop=True)


PARAM_GRIDS = {
    "random_forest": {
        "model__n_estimators": [200, 300, 500],
        "model__max_depth": [None, 5, 10, 15],
        "model__min_samples_split": [2, 5, 10],
        "model__min_samples_leaf": [1, 2, 4],
    },
    "decision_tree": {
        "model__max_depth": [None, 3, 5, 10, 15],
        "model__min_samples_split": [2, 5, 10],
        "model__min_samples_leaf": [1, 2, 4],
    },
    "logistic_regression": {
        "model__C": [0.01, 0.1, 1, 10, 100],
        "model__penalty": ["l2"],
    },
}


def tune_best_model(best_name: str, models: dict, X_train, y_train):
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    grid = GridSearchCV(
        models[best_name], PARAM_GRIDS[best_name], scoring="f1", cv=cv, n_jobs=-1
    )
    grid.fit(X_train, y_train)
    return grid.best_estimator_, grid.best_params_, grid.best_score_


def optimal_threshold(y_true, y_proba) -> float:
    thresholds = np.linspace(0.05, 0.95, 181)
    f1s = [f1_score(y_true, (y_proba >= t).astype(int)) for t in thresholds]
    return float(thresholds[int(np.argmax(f1s))])


def evaluate(model, X_test, y_test, threshold: float) -> dict:
    y_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= threshold).astype(int)
    return {
        "threshold": threshold,
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "y_proba": y_proba,
        "y_pred": y_pred,
    }


def plot_feature_importance(model, feature_cols: list[str], out_path: Path, best_name: str):
    inner = model.named_steps["model"]
    if hasattr(inner, "feature_importances_"):
        importances = inner.feature_importances_
    elif hasattr(inner, "coef_"):
        importances = np.abs(inner.coef_[0])
    else:
        return
    order = np.argsort(importances)[::-1]
    top_n = min(15, len(feature_cols))
    plt.figure(figsize=(8, 6))
    sns.barplot(
        x=importances[order][:top_n],
        y=[feature_cols[i] for i in order][:top_n],
        color="steelblue",
    )
    plt.title(f"Feature importance — {best_name}")
    plt.xlabel("Importancia")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_confusion_matrix(y_test, y_pred, out_path: Path):
    cm = confusion_matrix(y_test, y_pred)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=["Fallo", "Cesta"])
    fig, ax = plt.subplots(figsize=(5, 5))
    disp.plot(ax=ax, cmap="Blues", colorbar=False)
    ax.set_title("Matriz de confusion")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def plot_roc_curve(y_test, y_proba, out_path: Path):
    fpr, tpr, _ = roc_curve(y_test, y_proba)
    auc = roc_auc_score(y_test, y_proba)
    fig, ax = plt.subplots(figsize=(5, 5))
    RocCurveDisplay(fpr=fpr, tpr=tpr, roc_auc=auc).plot(ax=ax)
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray")
    ax.set_title("Curva ROC")
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()


def main():
    parser = argparse.ArgumentParser(description="Entrena y evalua modelos de prediccion cesta/fallo.")
    parser.add_argument("--input", type=Path, default=None, help="dataset agregado (por defecto: data/processed/features_por_tiro.csv)")
    parser.add_argument("--imbalance", choices=["class_weight", "smote"], default="class_weight")
    args = parser.parse_args()

    config = Config.instance()
    input_path = args.input or (config.get_path("data_processed") / "features_por_tiro.csv")

    repo_root = Path(__file__).resolve().parent.parent
    models_dir = repo_root / "models"
    results_dir = repo_root / "results"
    figures_dir = results_dir / "figures"
    for d in (models_dir, results_dir, figures_dir):
        d.mkdir(parents=True, exist_ok=True)

    print(f"[*] Cargando dataset: {input_path}")
    X, y, feature_cols = load_dataset(input_path)
    print(f"    {len(X)} tiros, {len(feature_cols)} features, balance={y.value_counts(normalize=True).to_dict()}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    print(f"[*] Train/test split: {len(X_train)}/{len(X_test)} tiros (80/20 estratificado)")

    print(f"\n[*] Comparando baseline models (5-fold CV, imbalance={args.imbalance}) ...")
    models = build_models(args.imbalance)
    cv_results = cross_validate_models(models, X_train, y_train)
    print(cv_results.to_string(index=False))

    best_name = cv_results.iloc[0]["modelo"]
    print(f"\n[*] Mejor modelo por F1 en CV: {best_name}")

    print(f"[*] Tuning de hiperparametros (GridSearchCV, scoring=f1) ...")
    best_model, best_params, best_cv_f1 = tune_best_model(best_name, models, X_train, y_train)
    print(f"    Mejores hiperparametros: {best_params}")
    print(f"    F1 en CV tras tuning:    {best_cv_f1:.3f}")

    best_model.fit(X_train, y_train)
    y_proba_train = best_model.predict_proba(X_train)[:, 1]
    thr = optimal_threshold(y_train, y_proba_train)
    print(f"[*] Umbral optimo (maximiza F1 en train): {thr:.2f}")

    test_metrics = evaluate(best_model, X_test, y_test, thr)
    print("\n[*] Metricas en test set:")
    for k in ("accuracy", "precision", "recall", "f1", "roc_auc"):
        print(f"    {k:10s}: {test_metrics[k]:.3f}")
    print(f"    matriz de confusion: {test_metrics['confusion_matrix']}")

    default_metrics = evaluate(best_model, X_test, y_test, 0.5)

    print("\n[*] Generando graficos ...")
    plot_feature_importance(best_model, feature_cols, figures_dir / "feature_importance.png", best_name)
    plot_confusion_matrix(y_test, test_metrics["y_pred"], figures_dir / "confusion_matrix.png")
    plot_roc_curve(y_test, test_metrics["y_proba"], figures_dir / "roc_curve.png")

    model_path = models_dir / "best_model.pkl"
    joblib.dump({"model": best_model, "feature_cols": feature_cols, "threshold": thr}, model_path)
    print(f"[OK] Modelo guardado en: {model_path}")

    metrics_out = {
        "best_model": best_name,
        "best_params": best_params,
        "imbalance_strategy": args.imbalance,
        "cv_comparison": cv_results.to_dict(orient="records"),
        "cv_f1_after_tuning": best_cv_f1,
        "optimal_threshold": thr,
        "test_metrics_default_threshold": {k: v for k, v in default_metrics.items() if k not in ("y_proba", "y_pred")},
        "test_metrics_optimal_threshold": {k: v for k, v in test_metrics.items() if k not in ("y_proba", "y_pred")},
        "n_train": len(X_train),
        "n_test": len(X_test),
        "feature_cols": feature_cols,
    }
    metrics_path = results_dir / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_out, f, indent=2, ensure_ascii=False)
    print(f"[OK] Metricas guardadas en: {metrics_path}")


if __name__ == "__main__":
    main()
