import os
import pandas as pd

MARKET_DIR = "./data/market_cache"
ticker_folders = [f.name for f in os.scandir(MARKET_DIR) if f.is_dir()]

for ticker in ticker_folders:
    json_path = os.path.join(MARKET_DIR, ticker, "1D.json")
    if not os.path.exists(json_path): continue
    df = pd.read_json(json_path)
    if df.empty: continue
    if "t" not in df.columns:
        print(f"Ticker {ticker} missing 't'. Columns: {df.columns.tolist()}, File length: {os.path.getsize(json_path)}")
