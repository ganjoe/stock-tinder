# Requirements Backlog: Charting & UI

| ID | Category | Title | Description | Covered By |
| :--- | :--- | :--- | :--- | :--- |
| F-ARCH-010 | Architektur | Hardcodierte Kategorien (Ziel-Panes) | Das System muss die Kategorien "price", "vol", "norm", "norm_abs", "pct_abs", "pct" und "abs" unmissverständlich als **Routing-Ziele** (Panes) kennen. | - |
| F-UI-020 | UI | Standard-Pane Price | Das System verfügt über ein statisches primäres Chart-Pane exklusiv für "price"-Indikatoren. Dieses Pane ist immer sichtbar und sein Platz darf durch andere Panes verkleinert werden. | - |
| F-UI-030 | UI | Standard-Pane Volume | Das System verfügt über ein statisches Volume-Pane für Indikatoren der Kategorie "vol" (Volume, Dollar-Volume, Vol-MA etc.). | - |
| F-ARCH-035 | Architektur | Trennung von Pane und Chart-Typ | Die visuelle Darstellung wird von der Kategorie entkoppelt. Das System liest das Attribut `chart_type` aus der JSON. Mögliche Werte sind "line", "bar" (Balken) und "scatter" (Punkte). Fehlt dies, gelten Defaults (z.B. price=line, vol=bar). | - |
| F-ARCH-040 | Architektur | Statisches Indikator-Routing | app.js liest die Kategorie aus der `indikator_colors.json` und routet den Indikator in das entsprechende Pane (gemäß F-ARCH-010). | - |
| F-ARCH-050 | Architektur | Vorbereitung Future-Panes | Die Routing-Logik muss für die restlichen Kategorien vorbereitet sein, in feste Panes zu routen, sobald diese via UI aktiviert werden. | - |
| F-ERR-060 | Error | Fehlende Panes / Kategorien | Wenn für eine Kategorie (noch) kein Pane im UI existiert oder die Kategorie unbekannt ist, wird das Rendering fehlerfrei übersprungen. | - |
| F-UI-070 | UI | Persistentes Pane-Resizing | Alle sichtbaren Chart-Panes müssen in der Höhe variabel verschiebbar sein (Maustrenner). Die Höhenverhältnisse müssen beim Chart-Wechsel erhalten bleiben. | - |
| F-DATA-080 | Daten | Price-Indicator Alignment | Indikatoren-Datenreihen (auch mit initialen `null`-Werten) müssen exakt auf die Zeitstempel der Price-Daten synchronisiert gerendert werden. | - |
| F-UI-095 | UI | Instant Auto-Scale (Y-Axis) | Beim Aktivieren des "Auto"-Toggles (ON) wird die Y-Achse sofort auf die aktuell sichtbaren Kerzen skaliert. Die X-Achse (Zeitraum) darf sich dabei **niemals** verändern oder zurücksetzen. | - |
| F-UI-096 | UI | Panning Behaviour (Auto ON/OFF) | Horizontales Panning (links/rechts ziehen) ist *immer* möglich. Ist "Auto" ON, skaliert sich die Y-Achse während des Ziehens dynamisch mit. Vertikales Panning (oben/unten ziehen) ist nur möglich, wenn "Auto" OFF ist. | - |
| F-CHART-100 | Charting | Auto-Scale Logik & Baseline | Bei "Auto ON" werden alle Y-Achsen automatisch skaliert (X bleibt stabil). Die Y=0 Baseline wird abhängig von der Kategorie gesetzt (z.B. y=0 unten bei "vol"/"abs"; y=0 mittig bei "norm"/"pct"). | - |
| F-UI-110 | UI | Initiales Layout | Beim Öffnen der HTML werden standardmäßig nur das Price-Pane und das Volume-Pane in einem sinnvollen Höhenverhältnis (z.B. 1:4 oder 4:1) angezeigt. | - |
| F-UI-120 | UI | Pane Toggles (Dropdown) | Alle nicht-Price Panes (vol, norm, pct etc.) können über ein Dropdown-Menü per Checkbox ein- und ausgeblendet werden. Dieses Menü befindet sich im bestehenden Control-Bereich (unterhalb der Charts). | - |
| F-UI-130 | UI | Dynamische Platzverteilung | Wenn Panes eingeblendet werden, verkleinern sie bestehende Panes sinnvoll. Wenn Panes geschlossen werden, dehnen sich die verbleibenden Panes (z.B. Price/Volume) automatisch aus, sodass stets 100% der Fläche ohne Leerraum (weder vertikal noch horizontal) ausgefüllt wird. | - |
| F-UI-140 | UI | Indicator Toggles (Dropdown) | Indikatoren werden über Checkboxen innerhalb eines Dropdown-Menüs aktiviert. Dieses Menü befindet sich im bestehenden Control-Bereich (ausgerichtet wie bisherige Dropdowns). | - |
| F-UI-150 | UI | Pane Close Button | Jedes offene Pane (außer Price) verfügt über einen X-Button in der UI (z.B. Ecke des Panes), um es schnell zu schließen. | - |
| F-UI-160 | UI | Auto-Open Pane | Wird ein Indikator aus dem Dropdown aktiviert, dessen Ziel-Pane (Kategorie) momentan nicht im UI sichtbar (eingeblendet) ist, wird dieses Pane automatisch geöffnet/eingeblendet. | - |
| F-UI-170 | UI | Pane Stacking Order | Das "price" Pane ist zwingend immer das oberste Pane. Das "vol" Pane ist (sofern sichtbar) zwingend immer das unterste Pane. Alle dynamisch hinzukommenden Panes ("norm", "pct" etc) werden chronologisch nach Öffnungszeitpunkt dazwischen eingefügt. | - |
| F-UI-180 | UI | Multi-Pane Resizing | Trenner (Resizer) zwischen den Panes müssen beim Verschieben exakt der Maus folgen. Das Verschieben verändert proportional die Höhe des direkt darüber- und darunterliegenden Panes, während alle anderen konstant bleiben. | - |
| F-UI-190 | UI | Resizer-Intaktheit | Nach dem dynamischen Ein- und Ausblenden von Panes müssen alle verblerequenz bleiben und sofort fehlerfrei nutzbar sein, ohne an falschen Positionen fixiert zu hängen. | - |
| F-UX-200 | UX | Bereich merken | Beim Ticker-Wechsel speichert das System die Anzahl der sichtbaren Kerzen (Zoom-Faktor). | - |
| F-UX-210 | UX | Rechtsbündige Verankerung | Nach einem Tickerwechsel wird der neuste Datenpunkt der Aktie am rechten Bildschirmrand fixiert. | - |
| F-UX-230 | UX | Zoom-Anker Rechts (Viewport) | Während des manuellen Zoomens bleibt der Datenpunkt, der sich gerade am rechten Viewport-Rand befindet, positionsfest an diesem Rand fixiert (unabhängig von der Mausposition). | - |
| F-UX-240 | UX | Zoom-Zentrum ignorieren | Die Standard-Skalierung auf die Mausposition wird durch eine Skalierung relativ zum rechten Viewport-Rand ersetzt. | - |
| F-UX-250 | UX | Autoscale Reset | Beim Ticker-Wechsel wird der Status des "Auto"-Scale Sliders auf den Default-Wert (aktiviert) zurückgesetzt. | - |

# Requirements Backlog: Preprocessor & ML Output

| ID | Category | Title | Description | Covered By |
| :--- | :--- | :--- | :--- | :--- |
| F-PRE-010 | Architecture | Single-Source Config | Das System muss alle Indikatoren in einem zentralen "Rezeptbuch" (Konfigurationsobjekt) definieren, welches den strukturellen Pfad, den Berechnungstyp und Parametrisierung festlegt. | - |
| F-PRE-020 | Processing | Dual-Output Engine | Für jeden Indikator muss die Engine zwingend zwei getrennte Berechnungsstränge bedienen: Absolute Metriken für das UI (JSON) und Metriken für das Machine Learning Modell (Parquet). | - |
| F-PRE-030 | Data-Input | Input Data Contract | Das System erwartet als Input pro Ticker eine `1D.json` Datei, welche zwingend Arrays für Time (`t`), Close (`c`), High (`h`), Low (`l`) und Volume (`v`) bereitstellt. | - |
| F-PRE-040 | Processing | Fallback & NaN-Handling | Fehler während einer Indikator-Berechnung dürfen das Batch-Processing nicht abbrechen, sondern generieren Null/NaN-Werte. | - |
| F-PRE-050 | Export-GUI | Indikator JSON-Tree | Das System exportiert pro Ticker eine `indikator.json` mit verschachteltem JSON-Baum, auf 4 Nachkommastellen gerundet. | - |
| F-PRE-060 | Export-ML | Global Feature Parquet | Das System aggregiert alle ML-Daten in einer flachen `features.parquet`. Config-Pfade werden zu flachen Spaltennamen. | - |
| F-PRE-070 | Logic: MAs | SMA_DIST / EMA_DIST | Berechnet den gleitenden Durchschnitt. GUI-Wert und ML-Wert geben beide den **prozentualen Abstand** des Schlusskurses zum Durchschnitt zurück (`(Preis - MA) / MA`). | - |
| F-PRE-080 | Logic: MAs | SMA_PRICE / EMA_PRICE | Berechnet den gleitenden Durchschnitt. GUI-Wert und ML-Wert geben beide den **absoluten Dollar-Wert** des Durchschnitts zurück. (Oft kombiniert mit `exclude_ml=True`). | - |
| F-PRE-090 | Logic: Oscillator | STOCH_K | Berechnet den Stochastik-Oszillator K. GUI-Wert skaliert klassisch **0 bis 100**. ML-Wert wird auf **0.0 bis 1.0 normalisiert**. | - |
| F-PRE-100 | Logic: Volatility | ADR_PCT / ATR_PCT | Berechnet Volatilität (Range oder Average True Range). GUI-Wert und ML-Wert geben beide die Schwankung **prozentual** (`Wert / Close`) zurück. (ADR ist geglättet über X Tage). | - |
| F-PRE-110 | Logic: Volatility | ADR / ATR | Berechnet Volatilität. GUI-Wert und ML-Wert geben beide isoliert die **absolute Schwankung in Währung** (z.B. Dollar) aus. | - |
| F-PRE-120 | Logic: Volume | VOL_RATIO | Berechnet das Verhältnis des aktuellen Volumens zum gleitenden Durchschnitt. GUI-Wert und ML-Wert sind beide das **Ratio** (`Aktuelles Volumen / Durchschnittsvolumen`). | - |
| F-PRE-130 | Logic: Volume | VOL_MA | Berechnet den einfachen gleitenden Volumendurchschnitt. GUI-Wert und ML-Wert geben beide die **absolute Stückzahl** aus. | - |
| F-PRE-140 | Configuration | ML Exclusion Flag | Das Config-Objekt unterstützt ein `exclude_ml`: True Flag. Ist dies gesetzt, berechnet die Engine den Indikator regulär für die GUI .json, fügt die Datenspalte aber absichtlich **nicht** der `features.parquet` hinzu. | - |
