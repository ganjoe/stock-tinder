# IMP_requirements.md

## PART 1: The System Skeleton (Shared Context)

The system relies on a configuration file to resolve the path to the external parquet data. `server.py` will serve as a bridge, reading `.parquet` files directly via pandas and transforming them into the JSON structures expected by the frontend. The `preprocessor` script is deprecated and requires no modifications.

### Configuration Model
We define a local `config.json` file inside a `config/` directory. This is mandatory (F-SYS-205).
```json
{
    "EXTERNAL_PARQUET_DIR": "/home/daniel/stock-data-node/data/parquet"
}
```

### Shared Context / Imports
```python
import pandas as pd
import numpy as np
import json
import os
# ... existing imports ...
```

### Constants & Initialization
```python
# Skeleton for server.py initialization
CONFIG_FILE = "./config/config.json"
EXTERNAL_PARQUET_DIR = ""

def load_global_config():
    pass
```

---

## PART 2: Implementation Work Orders

**Task ID:** `T-REQ-010`
**Target File:** `config/config.json`
**Description:** Create the configuration file for the external Parquet directory path.
**Context:** Satisfies F-SYS-205.
**Code Stub (MANDATORY):**
```json
{
    "EXTERNAL_PARQUET_DIR": "/home/daniel/stock-data-node/data/parquet"
}
```
**Algo/Logic Steps:**
1. Create directory `config/` in the project root if it does not exist.
2. Create `config.json` with the exact JSON content provided above.
**Edge Cases:** None.

---

**Task ID:** `T-REQ-020`
**Target File:** `server.py`
**Description:** Implement configuration loading and update Ticker-Discovery.
**Context:** Satisfies F-SYS-205 and F-UI-240. Removes dependency on hardcoded `DATA_DIR` for tickers.
**Code Stub (MANDATORY):**
```python
CONFIG_FILE = "./config/config.json"
EXTERNAL_PARQUET_DIR = ""

def load_global_config():
    """Loads config.json and sets EXTERNAL_PARQUET_DIR."""
    global EXTERNAL_PARQUET_DIR
    pass

def get_ticker_list():
    """Reads available tickers from EXTERNAL_PARQUET_DIR."""
    pass
```
**Algo/Logic Steps:**
1. Define `load_global_config()` to check if `CONFIG_FILE` exists. 
2. If it exists, read it with `json.load()` and assign the value of `"EXTERNAL_PARQUET_DIR"` to the global variable `EXTERNAL_PARQUET_DIR`. Provide a fallback (e.g. `./data`) if the file or key fails.
3. Call `load_global_config()` directly after the imports / constant declarations to initialize the global variable on server startup.
4. Update `get_ticker_list()`: Read subdirectories inside `EXTERNAL_PARQUET_DIR` using `os.scandir`. Ensure only directories are returned. Return as a sorted list.
**Edge Cases:**
- `config.json` is missing -> Assign a safe default or log an error.
- `EXTERNAL_PARQUET_DIR` does not exist during `get_ticker_list` -> catch exception and return empty list `[]`.

---

**Task ID:** `T-REQ-030`
**Target File:** `server.py`
**Description:** Update `load_chart_data` to read `1D.parquet` instead of `1D.json`.
**Context:** Satisfies F-DATA-210 and F-DATA-220. Uses Pandas to load parquet.
**Code Stub (MANDATORY):**
```python
def load_chart_data(ticker: str):
    """
    Reads 1D.parquet from EXTERNAL_PARQUET_DIR and maps columns.
    Expected TradingView list of dicts.
    """
    pass
```
**Algo/Logic Steps:**
1. Construct path: `os.path.join(EXTERNAL_PARQUET_DIR, ticker, "1D.parquet")`.
2. Check if file exists. If not, return `None`.
3. Read the parquet file using `pd.read_parquet(filepath, columns=["timestamp", "open", "high", "low", "close", "volume"])`.
4. Perform Column Mapping (F-DATA-220): Rename the DataFrame columns to match TradingView format: `{"timestamp": "time", "volume": "value"}`.
5. Replace any NaN values in the dataframe with `None` (using `df.replace({np.nan: None})`) so it serializes properly to JSON `null`.
6. Convert DataFrame to a list of dictionaries using `df.to_dict(orient="records")`.
7. Return the resulting list.
**Edge Cases:**
- File reading fails or a required column is missing. Wrap in `try/except Exception as e` and return `None` upon error.

---

**Task ID:** `T-REQ-040`
**Target File:** `server.py`
**Description:** Update `api_get_indicators` to read `indikator.parquet` and convert to the nested JSON object format.
**Context:** Satisfies F-DATA-215. The Parquet file is flat (columns like `stock_ma_sma_50`), but the UI expects a nested JSON tree (e.g. `{"stock": {"ma": {"sma": {"50": [...]}}}}`).
**Code Stub (MANDATORY):**
```python
@app.get("/api/indicators/{ticker}")
async def api_get_indicators(ticker: str):
    """
    Reads indikator.parquet from EXTERNAL_PARQUET_DIR, replaces NaNs,
    and reconstrucs the nested JSON tree structure.
    """
    pass
```
**Algo/Logic Steps:**
1. Construct path: `os.path.join(EXTERNAL_PARQUET_DIR, ticker, "indikator.parquet")`.
2. Check if file exists. If not, return `{}`.
3. Read parquet file using `pd.read_parquet(filepath)`.
4. Replace all NaN values with `None` via `df.replace({np.nan: None})` to ensure compliant JSON interpolation.
5. Create an empty dictionary `result_tree = {}`.
6. For each column name in the DataFrame (e.g., `"stock_ma_sma_50"`):
   - Extract the column values as a standard Python list: `col_list = df[col].tolist()`.
   - Split the column name by `_` to get the path parts: `parts = col.split('_')`.
   - Traverse `result_tree` using these parts to build nested dictionaries automatically.
   - For the final part (leaf node), assign the `col_list`.
7. Return `result_tree`.
**Edge Cases:**
- Missing file -> Return `{}`.
- Corrupt parquet file -> Catch exception, print error, and return `{}`.
