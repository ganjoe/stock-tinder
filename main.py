import dash
from dash import dcc, html, dash_table, Input, Output, State, ctx
import dash_bootstrap_components as dbc
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
import json
import os
import glob
from datetime import datetime
import numpy as np
import threading
from collections import defaultdict

# =====================================================================
# KONFIGURATION & KONSTANTEN (Hier Parameter anpassen)
# =====================================================================

# Globaler Lock-Pool für Dateizugriffe (verhindert Race Conditions auf Mobile)
FILE_LOCKS = defaultdict(threading.Lock)

# Basis-Verzeichnis für deine Ticker-Daten
DATA_DIR = "./data/market_cache" # Für Produktivbetrieb ändern auf "/data/market_cache"

# Dateinamen-Konventionen
DATA_FILE = "1D.json"
ANNOTATION_FILE = "annotations.json"

# Farben für die Visualisierung (Vrects im Chart)
COLOR_HUMAN = "rgba(0, 255, 0, 0.2)" # Halbtransparentes Grün
COLOR_BOT = "rgba(0, 0, 255, 0.2)"   # Halbtransparentes Blau

# Standard-Pattern-Name für die Labels
PATTERN_NAME = "vcp"

# =====================================================================
# HILFSFUNKTIONEN (Dateisystem & Dummy-Daten)
# =====================================================================

def ensure_dummy_data():
    """Erzeugt einen Dummy-Datensatz, falls das Verzeichnis komplett leer ist."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    ticker_dirs = glob.glob(os.path.join(DATA_DIR, "*"))
    if not ticker_dirs:
        print("INFO: Kein Ticker gefunden. Erzeuge Dummy-Daten für 'AAPL_TEST'...")
        test_dir = os.path.join(DATA_DIR, "AAPL_TEST")
        os.makedirs(test_dir)
        
        # Generiere 100 Tage Fake-Börsendaten
        dates = pd.date_range(end=datetime.today(), periods=100).strftime('%Y-%m-%d').tolist()
        df = pd.DataFrame({
            "date": dates,
            "open": np.linspace(100, 150, 100) + np.random.normal(0, 2, 100),
            "high": np.linspace(100, 150, 100) + np.random.normal(0, 2, 100) + 2,
            "low": np.linspace(100, 150, 100) + np.random.normal(0, 2, 100) - 2,
            "close": np.linspace(100, 150, 100) + np.random.normal(0, 2, 100),
            "volume": np.random.randint(1000000, 5000000, 100)
        })
        # Speichere 1D.json
        df.to_json(os.path.join(test_dir, DATA_FILE), orient="records")
        print("INFO: Dummy-Daten erzeugt. Du kannst jetzt testen!")

def get_ticker_list():
    """Liest alle Unterordner im Datenverzeichnis aus (alphabetisch sortiert)."""
    ensure_dummy_data()
    folders = [f.name for f in os.scandir(DATA_DIR) if f.is_dir()]
    return sorted(folders)

def load_annotations(ticker):
    """Lädt die annotations.json oder erzeugt das saubere JSON-Schema (F-DAT-010)."""
    filepath = os.path.join(DATA_DIR, ticker, ANNOTATION_FILE)
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {"human_annotations": [], "ai_predictions": []}

def save_annotations(ticker, data):
    """Speichert Annotationen atomar und threadsicher auf die Festplatte (F-DAT-030)."""
    # Validierung: Stelle sicher, dass wir ein Dictionary mit den erwarteten Keys haben
    if not isinstance(data, dict) or "human_annotations" not in data:
        print(f"ERROR: Ungültige Datenstruktur für {ticker} Annotationen. Abbruch.")
        return

    # Zusätzliche Validierung der Einträge
    valid_annotations = []
    for ann in data.get("human_annotations", []):
        # Nur Einträge mit validem Start/End Datum und Score speichern
        if all(k in ann for k in ["start", "end", "score", "pattern"]):
            if ann["start"] and ann["end"] and str(ann["start"]) != "None":
                valid_annotations.append(ann)
    
    data["human_annotations"] = valid_annotations

    filepath = os.path.join(DATA_DIR, ticker, ANNOTATION_FILE)
    tmppath = filepath + ".tmp"
    
    # Nutze Lock für diesen speziellen Ticker
    with FILE_LOCKS[ticker]:
        try:
            # Schreibe zuerst in eine temporäre Datei
            with open(tmppath, 'w') as f:
                json.dump(data, f, indent=4)
            
            # Atomares Ersetzen (verhindert korrupte Dateien bei Absturz/Abbruch)
            os.replace(tmppath, filepath)
        except Exception as e:
            print(f"ERROR beim Speichern von {ticker}: {e}")
            if os.path.exists(tmppath):
                try:
                    os.remove(tmppath)
                except:
                    pass

def load_chart_data(ticker):
    """Lädt die OHLCV Daten für den Chart."""
    filepath = os.path.join(DATA_DIR, ticker, DATA_FILE)
    if os.path.exists(filepath):
        return pd.read_json(filepath, orient="records")
    return pd.DataFrame()

# =====================================================================
# DASH APP INITIALISIERUNG & LAYOUT
# =====================================================================

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])
app.title = "VCP Tinder"

# Das responsive Layout (F-GUI-020)
app.layout = dbc.Container([
    # Header (Slimmed down for Mobile)
    dbc.Row([
        dbc.Col(html.H6(id="current-ticker-display", className="text-center text-primary"), width=12),
    ], className="mt-2 mb-2"),

    # Chart Bereich (F-GUI-010)
    dbc.Row([
        dbc.Col(
            dcc.Graph(
                id="candlestick-chart", 
                style={"height": "60vh"}, # Fixierte Höhe, damit es nicht vom Bildschirm rutscht
                config={
                    'scrollZoom': True,           # Erlaubt Pinch-to-Zoom
                    'displayModeBar': False,      # Versteckt die Plotly-Menüleiste (F-UX-050)
                    'displaylogo': False          # Entfernt das Plotly-Logo
                }
            ), 
            width=12
        )
    ]),

    # Interaktions-Bereich (Nav + Score Buttons + Toggle)
    dbc.Row([
        dbc.Col([
            dbc.ButtonGroup([
                dbc.Button("◄ Prev", id="btn-prev", color="secondary", size="sm", className="m-1"),
                dbc.Button("Next ►", id="btn-next", color="primary", size="sm", className="m-1"),
                *[dbc.Button(f"{i}", id=f"btn-score-{i}", color="success", size="sm", className="m-1") for i in range(1, 7)]
            ])
        ], xs=12, md=8),
        dbc.Col([
            # Toggle zwischen Zoom und Pan (F-UX-060)
            dbc.RadioItems(
                id="dragmode-toggle",
                options=[
                    {"label": "🔍 Zoom", "value": "zoom"},
                    {"label": "✋ Pan", "value": "pan"},
                ],
                value="pan", # Pan als Standard für einfaches Wischen
                inline=True,
                style={"fontSize": "small", "display": "inline-block"}
            ),
            # Autoscale Checkbox (F-UX-080)
            dbc.Checklist(
                id="autoscale-toggle",
                options=[{"label": "📐 Auto", "value": "auto"}],
                value=["auto"],
                inline=True,
                style={"fontSize": "small", "display": "inline-block", "marginLeft": "10px"}
            ),
        ], xs=6, md=2, className="text-start"),
        dbc.Col([
            # Toggle zwischen Human und Bot (F-UX-040)
            dbc.RadioItems(
                id="view-toggle",
                options=[
                    {"label": "Human", "value": "human"},
                    {"label": "Bot", "value": "bot"},
                ],
                value="human",
                inline=True,
                style={"fontSize": "small"}
            ),
        ], xs=6, md=2, className="text-end")
    ], className="mt-2 mb-2"),

    # Staging Tabelle Bereich (F-GUI-030 & F-UX-030)
    dbc.Row([
        dbc.Col(
            html.Div([
                dash_table.DataTable(
                    id='annotations-table',
                    columns=[
                        {'name': 'Start Date', 'id': 'start', 'editable': False},
                        {'name': 'End Date', 'id': 'end', 'editable': False},
                        {'name': 'Pattern', 'id': 'pattern', 'editable': False},
                        {'name': 'Score (1-6)', 'id': 'score', 'editable': True, 'type': 'numeric'}
                    ],
                    data=[],
                    editable=True,
                    row_deletable=True, # Erlaubt das Löschen von Einträgen
                    style_cell={
                        'textAlign': 'center', 
                        'fontSize': '0.75rem', # Kleinere Schrift für mobile Datendichte
                        'padding': '2px'
                    },
                    style_header={
                        'backgroundColor': 'lightgrey', 
                        'fontWeight': 'bold', 
                        'fontSize': '0.875rem' # Passend zur Größe der kleinen Buttons
                    },
                )
            ], style={'maxHeight': '300px', 'overflowY': 'scroll', 'border': '1px solid #ddd'}), # Scrollbarer Container
            width=12
        )
    ]),

    # Versteckte State-Stores für die App-Logik
    dcc.Store(id="ticker-list", data=get_ticker_list()),
    dcc.Store(id="current-index", data=0)

], fluid=True)

# =====================================================================
# CALLBACKS (App-Logik)
# =====================================================================

@app.callback(
    [Output("current-index", "data"),
     Output("current-ticker-display", "children"),
     Output("candlestick-chart", "figure"),
     Output("annotations-table", "data")],
    [Input("btn-prev", "n_clicks"),
     Input("btn-next", "n_clicks"),
     Input("btn-score-1", "n_clicks"),
     Input("btn-score-2", "n_clicks"),
     Input("btn-score-3", "n_clicks"),
     Input("btn-score-4", "n_clicks"),
     Input("btn-score-5", "n_clicks"),
     Input("btn-score-6", "n_clicks"),
     Input("annotations-table", "data_timestamp"), # Feuert, wenn Tabelle editiert/gelöscht wird
     Input("view-toggle", "value"),
     Input("dragmode-toggle", "value"),
     Input("autoscale-toggle", "value"),
     Input("candlestick-chart", "relayoutData")], # Erlaubt Live-Update beim Zoomen/Pannen
    [State("current-index", "data"),
     State("ticker-list", "data"),
     State("annotations-table", "data"),
     State("candlestick-chart", "figure")] # Vorherige Figure für State-Erhaltung
)
def main_logic(btn_prev, btn_next, b1, b2, b3, b4, b5, b6, table_timestamp, view_toggle, dragmode_toggle, autoscale_toggle, relayout_data, current_idx, ticker_list, table_data, prev_figure):
    """
    Diese zentrale Funktion steuert alles: Ticker-Wechsel, Speichern von Scores, Chart-Rendering.
    """
    if not ticker_list:
        return current_idx, "NO DATA", go.Figure(), []

    # 1. Welches Event hat den Callback ausgelöst?
    trigger_id = ctx.triggered_id if ctx.triggered_id else 'No clicks yet'
    
    # Navigation Logik
    if trigger_id == "btn-next":
        current_idx = (current_idx + 1) % len(ticker_list)
        relayout_data = None # Verhindert, dass alter Zoom auf neuen Ticker angewendet wird
    elif trigger_id == "btn-prev":
        current_idx = (current_idx - 1) % len(ticker_list)
        relayout_data = None # Verhindert, dass alter Zoom auf neuen Ticker angewendet wird
        
    current_ticker = ticker_list[current_idx]
    
    # Daten für den aktuellen Ticker laden
    df = load_chart_data(current_ticker)
    annotations = load_annotations(current_ticker)

    # Viewport-Bestimmung (Immer ausführen für Autoscale & Annotationen)
    if relayout_data and 'xaxis.range[0]' in relayout_data:
        try:
            start_val = relayout_data['xaxis.range[0]']
            end_val = relayout_data['xaxis.range[1]']
            start_date = str(start_val).split(" ")[0]
            end_date = str(end_val).split(" ")[0]
        except (KeyError, IndexError, TypeError):
            start_date = df['date'].iloc[0] if not df.empty else None
            end_date = df['date'].iloc[-1] if not df.empty else None
    else:
        start_date = df['date'].iloc[0] if not df.empty else None
        end_date = df['date'].iloc[-1] if not df.empty else None
    
    # 2. Score Button geklickt? -> Neuen Bereich erfassen
    if trigger_id and trigger_id.startswith("btn-score-") and start_date and end_date:
        score = int(trigger_id.split("-")[-1])
            
        # Neues Label generieren und an Human Annotations anhängen
        new_label = {
            "pattern": PATTERN_NAME,
            "start": start_date,
            "end": end_date,
            "score": score
        }
        annotations["human_annotations"].append(new_label)
        save_annotations(current_ticker, annotations) # Sofort speichern
        
    # 3. Tabelle manuell bearbeitet oder Zeile gelöscht?
    elif trigger_id == "annotations-table":
        # Wenn wir im Human-Modus sind, syncen wir die Tabelle mit der JSON auf Festplatte (F-DAT-020)
        if view_toggle == "human":
            annotations["human_annotations"] = table_data
            save_annotations(current_ticker, annotations)

    # 4. Chart zeichnen (Plotly)
    fig = make_subplots(rows=2, cols=1, shared_xaxes=True, 
                        vertical_spacing=0.03, row_heights=[0.8, 0.2])

    if not df.empty:
        # Candlesticks
        fig.add_trace(go.Candlestick(x=df['date'], open=df['open'], high=df['high'], 
                                     low=df['low'], close=df['close'], name="OHLC"), row=1, col=1)
        # Volumen
        fig.add_trace(go.Bar(x=df['date'], y=df['volume'], marker_color='gray', name="Volume"), row=2, col=1)
        
        # Rangeslider entfernen, verbraucht nur Platz, Legende ausblenden für Mobile
        # Dragmode (Zoom/Pan) setzen, Zoom/Pan auf X-Achse einschränken (F-UX-070)
        autoscale_on = "auto" in autoscale_toggle
        
        y_range = None
        y2_range = None
        if autoscale_on and not df.empty and start_date and end_date:
            # Manuelle Autoscale-Berechnung für den sichtbaren Bereich
            # Wir filtern die Daten basierend auf dem aktuellen X-Viewport
            visible_df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
            if not visible_df.empty:
                y_min = visible_df['low'].min()
                y_max = visible_df['high'].max()
                padding = (y_max - y_min) * 0.1 # 10% Padding oben/unten
                y_range = [y_min - padding, y_max + padding]
                
                # Volumen anpassen
                y2_max = visible_df['volume'].max()
                y2_range = [0, y2_max * 1.1]

        elif not autoscale_on and prev_figure and 'layout' in prev_figure and trigger_id not in ["btn-next", "btn-prev", "No clicks yet"]:
            # Fallback auf den vorherigen Y-Range, um ein Verschwinden/Reset zu verhindern
            if 'yaxis' in prev_figure['layout']:
                y_range = prev_figure['layout']['yaxis'].get('range')
            if 'yaxis2' in prev_figure['layout']:
                y2_range = prev_figure['layout']['yaxis2'].get('range')

        fig.update_layout(
            showlegend=False, 
            xaxis_rangeslider_visible=False, 
            margin=dict(l=20, r=20, t=30, b=20),
            dragmode=dragmode_toggle,
            uirevision=current_ticker, # Wichtig: Verhindert Reset beim Update
            yaxis_fixedrange=True,
            yaxis2_fixedrange=True,
        )

        if y_range:
            fig.update_layout(yaxis_range=y_range, yaxis_autorange=False)
        else:
            fig.update_layout(yaxis_autorange=True)
            
        if y2_range:
            fig.update_layout(yaxis2_range=y2_range, yaxis2_autorange=False)
        else:
            fig.update_layout(yaxis2_autorange=True)
        
        # 5. Annotation Highlights in den Chart zeichnen (F-VIS-010)
        target_list = "human_annotations" if view_toggle == "human" else "ai_predictions"
        rect_color = COLOR_HUMAN if view_toggle == "human" else COLOR_BOT
        
        for ann in annotations[target_list]:
            fig.add_vrect(
                x0=ann['start'], x1=ann['end'],
                fillcolor=rect_color, opacity=1,
                layer="below", line_width=1, line_color="black",
                row="all", col=1
            )

    # 6. Tabellen-Daten für die GUI aufbereiten
    display_table_data = annotations["human_annotations"] if view_toggle == "human" else annotations["ai_predictions"]

    return current_idx, f"Ticker: {current_ticker}", fig, display_table_data

# =====================================================================
# SERVER START
# =====================================================================
if __name__ == '__main__':
    # Debug-Modus über Umgebungsvariable steuerbar (Standard: True für lokale Entwicklung)
    # Im Dockerfile ist DASH_DEBUG_MODE=False gesetzt.
    debug_mode = os.environ.get('DASH_DEBUG_MODE', 'True').lower() == 'true'

    # Startet den integrierten Webserver auf Port 8050
    # Erreichbar über http://127.0.0.1:8050 oder im Netzwerk über Server-IP
    app.run(debug=debug_mode, host='0.0.0.0', port=8050)
