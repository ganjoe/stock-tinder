// =====================================
// GLOBAL STATE
// =====================================
let tickers = [];
let currentIndex = 0;
let chart = null;
let volumeChart = null;
let candlestickSeries = null;
let volumeSeries = null;
let currentData = [];
let dataCache = new Map();
let annotations = { human_annotations: [], ai_predictions: [] };
let annotationLines = [];

// Table Visibility & Layout State
let isTableVisible = localStorage.getItem('tableVisible') !== 'false';
let volumeHeightRatio = 0.25; // Default: 150px / 600px wrapper
let selectionSeries = null; // To draw temporary selection markers

const COLOR_HUMAN = 'rgba(0, 255, 0, 0.2)';
const COLOR_BOT = 'rgba(0, 0, 255, 0.2)';

// =====================================
// INITIALIZATION
// =====================================
document.addEventListener("DOMContentLoaded", async () => {
    initChart();
    await fetchTickers();
    setupEventListeners();
});

function initChart() {
    const priceContainer = document.getElementById('price-chart-container');
    const volumeContainer = document.getElementById('volume-chart-container');

    // Ensure LightweightCharts is loaded
    if (typeof window.LightweightCharts === 'undefined') {
        setTimeout(initChart, 100);
        return;
    }

    chart = window.LightweightCharts.createChart(priceContainer, {
        width: priceContainer.clientWidth,
        height: priceContainer.clientHeight,
        layout: {
            background: { type: 'solid', color: '#121212' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
            horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        crosshair: {
            mode: 1, // Normal mode
        },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        timeScale: {
            visible: false,
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: false,
        },
    });

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
    });

    // Hidden series just for drawing the temporary selection markers
    selectionSeries = chart.addLineSeries({
        color: 'transparent',
        lineWidth: 0,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    volumeChart = window.LightweightCharts.createChart(volumeContainer, {
        width: volumeContainer.clientWidth,
        height: volumeContainer.clientHeight,
        layout: {
            background: { type: 'solid', color: '#121212' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
            horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        crosshair: {
            mode: 1, // Normal mode
        },
        rightPriceScale: {
            visible: true,
            autoScale: true,
            borderColor: 'rgba(197, 203, 206, 0.8)',
            scaleMargins: {
                top: 0.1,
                bottom: 0, // Keep volume at bottom, preventing negative labels
            },
        },
        timeScale: {
            visible: true,
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: false,
            minBarSpacing: 0.5, // Increase density
            tickMarkFormatter: (time, tickMarkType, locale) => {
                const date = new Date(time * 1000);
                const month = date.toLocaleString('en-US', { month: 'short' });
                const year = date.getFullYear().toString().slice(-2);
                return `${month} '${year}`;
            },
        },
        handleScale: {
            axisPressedMouseMove: {
                time: true,
                price: true,
            },
        },
        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
        },
    });

    volumeSeries = volumeChart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
            type: 'volume',
        },
        priceScaleId: 'right', // Explicitly use right scale to enable labels and dragging
    });

    // Ensure the volume scale doesn't show negative values and has a 0 baseline
    volumeSeries.priceScale().applyOptions({
        autoScale: true,
        scaleMargins: {
            top: 0.1,
            bottom: 0.05, // Small margin to ensure the 0 label has room
        },
    });

    // Handle Resize
    window.addEventListener('resize', () => {
        if (chart && priceContainer) {
            chart.applyOptions({
                width: priceContainer.clientWidth,
                height: priceContainer.clientHeight
            });
        }
        if (volumeChart && volumeContainer) {
            volumeChart.applyOptions({
                width: volumeContainer.clientWidth,
                height: volumeContainer.clientHeight
            });
        }
    });

    // Task T-003: Sync Time Scales
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) volumeChart.timeScale().setVisibleLogicalRange(range);
    });
    volumeChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    // Initialize Visibility
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.checked = isTableVisible;
    updateLayout();

    // Task T-003: Sync Crosshairs
    function syncCrosshair(param, targetChart, targetSeries) {
        if (!param.time) {
            targetChart.clearCrosshairPosition();
            return;
        }
        let price = null;
        const d = dataCache.get(param.time);
        if (d) {
            if (targetSeries === candlestickSeries) price = d.close;
            else if (targetSeries === volumeSeries) price = d.value;
        }
        if (price !== null) {
            targetChart.setCrosshairPosition(price, param.time, targetSeries);
        } else {
            targetChart.clearCrosshairPosition();
        }
    }

    chart.subscribeCrosshairMove(param => syncCrosshair(param, volumeChart, volumeSeries));
    volumeChart.subscribeCrosshairMove(param => syncCrosshair(param, chart, candlestickSeries));

    // Task T-004: Implement Resizer Drag Logic
    const resizer = document.getElementById('chart-resizer');
    const wrapper = document.getElementById('chart-wrapper');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const wrapperRect = wrapper.getBoundingClientRect();
        let newVolumeHeight = wrapperRect.bottom - e.clientY;

        // Limits
        if (newVolumeHeight < 50) newVolumeHeight = 50;
        if (newVolumeHeight > wrapperRect.height - 150) newVolumeHeight = wrapperRect.height - 150;

        volumeContainer.style.height = `${newVolumeHeight}px`;

        // Update ratio so expansion maintains it
        volumeHeightRatio = newVolumeHeight / wrapper.clientHeight;

        // Adjust charts
        chart.applyOptions({ width: priceContainer.clientWidth, height: priceContainer.clientHeight });
        volumeChart.applyOptions({ width: volumeContainer.clientWidth, height: volumeContainer.clientHeight });
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    });

    // Handle Selection (Shift+Click OR Select Mode toggle)
    chart.subscribeClick((param) => {
        if (!param.time || !param.sourceEvent) return;

        const isSelectMode = document.getElementById('select-mode-toggle').checked;
        if (!param.sourceEvent.shiftKey && !isSelectMode) return;

        const clickedTime = param.time;

        if (!selectionRange.start || (selectionRange.start && selectionRange.end)) {
            // New selection
            selectionRange.start = clickedTime;
            selectionRange.end = null;
        } else {
            // Complete selection
            if (clickedTime < selectionRange.start) {
                selectionRange.end = selectionRange.start;
                selectionRange.start = clickedTime;
            } else {
                selectionRange.end = clickedTime;
            }
        }
        drawSelectionMarkers();
    });
}

function drawSelectionMarkers() {
    let markers = [];
    if (selectionRange.start) {
        markers.push({ time: selectionRange.start, position: 'belowBar', color: '#ffcc00', shape: 'arrowUp', text: 'Select Start' });
    }
    if (selectionRange.end) {
        markers.push({ time: selectionRange.end, position: 'aboveBar', color: '#ffcc00', shape: 'arrowDown', text: 'Select End' });
    }
    selectionSeries.setMarkers(markers);
}

// =====================================
// API CALLS
// =====================================
async function fetchTickers() {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    tickers = data.tickers || [];
    if (tickers.length > 0) {
        await loadTicker(0);
    }
}

async function loadTicker(index) {
    if (index < 0 || index >= tickers.length) return;
    currentIndex = index;
    const ticker = tickers[currentIndex];
    document.getElementById('current-ticker-display').innerText = `Ticker: ${ticker}`;

    // Fetch Chart Data
    const resData = await fetch(`/api/chart/${ticker}`);
    currentData = await resData.json();

    // Cache for fast crosshair lookup
    dataCache.clear();
    currentData.forEach(d => dataCache.set(d.time, d));

    // Fetch Annotations
    const resAnno = await fetch(`/api/annotations/${ticker}`);
    annotations = await resAnno.json();

    renderChart();
    renderTable();
}

async function saveAnnotations() {
    const ticker = tickers[currentIndex];
    await fetch(`/api/annotations/${ticker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotations)
    });
}

// =====================================
// RENDERING
// =====================================
function renderChart() {
    if (!currentData || currentData.length === 0) {
        candlestickSeries.setData([]);
        volumeSeries.setData([]);
        return;
    }

    // Prepare data for Lightweight Charts
    const candleData = currentData.map(d => ({
        time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    }));

    const volData = currentData.map(d => ({
        time: d.time,
        value: d.value,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volData);
    selectionSeries.setData(candleData.map(d => ({ time: d.time, value: d.close }))); // Need data to attach markers

    // Clear active selection on new ticker load
    selectionRange = { start: null, end: null };
    drawSelectionMarkers();

    // Draw Annotations (as colored background ranges or lines)
    drawAnnotations();

    // Auto-scale logic
    const isAuto = document.getElementById('autoscale-toggle').checked;
    candlestickSeries.priceScale().applyOptions({ autoScale: isAuto });

    // Always fit content on new load so the new ticker is fully visible
    chart.timeScale().fitContent();
    if (volumeChart) volumeChart.timeScale().fitContent();
}

function drawAnnotations() {
    // Clear old markers/lines if any
    candlestickSeries.setMarkers([]);

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = annotations[viewMode] || [];
    const color = viewMode === 'human_annotations' ? '#00FF00' : '#0000FF';

    let markers = [];

    list.forEach(ann => {
        // Lightweight charts doesn't have native "vrect" backgrounds easily.
        // We use Markers above the bars.
        markers.push({
            time: ann.start,
            position: 'aboveBar',
            color: color,
            shape: 'arrowDown',
            text: `[${ann.score}] Start`
        });
        markers.push({
            time: ann.end,
            position: 'belowBar',
            color: color,
            shape: 'arrowUp',
            text: `End`
        });
    });

    // Sort markers by time as required by lightweight-charts
    markers.sort((a, b) => (a.time > b.time) ? 1 : ((b.time > a.time) ? -1 : 0));
    try {
        candlestickSeries.setMarkers(markers);
    } catch (e) {
        console.warn("Could not set markers (possibly invalid time format):", e);
    }
}

function formatTime(t) {
    if (typeof t === 'number') {
        // Unix timestamp (seconds) to YYYY-MM-DD
        const d = new Date(t * 1000);
        return d.toISOString().split('T')[0];
    }
    return t; // Fallback if already string
}

function renderTable() {
    const tbody = document.querySelector('#annotations-table tbody');
    tbody.innerHTML = '';

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = annotations[viewMode] || [];

    list.forEach((ann, index) => {
        const tr = document.createElement('tr');
        tr.className = 'cursor-pointer';

        // Build Row
        tr.innerHTML = `
            <td class="nav-trigger">${formatTime(ann.start)}</td>
            <td class="nav-trigger">${formatTime(ann.end)}</td>
            <td class="nav-trigger">${ann.pattern}</td>
            <td>
                <input type="number" class="score-input bg-dark text-white border-secondary" 
                       value="${ann.score}" min="1" max="6" data-idx="${index}">
            </td>
            <td>
                <button class="btn btn-danger btn-sm btn-delete" data-idx="${index}">X</button>
            </td>
        `;

        // Navigation Click Event
        tr.querySelectorAll('.nav-trigger').forEach(td => {
            td.addEventListener('click', () => {
                zoomToRange(ann.start, ann.end);
            });
        });

        tbody.appendChild(tr);
    });

    // Score Edit Event
    document.querySelectorAll('.score-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            if (viewMode !== 'human_annotations') return; // Readonly for bot
            const idx = e.target.getAttribute('data-idx');
            annotations.human_annotations[idx].score = parseInt(e.target.value);
            await saveAnnotations();
            drawAnnotations();
        });
    });

    // Delete Event
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (viewMode !== 'human_annotations') return;
            const idx = e.target.getAttribute('data-idx');
            annotations.human_annotations.splice(idx, 1);
            await saveAnnotations();
            renderTable();
            drawAnnotations();
        });
    });
}

function zoomToRange(startStr, endStr) {
    // Determine the logical range.
    // TradingView works best with logical ranges if we want to add padding.
    if (!currentData.length) return;

    let startIndex = currentData.findIndex(d => d.time === startStr);
    let endIndex = currentData.findIndex(d => d.time === endStr);

    if (startIndex !== -1 && endIndex !== -1) {
        let padding = Math.max(5, Math.floor((endIndex - startIndex) * 0.25));

        let startLog = Math.max(0, startIndex - padding);
        let endLog = Math.min(currentData.length - 1, endIndex + padding);

        chart.timeScale().setVisibleLogicalRange({ from: startLog, to: endLog });
        document.getElementById('autoscale-toggle').checked = true;
    }
}

// =====================================
// EVENT LISTENERS
// =====================================
function updateLayout() {
    const wrapper = document.getElementById('chart-wrapper');
    const volumeContainer = document.getElementById('volume-chart-container');
    const priceContainer = document.getElementById('price-chart-container');
    const tableRow = document.getElementById('annotations-table-row');

    // 1. Set wrapper height (Toggle expansion)
    wrapper.style.height = isTableVisible ? '60vh' : '82vh';

    // 2. Toggle Table Visibility (Opacity + Display)
    if (isTableVisible) {
        tableRow.style.display = 'flex';
        setTimeout(() => tableRow.style.opacity = '1', 10);
    } else {
        tableRow.style.opacity = '0';
        setTimeout(() => tableRow.style.display = 'none', 300); // Wait for transition
    }

    // 3. Apply stored ratio to volume container (after short delay for wrapper transition)
    setTimeout(() => {
        const newTotalHeight = wrapper.clientHeight;
        const newVolHeight = newTotalHeight * volumeHeightRatio;
        volumeContainer.style.height = `${newVolHeight}px`;

        // 4. Force chart resize
        if (chart) chart.applyOptions({ width: priceContainer.clientWidth, height: priceContainer.clientHeight });
        if (volumeChart) volumeChart.applyOptions({ width: volumeContainer.clientWidth, height: newVolHeight });
    }, 310);
}

function setupEventListeners() {
    // Table Toggle
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.addEventListener('change', (e) => {
        isTableVisible = e.target.checked;
        localStorage.setItem('tableVisible', isTableVisible);
        updateLayout();
    });

    // Toggle Hotkey (T)
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            isTableVisible = !isTableVisible;
            tableToggle.checked = isTableVisible;
            localStorage.setItem('tableVisible', isTableVisible);
            updateLayout();
        }
    });
    // Navigation
    document.getElementById('btn-prev').addEventListener('click', () => loadTicker((currentIndex - 1 + tickers.length) % tickers.length));
    document.getElementById('btn-next').addEventListener('click', () => loadTicker((currentIndex + 1) % tickers.length));

    // View Toggle
    document.querySelectorAll('input[name="viewToggle"]').forEach(el => {
        el.addEventListener('change', () => {
            renderTable();
            drawAnnotations();
        });
    });

    // Score Buttons (1-6)
    document.querySelectorAll('.btn-score').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (document.getElementById('viewHuman').checked === false) {
                alert("Please switch to 'Human' mode to annotate.");
                return;
            }

            const score = parseInt(e.target.getAttribute('data-score'));

            let start_date, end_date;

            // Priority 1: Shift+Click Selection
            if (selectionRange.start && selectionRange.end) {
                start_date = selectionRange.start;
                end_date = selectionRange.end;
            } else {
                // Priority 2: Visible Range (Legacy behavior from Plotly)
                const range = chart.timeScale().getVisibleRange();
                if (range && range.from && range.to) {
                    const logicalRange = chart.timeScale().getVisibleLogicalRange();
                    if (logicalRange) {
                        const fromIdx = Math.max(0, Math.floor(logicalRange.from));
                        const toIdx = Math.min(currentData.length - 1, Math.ceil(logicalRange.to));
                        const visibleData = currentData.slice(fromIdx, toIdx + 1);

                        if (visibleData.length > 0) {
                            start_date = visibleData[0].time;
                            end_date = visibleData[visibleData.length - 1].time;
                        }
                    }
                }
            }

            if (start_date && end_date) {
                annotations.human_annotations.push({
                    start: start_date,
                    end: end_date,
                    pattern: "vcp",
                    score: score
                });

                // Clear selection and turn off select mode toggle
                selectionRange = { start: null, end: null };
                document.getElementById('select-mode-toggle').checked = false;
                await saveAnnotations();
                renderTable();
                drawAnnotations();
            }
            drawSelectionMarkers();
        });
    });

    // Timeframe Buttons (30D, 60D, 90D)
    document.querySelectorAll('.btn-tf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const daysStr = e.target.getAttribute('data-days'); // not direct 1:1 mapping on trading days vs calendar, but we approximate by data points
            const days = parseInt(daysStr);

            // In trading days, 30 calendar days is roughly 21 trading days. We use direct data points for better accuracy.
            const dataPoints = Math.floor(days * 0.7);

            const logicalRange = chart.timeScale().getVisibleLogicalRange();
            if (logicalRange) {
                chart.timeScale().setVisibleLogicalRange({
                    from: logicalRange.from,
                    to: logicalRange.from + dataPoints
                });
            }
        });
    });

    // Autoscale Toggle
    document.getElementById('autoscale-toggle').addEventListener('change', (e) => {
        const isAuto = e.target.checked;
        candlestickSeries.priceScale().applyOptions({ autoScale: isAuto });
    });
}
