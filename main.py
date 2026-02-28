import dash
from dash import dcc, html, dash_table, Input, Output, State, ctx, Patch, no_update
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
import functools

# =====================================================================
# KONFIGURATION & KONSTANTEN (Hier Parameter anpassen)
# =====================================================================

# Globaler Lock-Pool für Dateizugriffe (verhindert Race Conditions auf Mobile)
FILE_LOCKS = defaultdict(threading.Lock)

# Basis-Verzeichnis für deine Ticker-Daten
DATA_DIR = "./data/market_cache" 
ANNO_DIR = "./data/anno"

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
        
        # Generiere 100 Tage Fake-Börsendaten im neuen Format
        now_ts = int(datetime.now().timestamp())
        day_sec = 86400
        data = []
        for i in range(100):
            ts = now_ts - (100 - i) * day_sec
            data.append({
                "t": ts,
                "o": float(np.linspace(100, 150, 100)[i] + np.random.normal(0, 2)),
                "h": float(np.linspace(100, 150, 100)[i] + np.random.normal(0, 2) + 2),
                "l": float(np.linspace(100, 150, 100)[i] + np.random.normal(0, 2) - 2),
                "c": float(np.linspace(100, 150, 100)[i] + np.random.normal(0, 2)),
                "v": float(np.random.randint(1000000, 5000000))
            })
        
        # Speichere 1D.json
        with open(os.path.join(test_dir, DATA_FILE), 'w') as f:
            json.dump(data, f)
        print("INFO: Dummy-Daten erzeugt. Du kannst jetzt testen!")

def get_ticker_list():
    """Liest alle Unterordner im Datenverzeichnis aus (alphabetisch sortiert)."""
    ensure_dummy_data()
    folders = [f.name for f in os.scandir(DATA_DIR) if f.is_dir()]
    return sorted(folders)

def load_annotations(ticker):
    """Lädt die annotations.json oder erzeugt das saubere JSON-Schema (F-DAT-010)."""
    filepath = os.path.join(ANNO_DIR, ticker, ANNOTATION_FILE)
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

    ticker_anno_dir = os.path.join(ANNO_DIR, ticker)
    if not os.path.exists(ticker_anno_dir):
        os.makedirs(ticker_anno_dir)
        
    filepath = os.path.join(ticker_anno_dir, ANNOTATION_FILE)
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

@functools.lru_cache(maxsize=10)
def load_chart_data(ticker):
    """Lädt die OHLCV Daten für den Chart und konvertiert das Format. Mit Caching für Performance."""
    filepath = os.path.join(DATA_DIR, ticker, DATA_FILE)
    if os.path.exists(filepath):
        try:
            df = pd.read_json(filepath, orient="records")
            if not df.empty:
                # Mapping der neuen Feldnamen auf die alten
                rename_map = {
                    't': 'date',
                    'o': 'open',
                    'h': 'high',
                    'l': 'low',
                    'c': 'close',
                    'v': 'volume'
                }
                # Nur umbenennen wenn die Spalten existieren
                df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})
                
                # Konvertiere Unixtime in datetime Objekte (kein strftime! Plotly braucht echte Dates fuer Performance)
                if 'date' in df.columns:
                    df['date'] = pd.to_datetime(df['date'], unit='s')
            return df
        except Exception as e:
            print(f"ERROR beim Laden der Chart-Daten für {ticker}: {e}")
            return pd.DataFrame()
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
                    'displayModeBar': True,      # Versteckt die Plotly-Menüleiste (F-UX-050)
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
                *[dbc.Button(f"{i}", id=f"btn-score-{i}", color="success", size="sm", className="m-1") for i in range(1, 7)],
                dbc.Button("30D", id="btn-tf-30", color="info", size="sm", outline=True, className="m-1"),
                dbc.Button("60D", id="btn-tf-60", color="info", size="sm", outline=True, className="m-1"),
                dbc.Button("90D", id="btn-tf-90", color="info", size="sm", outline=True, className="m-1"),
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
     Input("candlestick-chart", "relayoutData"),
     Input("annotations-table", "active_cell"),
     Input("btn-tf-30", "n_clicks"),
     Input("btn-tf-60", "n_clicks"),
     Input("btn-tf-90", "n_clicks")],
    [State("current-index", "data"),
     State("ticker-list", "data"),
     State("annotations-table", "data"),
     State("candlestick-chart", "figure")] # Vorherige Figure für State-Erhaltung
)
def main_logic(btn_prev, btn_next, b1, b2, b3, b4, b5, b6, table_timestamp, view_toggle, dragmode_toggle, autoscale_toggle, relayout_data, active_cell, tf30, tf60, tf90, current_idx, ticker_list, table_data, prev_figure):
    """
    Diese zentrale Funktion steuert alles: Ticker-Wechsel, Speichern von Scores, Chart-Rendering.
    """
    if not ticker_list:
        return current_idx, "NO DATA", go.Figure(), []

    # 1. Welches Event hat den Callback ausgelöst?
    trigger_id = ctx.triggered_id if ctx.triggered_id else 'No clicks yet'
    
    # === FAST-PATH: Zoom/Pan Event === 
    # Wenn der Chart selbst das Event ausgelöst hat (Scroll/Drag), NICHT alles neu zeichnen.
    if trigger_id == "candlestick-chart":
        autoscale_on = "auto" in autoscale_toggle
        
        # Autoscale AUS -> Browser macht alles alleine, kein Server-Roundtrip nötig
        if not autoscale_on:
            return no_update, no_update, no_update, no_update
        
        # Autoscale AN + X-Achse hat sich geändert -> Nur Y-Achse patchen
        if relayout_data and 'xaxis.range[0]' in relayout_data:
            current_ticker = ticker_list[current_idx]
            df = load_chart_data(current_ticker)  # Aus dem LRU-Cache, kein Disk I/O
            if not df.empty:
                try:
                    x0 = pd.to_datetime(relayout_data['xaxis.range[0]'])
                    x1 = pd.to_datetime(relayout_data['xaxis.range[1]'])
                    visible_df = df[(df['date'] >= x0) & (df['date'] <= x1)]
                    if not visible_df.empty:
                        y_min = visible_df['low'].min()
                        y_max = visible_df['high'].max()
                        padding = (y_max - y_min) * 0.1
                        if padding == 0: padding = y_max * 0.01
                        v_max = visible_df['volume'].max()
                        
                        patched = Patch()
                        patched['layout']['yaxis']['range'] = [y_min - padding, y_max + padding]
                        patched['layout']['yaxis']['autorange'] = False
                        patched['layout']['yaxis2']['range'] = [0, v_max * 1.1]
                        patched['layout']['yaxis2']['autorange'] = False
                        return no_update, no_update, patched, no_update
                except:
                    pass
        
        # Alle anderen Chart-Events (Reset, Y-Pan, etc.) -> ignorieren
        return no_update, no_update, no_update, no_update
    
            
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

    # 2. Event-Voranalyse (Navigation, Table Nav, Timeframe Buttons)
    table_nav_range = None
    
    # Timeframe Buttons (30D, 60D, 90D)
    if trigger_id in ["btn-tf-30", "btn-tf-60", "btn-tf-90"]:
        days = int(trigger_id.split("-")[-1])
        # Linke Kante des aktuellen Viewports beibehalten
        # Prio 1: relayoutData (vom letzten nativen Zoom/Pan)
        # Prio 2: prev_figure Layout (z.B. nach Table-Klick, wo relayoutData veraltet ist)
        # Prio 3: Ende der Daten minus N Tage
        if relayout_data and 'xaxis.range[0]' in relayout_data:
            left_edge = pd.to_datetime(relayout_data['xaxis.range[0]'])
        elif prev_figure and 'layout' in prev_figure and 'xaxis' in prev_figure['layout'] and 'range' in prev_figure['layout']['xaxis']:
            left_edge = pd.to_datetime(prev_figure['layout']['xaxis']['range'][0])
        elif not df.empty:
            left_edge = df['date'].iloc[-1] - pd.Timedelta(days=days)
        else:
            left_edge = pd.Timestamp.now() - pd.Timedelta(days=days)
        right_edge = left_edge + pd.Timedelta(days=days)
        table_nav_range = [left_edge, right_edge]
        start_date = left_edge
        end_date = right_edge
    
    elif trigger_id == "annotations-table" and active_cell:
        row_idx = active_cell.get('row')
        if row_idx is not None and row_idx < len(table_data):
            ann = table_data[row_idx]
            try:
                # Konvertiere in Timestamps für die Berechnung
                start_dt = pd.to_datetime(ann['start'])
                end_dt = pd.to_datetime(ann['end'])
                
                # Berechne Padding (25% der Dauer auf jeder Seite, min 1 Tag)
                duration_days = (end_dt - start_dt).days
                padding_days = max(1, int(duration_days * 0.25))
                
                # Neuer Bereich mit Padding
                new_start = start_dt - pd.Timedelta(days=padding_days)
                new_end = end_dt + pd.Timedelta(days=padding_days)
                
                table_nav_range = [new_start, new_end]
                
                # Setze start_date und end_date für die Y-Achsen Skalierung
                start_date = new_start
                end_date = new_end
            except Exception as e:
                import traceback
                print(f"INFO: Navigation fehlgeschlagen: {e}\n{traceback.format_exc()}")

    # Viewport-Bestimmung (Immer ausführen für Autoscale & Annotationen)
    relayout_y_range = None
    if relayout_data and not table_nav_range:
        if 'xaxis.range[0]' in relayout_data:
            try:
                start_date = pd.to_datetime(relayout_data['xaxis.range[0]'])
                end_date = pd.to_datetime(relayout_data['xaxis.range[1]'])
            except:
                start_date = df['date'].iloc[0] if not df.empty else None
                end_date = df['date'].iloc[-1] if not df.empty else None
        else:
            start_date = df['date'].iloc[0] if not df.empty else None
            end_date = df['date'].iloc[-1] if not df.empty else None
        
        if 'yaxis.range[0]' in relayout_data:
            relayout_y_range = [relayout_data['yaxis.range[0]'], relayout_data['yaxis.range[1]']]
    elif not table_nav_range:
        start_date = df['date'].iloc[0] if not df.empty else None
        end_date = df['date'].iloc[-1] if not df.empty else None
    
    # 2. Score Button geklickt? -> Neuen Bereich erfassen
    if trigger_id and trigger_id.startswith("btn-score-") and start_date and end_date:
        score = int(trigger_id.split("-")[-1])
            
        # Neues Label generieren und an Human Annotations anhängen
        # Konvertiere Timestamps in Strings fuer JSON
        sd_str = pd.to_datetime(start_date).strftime('%Y-%m-%d') if hasattr(start_date, 'strftime') else str(start_date).split(' ')[0]
        ed_str = pd.to_datetime(end_date).strftime('%Y-%m-%d') if hasattr(end_date, 'strftime') else str(end_date).split(' ')[0]
        new_label = {
            "pattern": PATTERN_NAME,
            "start": sd_str,
            "end": ed_str,
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
        # Volumen (Wiederhergestellt: Bar Chart wie vom User gewünscht)
        fig.add_trace(go.Bar(x=df['date'], y=df['volume'], marker_color='gray', name="Volume"), row=2, col=1)
        
        # Rangeslider entfernen, verbraucht nur Platz, Legende ausblenden für Mobile
        # Dragmode (Zoom/Pan) setzen, Zoom/Pan auf X-Achse einschränken (F-UX-070)
        autoscale_on = "auto" in autoscale_toggle
        
        y_range = None
        y2_range = None
        
        # Y-Skalierung berechnen wenn Auto an ist
        if autoscale_on and not df.empty and start_date is not None and end_date is not None:
            visible_df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]
            if not visible_df.empty:
                y_min = visible_df['low'].min()
                y_max = visible_df['high'].max()
                padding = (y_max - y_min) * 0.1
                if padding == 0: padding = y_max * 0.01
                y_range = [y_min - padding, y_max + padding]
                y2_max = visible_df['volume'].max()
                y2_range = [0, y2_max * 1.1]
                
        elif not autoscale_on and prev_figure and 'layout' in prev_figure and trigger_id not in ["btn-next", "btn-prev", "No clicks yet", "annotations-table", "autoscale-toggle"]:
            # Fallback auf den vorherigen Y-Range
            if 'yaxis' in prev_figure['layout']:
                y_range = prev_figure['layout']['yaxis'].get('range')
            if 'yaxis2' in prev_figure['layout']:
                y2_range = prev_figure['layout']['yaxis2'].get('range')

        # uirevision: Bei Table-Nav wechseln, damit Plotly die neue X-Range annimmt
        ui_rev = current_ticker
        if table_nav_range:
            ui_rev = f"{current_ticker}_{table_nav_range[0]}"

        fig.update_layout(
            showlegend=False, 
            xaxis_rangeslider_visible=False, 
            margin=dict(l=20, r=20, t=30, b=20),
            dragmode=dragmode_toggle,
            uirevision=ui_rev,
            yaxis_fixedrange=(dragmode_toggle == "zoom"),
            yaxis2_fixedrange=True,
        )

        if y_range:
            fig.update_layout(yaxis_range=y_range, yaxis_autorange=False)
        elif relayout_y_range:
            fig.update_layout(yaxis_range=relayout_y_range, yaxis_autorange=False)
        else:
            fig.update_layout(yaxis_autorange=True)
            
        if y2_range:
            fig.update_layout(yaxis2_range=y2_range, yaxis2_autorange=False)
        else:
            fig.update_layout(yaxis2_autorange=True)
            
        # X-Achse: Table-Nav hat Prio, dann relayout State, dann Autorange
        if table_nav_range:
            fig.update_layout(xaxis_range=table_nav_range, xaxis_autorange=False)
        elif relayout_data and 'xaxis.range[0]' in relayout_data:
            fig.update_layout(
                xaxis_range=[relayout_data['xaxis.range[0]'], relayout_data['xaxis.range[1]']],
                xaxis_autorange=False
            )
        else:
            fig.update_layout(xaxis_autorange=True)

        
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

