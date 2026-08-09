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
def generate_rich_summary(df: pd.DataFrame, filename: str) -> list[str]:
    """
    Returns a list of text chunks — each one focused on a specific
    aspect of the dataset. These get chunked and embedded separately,
    so retrieval is precise instead of averaged across everything.
    """
    chunks = []
    numeric_cols     = df.select_dtypes(include=np.number).columns.tolist()
    categorical_cols = df.select_dtypes(include="object").columns.tolist()

    # ── Chunk 1: Dataset overview ─────────────────────────────────
    chunks.append(f"""
        Dataset overview for {filename}:
        This dataset contains {df.shape[0]} rows and {df.shape[1]} columns.
        The columns are: {', '.join(df.columns.tolist())}.
        There are {len(numeric_cols)} numeric columns: {', '.join(numeric_cols)}.
        There are {len(categorical_cols)} categorical columns: {', '.join(categorical_cols)}.
        Total missing values across the dataset: {df.isnull().sum().sum()}.
        """.strip())

    # ── Chunk per numeric column ──────────────────────────────────
    for col in numeric_cols:
        s      = df[col]
        nulls  = int(s.isnull().sum())
        q25    = round(float(s.quantile(0.25)), 2)
        q75    = round(float(s.quantile(0.75)), 2)
        skew   = round(float(s.skew()), 2)
        skew_desc = (
            "roughly symmetric" if abs(skew) < 0.5
            else "right-skewed (tail toward higher values)" if skew > 0
            else "left-skewed (tail toward lower values)"
        )

        chunks.append(f"""
            Column: {col} (numeric)
            The {col} column has {len(s)} total values with {nulls} missing values
            ({round(nulls/len(s)*100, 1)}% missing).
            The average {col} is {round(float(s.mean()), 2)}, with a median of
            {round(float(s.median()), 2)} and a standard deviation of {round(float(s.std()), 2)}.
            The minimum value is {round(float(s.min()), 2)} and the maximum is {round(float(s.max()), 2)}.
            25% of values are below {q25} and 75% are below {q75}.
            The distribution is {skew_desc}.
            """.strip())

    # ── Chunk per categorical column ──────────────────────────────
    for col in categorical_cols:
        s          = df[col]
        nulls      = int(s.isnull().sum())
        top_values = s.value_counts().head(10)
        top_desc   = ", ".join([
            f"{val} ({count} records, {round(count/len(s)*100, 1)}%)"
            for val, count in top_values.items()
        ])

        chunks.append(f"""
            Column: {col} (categorical)
            The {col} column has {s.nunique()} unique values and {nulls} missing values.
            The most common values are: {top_desc}.
            """.strip())

    # ── Cross-column relationships ────────────────────────────────
    # For each categorical column, compute the mean of each numeric
    # column grouped by that category — this is what makes RAG
    # actually answerable for business questions
    for cat_col in categorical_cols:
        if df[cat_col].nunique() > 15:
            continue  # skip high-cardinality columns like IDs

        lines = [f"Relationship between {cat_col} and numeric columns:"]
        for num_col in numeric_cols:
            group = df.groupby(cat_col)[num_col].mean().round(2)
            group_desc = ", ".join([
                f"{k}: {v}" for k, v in group.items()
            ])
            lines.append(
                f"Average {num_col} by {cat_col} — {group_desc}."
            )
        chunks.append("\n".join(lines))

    # ── Correlation insights ──────────────────────────────────────
    if len(numeric_cols) >= 2:
        corr = df[numeric_cols].corr()
        strong_pairs = []

        for i in range(len(numeric_cols)):
            for j in range(i+1, len(numeric_cols)):
                c = corr.iloc[i, j]
                if abs(c) >= 0.5:  # only report meaningful correlations
                    direction = "positively" if c > 0 else "negatively"
                    strength  = (
                        "strongly" if abs(c) > 0.7
                        else "moderately"
                    )
                    strong_pairs.append(
                        f"{numeric_cols[i]} and {numeric_cols[j]} are "
                        f"{strength} {direction} correlated (r={round(c, 2)})"
                    )

        if strong_pairs:
            chunks.append(
                "Correlation insights:\n" + "\n".join(strong_pairs)
            )

    # ── Sample rows as natural language ──────────────────────────
    # Convert 20 sample rows to natural language sentences.
    # This lets RAG answer questions about specific record patterns.
    sample = df.sample(min(20, len(df)), random_state=42)
    row_descriptions = []
    for _, row in sample.iterrows():
        parts = [f"{col}={row[col]}" for col in df.columns]
        row_descriptions.append("Record: " + ", ".join(parts))

    chunks.append(
        "Sample records from the dataset:\n" +
        "\n".join(row_descriptions)
    )

    # ── Missing values analysis ───────────────────────────────────
    missing = df.isnull().sum()
    missing_cols = missing[missing > 0]
    if len(missing_cols) > 0:
        lines = ["Missing value analysis:"]
        for col, count in missing_cols.items():
            lines.append(
                f"{col} has {count} missing values "
                f"({round(count/len(df)*100, 1)}% of rows)"
            )
        chunks.append("\n".join(lines))
    else:
        chunks.append(
            "Missing value analysis: this dataset has no missing values."
        )
    return chunks
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

    result["text_chunks"] = generate_rich_summary(df, file.filename)
    result["text_summary"] = result["text_chunks"][0]
    return result

@app.get("/health")
def health():
    return {"status": "ok"}