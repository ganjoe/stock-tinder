import os
import pandas as pd
import pandas_ta as ta

MARKET_DIR = "./data/market_cache"
INDICATOR_CONFIG = [
    {"path": ["stock", "stoch", "10", "1"], "type": "stoch_k", "kwargs": {"k": 10, "d": 1, "smooth_k": 1}},
]

def process_all():
    ticker_folders = [f.name for f in os.scandir(MARKET_DIR) if f.is_dir()]
    for ticker in ticker_folders:
        json_path = os.path.join(MARKET_DIR, ticker, "1D.json")
        if not os.path.exists(json_path): continue
        df = pd.read_json(json_path)
        if df.empty: continue
        try:
            ta.stoch(high=df["h"], low=df["l"], close=df["c"], k=10, d=1, smooth_k=1)
        except Exception as e:
            print(f"Failed on {ticker}: {e}")

if __name__ == "__main__":
    process_all()
