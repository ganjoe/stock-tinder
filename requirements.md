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

# Requirements Backlog: Data Source Integration (Parquet)

| ID | Category | Title | Description | Covered By |
| :--- | :--- | :--- | :--- | :--- |
| F-SYS-200 | System | Cross-Project Volume | Das System muss Lese-Zugriff auf das Datenverzeichnis von `stock-data-node` (Parquet) haben (z.B. am Pfad `/home/daniel/stock-data-node/data/parquet` lokal oder im Docker via Volume). | - |
| F-SYS-205 | Configuration | External Parquet Path | Das System muss eine `config.json` in einem `/config/` Verzeichnis lesen, welche zwingend den absoluten Pfad zum externen Parquet-Datenverzeichnis definiert. Hardcoding oder Fallbacks auf lokale Ordner sind nicht erlaubt. | - |
| F-SYS-206 | Configuration | External Watchlist Path | Die `config.json` muss zwingend den Pfad `WATCHLIST_DIR` definieren. Ein Fallback auf lokale Verzeichnisse ist untersagt, da das System keine eigene Datenhaltung mehr besitzt. | - |
| F-DATA-210 | Server | Parquet-to-JSON Bridge | Der Backend-Server (`server.py`) liest das externe `1D.parquet` und liefert es als JSON an das Frontend aus. | - |
| F-DATA-215 | Server | Indikator Parquet Bridge | Der Backend-Server (`server.py`) liest pro Ticker die extern erzeugte `indikator.parquet` und liefert die Daten strukturiert als JSON an das Frontend aus. | - |
| F-DATA-230 | Server | Multi-Delimiter Parsing | Das System muss beim Einlesen der Watchlisten neben Whitespace auch Kommata und Semikolons als Trennzeichen unterstützen. | - |
| F-DATA-220 | Server | Column Mapping | Die Parquet-Spalten (`timestamp`, `open`, `high`, `low`, `close`, `volume`) müssen on-the-fly durch den Server gemappt werden (zu `t`, `o`, `h`, `l`, `c`, `v`). | - |
| F-UI-240 | Backend | Ticker-Discovery | Die verfügbaren Ticker werden dynamisch aus den Unterverzeichnissen des konfigurierten externen Parquet-Stammverzeichnisses gelesen. | - |
| F-ARCH-250 | Architektur | Preprocessor Deprecation | Der interne `preprocessor` wird nicht mehr verwendet und muss nicht angepasst werden. Die Datenaufbereitung (Charts & Indikatoren) obliegt alleinig der externen Datenquelle. | - |
| F-DATA-240 | Storage | External Annotation Storage | Annotationen (`annotations.json`) werden ab jetzt pro Ticker direkt im jeweiligen Unterverzeichnis des externen Parquet-Stammverzeichnisses (z.B. `/.../<tickername>/annotations.json`) gespeichert. | - |
| F-DATA-300 | API | Feature Config Source | Die Visualisierungs-Metadaten werden primär aus der externen `features.json` des Daten-Nodes bezogen. | - |
| F-DATA-350 | Configuration | Integrated Color Aliases | Die `features.json` enthält eine globale Sektion `aliases` für standardisierte Farbcodes. | - |
| F-UI-400 | UI | Root-Level Master Toggle | Das Indikatoren-Dropdown bietet nur die Root-Keys der `features.json` zur Auswahl (keine Einzelauswahl von Gruppenmitgliedern). | - |
| F-ARCH-410 | Architecture | Hierarchical Rendering | Die Aktivierung eines Root-Features rendert rekursiv alle untergeordneten Child-Datenreihen. | - |
| F-ARCH-420 | Architecture | Strict Pane Validation | Indikatoren ohne explizites `pane` Attribut (auch nicht vererbt) werden ignoriert und nicht gerendert. | - |
| F-ARCH-430 | Architecture | Property Inheritance | Sub-Indikatoren erben fehlende Attribute (wie `period`, `style`) von ihren übergeordneten Feature-Objekten. | - |
| F-UI-500 | UI | xLock Toggle | Das System verfügt über eine Switch-Komponente namens "xLock" in der UI. | [index.html](file:///home/daniel/stock-tinder/static/index.html) |
| F-UI-510 | UX | Zeitachsen-Lock | Ist "xLock" aktiv (ON), bleibt der exakte Datumsbereich (from/to) beim Ticker-Wechsel erhalten. | [apiClient.js](file:///home/daniel/stock-tinder/static/apiClient.js) |
| F-UI-520 | UX | Konfigurierbarer Default Zoom | Ist "xLock" inaktiv (OFF), zeigt das System eine via `chart.json` definierte Anzahl an Kerzen an (Default: 126). | [apiClient.js](file:///home/daniel/stock-tinder/static/apiClient.js) |
| F-UI-525 | UI | Universelles Right Padding | Bei xLock=OFF wird stets ein rechter Rand-Offset (Padding) von ca. 20% gewahrt - auch bei kurzen Historien (z.B. Ticker BETA). | [apiClient.js](file:///home/daniel/stock-tinder/static/apiClient.js) |
| F-SYS-550 | System | Chart Konfigurationsdatei | Das System liest Anzeigeparameter (`defaultVisibleCandles`, `rightOffsetPercent`) aus `config/chart.json`. | [server.py](file:///home/daniel/stock-tinder/server.py) |
| F-SYS-560 | System | Config Fallback | Fehlen Werte in der `chart.json`, nutzt das System stabile Defaults (126 Candles, 20% Offset). | [server.py](file:///home/daniel/stock-tinder/server.py) |
| F-DATA-570 | Server | Chart Config API | Der Server exploniert die Einstellungen der `chart.json` über den API-Endpunkt `/api/chart_config`. | [server.py](file:///home/daniel/stock-tinder/server.py) |

