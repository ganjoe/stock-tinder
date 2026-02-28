// =====================================
// GLOBAL STATE
// =====================================
let tickers = [];
let currentIndex = 0;
let chart = null;
let candlestickSeries = null;
let volumeSeries = null;
let currentData = [];
let annotations = { human_annotations: [], ai_predictions: [] };
let annotationLines = [];

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
    const container = document.getElementById('chart-container');

    // Ensure LightweightCharts is loaded
    if (typeof window.LightweightCharts === 'undefined') {
        setTimeout(initChart, 100);
        return;
    }

    chart = window.LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
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

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
            type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
            top: 0.8,
            bottom: 0,
        },
    });

    // Handle Resize
    window.addEventListener('resize', () => {
        if (chart && container) {
            chart.applyOptions({
                width: container.clientWidth,
                height: container.clientHeight
            });
        }
    });
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

    // Draw Annotations (as colored background ranges or lines)
    drawAnnotations();

    // Auto-scale logic
    const isAuto = document.getElementById('autoscale-toggle').checked;
    candlestickSeries.priceScale().applyOptions({ autoScale: isAuto });

    // Always fit content on new load so the new ticker is fully visible
    chart.timeScale().fitContent();
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
            <td class="nav-trigger">${ann.start}</td>
            <td class="nav-trigger">${ann.end}</td>
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
function setupEventListeners() {
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
            const range = chart.timeScale().getVisibleRange();

            if (range && range.from && range.to) {
                // Determine exact day strings from the data
                // getVisibleRange returns timestamps
                // We map this back to our currentData
                const visibleData = currentData.filter(d =>
                    (typeof d.time === 'string' ? new Date(d.time).getTime() / 1000 : d.time) >=
                    (typeof range.from === 'string' ? new Date(range.from).getTime() / 1000 : range.from) &&
                    (typeof d.time === 'string' ? new Date(d.time).getTime() / 1000 : d.time) <=
                    (typeof range.to === 'string' ? new Date(range.to).getTime() / 1000 : range.to)
                );

                if (visibleData.length > 0) {
                    const start_date = visibleData[0].time;
                    const end_date = visibleData[visibleData.length - 1].time;

                    annotations.human_annotations.push({
                        start: start_date,
                        end: end_date,
                        pattern: "vcp",
                        score: score
                    });

                    await saveAnnotations();
                    renderTable();
                    drawAnnotations();
                }
            }
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
        if (isAuto) {
            // Optional: reset the view slightly if turning back on so it snaps
            chart.timeScale().fitContent();
        }
    });
}
