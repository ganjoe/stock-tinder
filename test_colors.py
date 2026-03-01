import json

colors = {
    "aliases": {
        "blue": "#0000FF",
        "red": "#FF0000",
        "green": "#00FF00",
        "yellow": "#FFFF00",
        "orange": "#FFA500",
        "purple": "#800080",
        "cyan": "#00FFFF",
        "magenta": "#FF00FF",
        "white": "#FFFFFF",
        "black": "#000000",
        "gray": "#808080"
    },
    "indicators": {
        "ma_sma_10": {"color": "blue", "thickness": 2, "style": "solid"},
        "ma_sma_20": {"color": "cyan", "thickness": 2, "style": "dotted"},
        "ma_sma_50": {"color": "orange", "thickness": 3, "style": "solid"},
        "adr%": {"color": "purple", "thickness": 1, "style": "dashed"}
    }
}

with open("./data/indikator_colors.json", "w") as f:
    json.dump(colors, f, indent=4)
