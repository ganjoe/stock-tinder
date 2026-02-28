import os
import json
import numpy as np
import uuid

# =====================================================================
# KONFIGURATION & KONSTANTEN
# =====================================================================
MARKET_DIR = "./data/market_cache"
ANNO_DIR = "./data/anno"

NUM_SAMPLES_PER_CLASS = 100
SECONDS_PER_DAY = 86400

def ensure_dirs(ticker):
    market_path = os.path.join(MARKET_DIR, ticker)
    anno_path = os.path.join(ANNO_DIR, ticker)
    os.makedirs(market_path, exist_ok=True)
    os.makedirs(anno_path, exist_ok=True)
    return market_path, anno_path

def build_ohlcv(base_curve, volatility, volume_curve, start_ts):
    data = []
    current_ts = start_ts
    for i in range(len(base_curve)):
        c = base_curve[i]
        vol = volatility[i] if isinstance(volatility, (list, np.ndarray)) else volatility
        
        noise_h = abs(np.random.normal(0, vol * 0.2))
        noise_l = abs(np.random.normal(0, vol * 0.2))
        
        o = c + np.random.normal(0, vol * 0.1)
        h = max(o, c) + noise_h + (vol / 2)
        l = min(o, c) - noise_l - (vol / 2)
        v = volume_curve[i] * np.random.uniform(0.7, 1.3) # 30% Volumen-Rauschen
        
        data.append({
            "t": int(current_ts),
            "o": round(float(o), 2),
            "h": round(float(h), 2),
            "l": round(float(l), 2),
            "c": round(float(c), 2),
            "v": float(round(v, 0))
        })
        current_ts += SECONDS_PER_DAY
    return data

# =====================================================================
# DYNAMISCHE MUSTER GENERATOREN (Makro-Varianz)
# =====================================================================
def create_synthetic_vcp():
    """Erzeugt ein VCP mit stark variierenden Längen, Preisen und Amplituden."""
    # Zufälliger 8-stelliger Hash für den Ordnernamen (Merge-Fähigkeit)
    uid = uuid.uuid4().hex[:8]
    ticker = f"SYN_VCP_{uid}"
    market_path, anno_path = ensure_dirs(ticker)
    
    # Auswürfeln der Makro-Varianz
    start_ts = int(np.random.uniform(1500000000, 1700000000)) # Zufälliges Startdatum
    start_price = np.random.uniform(20.0, 300.0) # Aktie kostet zwischen 20$ und 300$
    
    run_up_days = int(np.random.uniform(60, 150))
    base_days = int(np.random.uniform(40, 120))
    breakout_days = int(np.random.uniform(10, 40))
    
    amplitude = start_price * np.random.uniform(0.1, 0.3) # 10% bis 30% Schwankung in der Base
    
    # 1. Trend
    run_up = np.linspace(start_price, start_price * np.random.uniform(1.3, 2.0), run_up_days)
    vol_run_up = np.full(run_up_days, start_price * 0.03)
    volm_run_up = np.full(run_up_days, np.random.uniform(500000, 2000000))
    
    # 2. VCP Base (Gedämpft)
    x = np.linspace(0, np.random.uniform(3, 5) * np.pi, base_days)
    damping = np.linspace(1.0, np.random.uniform(0.05, 0.2), base_days) 
    base_curve = run_up[-1] + (amplitude * np.sin(x) * damping)
    
    vol_base = (start_price * 0.05) * damping 
    volm_base = np.linspace(volm_run_up[-1], volm_run_up[-1] * np.random.uniform(0.1, 0.3), base_days)
    
    # 3. Breakout
    breakout = np.linspace(base_curve[-1], base_curve[-1] * 1.2, breakout_days)
    vol_breakout = np.full(breakout_days, start_price * 0.04)
    volm_breakout = np.full(breakout_days, volm_base[-1] * np.random.uniform(3.0, 6.0))
    
    # Zusammenbauen
    full_curve = np.concatenate([run_up, base_curve, breakout])
    full_vol = np.concatenate([vol_run_up, vol_base, vol_breakout])
    full_volume = np.concatenate([volm_run_up, volm_base, volm_breakout])
    
    ohlcv = build_ohlcv(full_curve, full_vol, full_volume, start_ts)
    
    # Speichern
    with open(os.path.join(market_path, "1D.json"), "w") as f:
        json.dump(ohlcv, f)
        
    annotations = {
        "human_annotations": [{
            "start": ohlcv[run_up_days]["t"],
            "end": ohlcv[run_up_days + base_days - 1]["t"],
            "pattern": "vcp",
            "score": 6
        }],
        "ai_predictions": []
    }
    with open(os.path.join(anno_path, "annotations.json"), "w") as f:
        json.dump(annotations, f, indent=4)

def create_synthetic_anti():
    """Erzeugt ein Megaphone-Muster mit zufälliger Varianz."""
    uid = uuid.uuid4().hex[:8]
    ticker = f"SYN_ANTI_{uid}"
    market_path, anno_path = ensure_dirs(ticker)
    
    start_ts = int(np.random.uniform(1500000000, 1700000000))
    start_price = np.random.uniform(20.0, 300.0)
    
    run_up_days = int(np.random.uniform(60, 150))
    base_days = int(np.random.uniform(40, 120))
    breakout_days = int(np.random.uniform(10, 40))
    
    amplitude = start_price * np.random.uniform(0.05, 0.15)
    
    run_up = np.linspace(start_price, start_price * np.random.uniform(1.3, 2.0), run_up_days)
    vol_run_up = np.full(run_up_days, start_price * 0.03)
    volm_run_up = np.full(run_up_days, np.random.uniform(500000, 2000000))
    
    # Megaphone (Verstärkt)
    x = np.linspace(0, np.random.uniform(3, 5) * np.pi, base_days)
    amplification = np.linspace(0.2, np.random.uniform(1.5, 2.5), base_days)
    base_curve = run_up[-1] + (amplitude * np.sin(x) * amplification)
    
    vol_base = (start_price * 0.03) * amplification
    volm_base = np.linspace(volm_run_up[-1] * 0.5, volm_run_up[-1] * 2.0, base_days)
    
    breakout = np.linspace(base_curve[-1], base_curve[-1] * 0.7, breakout_days) # Crash
    vol_breakout = np.full(breakout_days, start_price * 0.08)
    volm_breakout = np.full(breakout_days, volm_base[-1] * 2.0)
    
    full_curve = np.concatenate([run_up, base_curve, breakout])
    full_vol = np.concatenate([vol_run_up, vol_base, vol_breakout])
    full_volume = np.concatenate([volm_run_up, volm_base, volm_breakout])
    
    ohlcv = build_ohlcv(full_curve, full_vol, full_volume, start_ts)
    
    with open(os.path.join(market_path, "1D.json"), "w") as f:
        json.dump(ohlcv, f)
        
    annotations = {
        "human_annotations": [{
            "start": ohlcv[run_up_days]["t"],
            "end": ohlcv[run_up_days + base_days - 1]["t"],
            "pattern": "vcp",
            "score": 1
        }],
        "ai_predictions": []
    }
    with open(os.path.join(anno_path, "annotations.json"), "w") as f:
        json.dump(annotations, f, indent=4)

if __name__ == "__main__":
    print(f"Generiere {NUM_SAMPLES_PER_CLASS * 2} hoch-variable Ticker...")
    for _ in range(NUM_SAMPLES_PER_CLASS):
        create_synthetic_vcp()
        create_synthetic_anti()
    print("✅ Fertig! Du kannst das Skript beliebig oft starten, um weitere Ticker hinzuzufügen (Merge).")