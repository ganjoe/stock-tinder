# IMP_preprocessor.md

## PART 1: The System Skeleton (Shared Context)

The `preprocessor` architecture is built on an Open-Closed Principle using `INDICATOR_CONFIG`. The engine processes raw `1D.json` data and outputs exactly two elements per indicator: a `gui_val` (for the JSON frontend) and an `ml_val` (for the Parquet ML model). 

The new requirements strictly define that indicator names with a `_pct` suffix must output percentages for **both** GUI and ML, `_dist` outputs absolute for GUI and percentages for ML, and ones without suffix output absolute values for **both**.

### Config Structure & Recipe Book Examples
The `INDICATOR_CONFIG` must be updated to serve as a complete example for all configured indicator requirements (F-PRE-070 to F-PRE-140):

```python
INDICATOR_CONFIG = [
    # F-PRE-070: MA DIST
    {"path": ["stock", "ma", "sma", "50"], "type": "sma_dist", "kwargs": {"length": 50}},
    {"path": ["stock", "ma", "ema", "50"], "type": "ema_dist", "kwargs": {"length": 50}},
    
    # F-PRE-080 & F-PRE-140: MA PRICE (Raw Prices excluded from ML)
    {"path": ["stock", "ma", "sma_price", "50"], "type": "sma_price", "kwargs": {"length": 50}, "exclude_ml": True},
    {"path": ["stock", "ma", "ema_price", "50"], "type": "ema_price", "kwargs": {"length": 50}, "exclude_ml": True},

    # F-PRE-090: OSCILLATOR
    {"path": ["stock", "stoch", "10", "1"], "type": "stoch_k", "kwargs": {"k": 10, "d": 1, "smooth_k": 1}},
    
    # F-PRE-100: VOLA PCT
    {"path": ["stock", "adr_pct"], "type": "adr_pct", "kwargs": {"length": 20}},
    {"path": ["stock", "atr_pct"], "type": "atr_pct", "kwargs": {"length": 14}},

    # F-PRE-110: VOLA ABSOLUTE
    {"path": ["stock", "adr"], "type": "adr", "kwargs": {"length": 20}},
    {"path": ["stock", "atr"], "type": "atr", "kwargs": {"length": 14}},
    
    # F-PRE-120 & F-PRE-130: VOLUME
    {"path": ["volume", "ma", "50"], "type": "vol_ma", "kwargs": {"length": 50}},
    {"path": ["volume", "ratio", "50"], "type": "vol_ratio", "kwargs": {"length": 50}}
]
```

## PART 2: Implementation Work Orders

**Task ID:** `T-PRE-010`
**Target File:** `preprocessor`
**Description:** Expand the indicator dispatching logic in `calculate_feature` to strictly adhere to absolute vs. percentage outputs for both `gui_val` and `ml_val`.

**Code Stub:**
```python
def calculate_feature(df, config_item):
    """
    Returns (gui_series, ml_series)
    """
    ind_type = config_item["type"]
    kwargs = config_item["kwargs"]
    
    # TODO: Implement all logic branches ensuring absolute vs percentage outputs are correct.
```

**Algo/Logic Steps:**
1. **MAs (_dist)**: `sma_dist`/`ema_dist` -> `gui_val` = absolute MA price, `ml_val` = `(close - ma) / ma`
2. **MAs (_price)**: `sma_price`/`ema_price` -> `gui_val` = absolute MA price, `ml_val` = absolute MA price.
3. **Stochastik**: `stoch_k` -> `gui_val` = classic (0-100), `ml_val` = normalized (0.0-1.0). (Handle exceptions returning NaNs as before).
4. **Vola (%):** `adr_pct` -> Calculate `(high - low) / close`. `gui_val` & `ml_val` = `ta.sma` of this percentage. `atr_pct` -> Calculate ATR. `gui_val` & `ml_val` = `atr / close`.
5. **Vola (Abs)**: `adr` -> Calculate `high - low`. `gui_val` & `ml_val` = `ta.sma` of this absolute dollar range. `atr` -> Calculate ATR. `gui_val` & `ml_val` = absolute ATR in dollars.
6. **Volume (Ratio)**: `vol_ratio` -> `gui_val` & `ml_val` = `df["v"] / ta.sma(df["v"])`.
7. **Volume (MA)**: `vol_ma` -> `gui_val` & `ml_val` = `ta.sma(df["v"])`.

---

**Task ID:** `T-PRE-020`
**Target File:** `preprocessor`
**Description:** Implement the `exclude_ml` configuration flag so non-stationary indicators aren't embedded in the Parquet dataset but are still built for the GUI.

**Code Stub:**
```python
def process_all_tickers():
    # ... inside INDICATOR_CONFIG loop ...
    gui_series, ml_series = calculate_feature(df, config_item)
    
    insert_into_tree(json_tree, config_item["path"], gui_series)
    
    # TODO: Only insert into Parquet if exclude_ml is False
```

**Algo/Logic Steps:**
1. In the `INDICATOR_CONFIG` iteration within `process_all_tickers`, immediately after `insert_into_tree`.
2. Check `config_item.get("exclude_ml", False)`.
3. If it is `False` (or missing), append the `ml_series` to `parquet_flat_df` using the flattened path name.
4. If it is `True`, simply skip the Parquet appending step for this specific indicator.
5. In the final print statement, `len(final_parquet_df.columns) - 2` accurately reflects the filtered count of ML features.
