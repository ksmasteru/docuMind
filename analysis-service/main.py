# analysis-service/main.py
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")  # non-interactive backend, no display needed
import matplotlib.pyplot as plt
import seaborn as sns
import base64
import io
import json

app = FastAPI(title="DocuMind Analysis Service")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

def fig_to_base64(fig):
    """Convert matplotlib figure to base64 string."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    buf.seek(0)
    plt.close(fig)
    return base64.b64encode(buf.read()).decode("utf-8")

@app.post("/analyse")
async def analyse(file: UploadFile = File(...)):
    # Read file
    content = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    else:
        df = pd.read_excel(io.BytesIO(content))

    result = {}

    # ── Basic info ────────────────────────────────────────────────
    result["shape"] = {"rows": int(df.shape[0]), "cols": int(df.shape[1])}
    result["columns"] = df.columns.tolist()

    # ── Column profiles ───────────────────────────────────────────
    col_profiles = []
    for col in df.columns:
        profile = {
            "name": col,
            "dtype": str(df[col].dtype),
            "null_count": int(df[col].isnull().sum()),
            "null_pct": round(df[col].isnull().mean() * 100, 1),
            "unique_count": int(df[col].nunique()),
        }
        if pd.api.types.is_numeric_dtype(df[col]):
            profile["stats"] = {
                "mean":   round(float(df[col].mean()), 2),
                "std":    round(float(df[col].std()),  2),
                "min":    round(float(df[col].min()),  2),
                "max":    round(float(df[col].max()),  2),
                "median": round(float(df[col].median()), 2),
            }
        else:
            profile["top_values"] = df[col].value_counts().head(5).to_dict()
        col_profiles.append(profile)
    result["column_profiles"] = col_profiles

    # ── Charts ────────────────────────────────────────────────────
    charts = []
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(include="object").columns.tolist()

    # Distribution of each numeric column
    for col in numeric_cols[:5]:  # cap at 5 charts
        fig, ax = plt.subplots(figsize=(6, 3))
        sns.histplot(df[col].dropna(), kde=True, color="#3730A3", ax=ax)
        ax.set_title(f"Distribution of {col}")
        ax.set_xlabel(col)
        charts.append({
            "title": f"Distribution — {col}",
            "type": "histogram",
            "image": fig_to_base64(fig)
        })

    # Bar chart for categorical columns with few unique values
    for col in categorical_cols[:3]:
        if df[col].nunique() <= 15:
            fig, ax = plt.subplots(figsize=(6, 3))
            counts = df[col].value_counts().head(10)
            sns.barplot(x=counts.values, y=counts.index,
                       palette="Blues_d", ax=ax)
            ax.set_title(f"Top values — {col}")
            charts.append({
                "title": f"Top values — {col}",
                "type": "bar",
                "image": fig_to_base64(fig)
            })

    # Correlation heatmap if enough numeric columns
    if len(numeric_cols) >= 3:
        fig, ax = plt.subplots(figsize=(7, 5))
        corr = df[numeric_cols].corr()
        sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm",
                   center=0, ax=ax)
        ax.set_title("Correlation Matrix")
        charts.append({
            "title": "Correlation Matrix",
            "type": "heatmap",
            "image": fig_to_base64(fig)
        })

    result["charts"] = charts

    # ── Text summary for RAG embedding ────────────────────────────
    # This is what gets chunked and embedded — lets the LLM answer
    # questions about the dataset without seeing all the raw data
    summary_lines = [
        f"Dataset has {df.shape[0]} rows and {df.shape[1]} columns.",
        f"Columns: {', '.join(df.columns.tolist())}",
        "",
        "Column details:",
    ]
    for p in col_profiles:
        line = f"- {p['name']} ({p['dtype']}): {p['null_count']} nulls"
        if "stats" in p:
            s = p["stats"]
            line += f", mean={s['mean']}, std={s['std']}, range=[{s['min']}, {s['max']}]"
        elif "top_values" in p:
            top = list(p["top_values"].keys())[:3]
            line += f", top values: {', '.join(str(v) for v in top)}"
        summary_lines.append(line)

    # Sample rows as context
    summary_lines.append("\nSample rows (first 5):")
    summary_lines.append(df.head(5).to_string())

    result["text_summary"] = "\n".join(summary_lines)

    return result

@app.get("/health")
def health():
    return {"status": "ok"}