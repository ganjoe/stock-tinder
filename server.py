from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import json
import glob
import pandas as pd
import threading
from collections import defaultdict

# =====================================================================
# CONFIGURATION
# =====================================================================
DATA_DIR = "./data/market_cache" 
ANNO_DIR = "./data/anno"
DATA_FILE = "1D.json"
ANNOTATION_FILE = "annotations.json"

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
    if not os.path.exists(DATA_DIR):
        return []
    folders = [f.name for f in os.scandir(DATA_DIR) if f.is_dir()]
    return sorted(folders)

def load_chart_data(ticker: str):
    filepath = os.path.join(DATA_DIR, ticker, DATA_FILE)
    if not os.path.exists(filepath):
        return None
        
    try:
        # We just need to read the JSON and format it for TradingView
        # TradingView expects: time (YYYY-MM-DD or unix timestamp), open, high, low, close, value (for volume)
        with open(filepath, 'r') as f:
            data = json.load(f)
            
        if not data: return []
        
        tv_data = []
        for row in data:
            # Map old/new keys
            t = row.get('t') or row.get('date')
            o = row.get('o') or row.get('open')
            h = row.get('h') or row.get('high')
            l = row.get('l') or row.get('low')
            c = row.get('c') or row.get('close')
            v = row.get('v') or row.get('volume')
            
            if t and o and h and l and c:
                # TradingView expects time in seconds if it's a number, or YYYY-MM-DD string
                # Data here is often unix timestamp in seconds
                tv_data.append({
                    "time": t,
                    "open": float(o),
                    "high": float(h),
                    "low": float(l),
                    "close": float(c),
                    "value": float(v) if v else 0.0 # 'value' is used by TradingView for histogram/volume
                })
        
        # Sort by time just in case
        tv_data.sort(key=lambda x: x["time"])
        return tv_data
    except Exception as e:
        print(f"Error loading data for {ticker}: {e}")
        return None

def load_annotations(ticker: str):
    filepath = os.path.join(ANNO_DIR, ticker, ANNOTATION_FILE)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {"human_annotations": [], "ai_predictions": []}

def save_annotations(ticker: str, data: dict):
    ticker_anno_dir = os.path.join(ANNO_DIR, ticker)
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
            print(f"ERROR saving {ticker}: {e}")
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
        raise HTTPException(status_code=404, detail="Ticker not found")
    return data

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8051, reload=True)
