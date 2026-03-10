from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import json
import glob
import pandas as pd
import numpy as np
import threading
from collections import defaultdict
import re

# =====================================================================
# CONFIGURATION (T-REQ-010 / T-REQ-020 | F-SYS-205)
# =====================================================================
CONFIG_FILE = os.environ.get("CONFIG_FILE", "./config/config.json")
EXTERNAL_PARQUET_DIR = None
WATCHLIST_DIR = None
FEATURE_CONFIG_PATH = None
ANNOTATION_FILE = "annotations.json"

def load_global_config():
    """Liest config.json und setzt EXTERNAL_PARQUET_DIR und WATCHLIST_DIR."""
    global EXTERNAL_PARQUET_DIR, WATCHLIST_DIR, FEATURE_CONFIG_PATH
    if not os.path.exists(CONFIG_FILE):
        print(f"[CRITICAL] Config file {CONFIG_FILE} not found! No data will be available.")
        return
    try:
        with open(CONFIG_FILE, "r") as f:
            cfg = json.load(f)
        EXTERNAL_PARQUET_DIR = cfg.get("EXTERNAL_PARQUET_DIR")
        WATCHLIST_DIR = cfg.get("WATCHLIST_DIR")
        FEATURE_CONFIG_PATH = cfg.get("FEATURE_CONFIG_PATH")
        
        if not EXTERNAL_PARQUET_DIR or not WATCHLIST_DIR or not FEATURE_CONFIG_PATH:
            print(f"[CRITICAL] Config file is incomplete! Missing directories or FEATURE_CONFIG_PATH.")
        else:
            print(f"[INFO] EXTERNAL_PARQUET_DIR = {EXTERNAL_PARQUET_DIR}")
            print(f"[INFO] WATCHLIST_DIR        = {WATCHLIST_DIR}")
            print(f"[INFO] FEATURE_CONFIG_PATH  = {FEATURE_CONFIG_PATH}")
    except Exception as e:
        print(f"[ERROR] Failed to load {CONFIG_FILE}: {e}")

# Beim Start einlesen
load_global_config()

FILE_LOCKS = defaultdict(threading.Lock)

app = FastAPI(title="VCP Tinder API")

# Ensure static directory exists
os.makedirs("static", exist_ok=True)

# Mount the static directory to serve HTML/JS/CSS
app.mount("/app", StaticFiles(directory="static", html=True), name="static")

# =====================================================================
# MODELS
# =====================================================================
class Annotation(BaseModel):
    start: int
    end: int
    pattern: str
    score: int

class AnnotationPayload(BaseModel):
    human_annotations: List[Annotation]
    ai_predictions: Optional[List[dict]] = []

# =====================================================================
# HELPER FUNCTIONS
# =====================================================================
def get_ticker_list():
    """Liest verfügbare Ticker aus EXTERNAL_PARQUET_DIR (F-UI-240)."""
    if not os.path.exists(EXTERNAL_PARQUET_DIR):
        print(f"[WARN] EXTERNAL_PARQUET_DIR does not exist: {EXTERNAL_PARQUET_DIR}")
        return []
    try:
        folders = [f.name for f in os.scandir(EXTERNAL_PARQUET_DIR) if f.is_dir()]
        return sorted(folders)
    except Exception as e:
        print(f"[ERROR] get_ticker_list failed: {e}")
        return []

def load_chart_data(ticker: str):
    """
    Liest 1D.parquet aus EXTERNAL_PARQUET_DIR und mappt Spalten auf das
    TradingView-kompatible Format (F-DATA-210, F-DATA-220).
    """
    filepath = os.path.join(EXTERNAL_PARQUET_DIR, ticker, "1D.parquet")
    if not os.path.exists(filepath):
        return None

    try:
        df = pd.read_parquet(filepath, columns=["timestamp", "open", "high", "low", "close", "volume"])

        # Column Mapping (F-DATA-220): TradingView erwartet time, open, high, low, close, value
        df = df.rename(columns={
            "timestamp": "time",
            "volume":    "value"
        })

        # NaN → None für JSON-Kompatibilität
        df = df.where(pd.notnull(df), None)

        # Nach Zeit sortieren und als Liste ausgeben
        df = df.sort_values("time")
        return df.to_dict(orient="records")

    except Exception as e:
        print(f"[ERROR] load_chart_data({ticker}): {e}")
        return None


def _insert_into_tree(tree: dict, parts: List[str], values: list):
    """Baut einen verschachtelten Dict-Baum anhand eines Pfad-Arrays auf."""
    current = tree
    for key in parts[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    current[parts[-1]] = values


def load_indicators(ticker: str) -> dict:
    """
    Liest indikator.parquet aus EXTERNAL_PARQUET_DIR und rekonstruiert
    den nested JSON-Baum, den das Frontend erwartet (F-DATA-215).
    Flat column name → nested tree: 'stock_ma_sma_50' → {'stock': {'ma': {'sma': {'50': [...]}}}}
    """
    filepath = os.path.join(EXTERNAL_PARQUET_DIR, ticker, "1D_features.parquet")
    if not os.path.exists(filepath):
        return {}

    try:
        df = pd.read_parquet(filepath)

        # NaN → None für JSON-Kompatibilität
        df = df.where(pd.notnull(df), None)

        result_tree: dict = {}
        for col in df.columns:
            # Zeitstempel-Spalte überspringen, gehört nicht in den Indikator-Baum
            if col in ("t", "timestamp", "ticker"):
                continue
            parts = col.split("_")
            values = df[col].tolist()
            _insert_into_tree(result_tree, parts, values)

        return result_tree

    except Exception as e:
        print(f"[ERROR] load_indicators({ticker}): {e}")
        return {}


def load_annotations(ticker: str):
    if not EXTERNAL_PARQUET_DIR:
        return {"human_annotations": [], "ai_predictions": []}
    filepath = os.path.join(EXTERNAL_PARQUET_DIR, ticker, ANNOTATION_FILE)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {"human_annotations": [], "ai_predictions": []}


def save_annotations(ticker: str, data: dict):
    if not EXTERNAL_PARQUET_DIR:
        return False
    ticker_anno_dir = os.path.join(EXTERNAL_PARQUET_DIR, ticker)
    os.makedirs(ticker_anno_dir, exist_ok=True)

    filepath = os.path.join(ticker_anno_dir, ANNOTATION_FILE)
    tmppath = filepath + ".tmp"

    with FILE_LOCKS[ticker]:
        try:
            with open(tmppath, 'w') as f:
                json.dump(data, f, indent=4)
            os.replace(tmppath, filepath)
            return True
        except Exception as e:
            print(f"[ERROR] saving annotations for {ticker}: {e}")
            if os.path.exists(tmppath):
                os.remove(tmppath)
            return False

# =====================================================================
# API ENDPOINTS
# =====================================================================
@app.get("/api/tickers")
async def api_get_tickers():
    return {"tickers": get_ticker_list()}

@app.get("/api/chart/{ticker}")
async def api_get_chart(ticker: str):
    data = load_chart_data(ticker)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Chart data for '{ticker}' not found.")
    return data

@app.get("/api/indicators/{ticker}")
async def api_get_indicators(ticker: str):
    return load_indicators(ticker)

@app.get("/api/annotations/{ticker}")
async def api_get_annotations(ticker: str):
    return load_annotations(ticker)

@app.post("/api/annotations/{ticker}")
async def api_post_annotations(ticker: str, payload: AnnotationPayload):
    data = payload.dict()
    success = save_annotations(ticker, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save annotations")
    return {"status": "success"}

@app.get("/api/watchlists")
async def api_get_watchlists():
    if not os.path.exists(WATCHLIST_DIR):
        return {"watchlists": []}
    files = [f for f in os.listdir(WATCHLIST_DIR) if f.endswith(".txt")]
    watchlists = [f.replace(".txt", "") for f in files]
    return {"watchlists": sorted(watchlists)}

@app.get("/api/feature_config")
async def api_feature_config():
    """
    Reads features.json from the data-node config directory and returns it as JSON (F-DATA-300).
    Replaces the deprecated /api/indicator_config endpoint.
    """
    if not FEATURE_CONFIG_PATH or not os.path.exists(FEATURE_CONFIG_PATH):
        print(f"[WARN] FEATURE_CONFIG_PATH does not exist: {FEATURE_CONFIG_PATH}")
        return {}
    try:
        with open(FEATURE_CONFIG_PATH, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] reading {FEATURE_CONFIG_PATH}: {e}")
        return {}

@app.get("/api/watchlist/{watchlist_name}")
async def api_get_watchlist_tickers(watchlist_name: str):
    filepath = os.path.join(WATCHLIST_DIR, f"{watchlist_name}.txt")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Watchlist not found")
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        tickers = [t.strip() for t in re.split(r'[;,\s]+', content) if t.strip()]
        unique_tickers = list(dict.fromkeys(tickers))
        return {"tickers": unique_tickers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing watchlist: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8051, reload=True)
