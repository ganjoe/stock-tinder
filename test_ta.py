import pandas as pd
import pandas_ta as ta

df = pd.DataFrame({
    'h': [10]*20,
    'l': [5]*20,
    'c': [7]*20
})
try:
    res = ta.stoch(high=df["h"], low=df["l"], close=df["c"], k=14, d=1, smooth_k=3)
    print(res)
except Exception as e:
    print("Error:", e)
