// =====================================
// API CLIENT
// =====================================
import { state } from './state.js';
import { renderIndicatorDropdown, redrawActiveIndicators } from './featureManager.js';
import { drawAnnotations } from './annotationManager.js';
import { renderTable } from './annotationManager.js';
import { applyAutoScaleToAll } from './utils.js';
import { drawSelectionMarkers } from './annotationManager.js';

export async function fetchAllTickers() {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    state.allTickers = data.tickers || [];
    const datalist = document.getElementById('ticker-datalist');
    datalist.innerHTML = '';
}

export async function fetchChartConfig() {
    try {
        const res = await fetch('/api/chart_config');
        state.chartConfig = await res.json();
    } catch (e) {
        console.error("Failed to load chart config:", e);
    }
}

export async function fetchWatchlists() {
    const res = await fetch('/api/watchlists');
    const data = await res.json();
    state.watchlists = data.watchlists || [];

    const wsSelect = document.getElementById('watchlist-select');
    wsSelect.innerHTML = '';

    if (state.watchlists.length === 0) {
        state.tickers = state.allTickers;
        if (state.tickers.length > 0) await loadTicker(0);
        return;
    }

    state.watchlists.forEach(ws => {
        const opt = document.createElement('option');
        opt.value = ws;
        opt.textContent = ws;
        wsSelect.appendChild(opt);
    });

    wsSelect.value = state.watchlists[0];
    await loadSelectedWatchlist(state.watchlists[0]);
}

export async function loadSelectedWatchlist(name) {
    state.currentWatchlist = name;
    const res = await fetch(`/api/watchlist/${name}`);
    const data = await res.json();
    state.tickers = data.tickers || [];

    const tSelect = document.getElementById('ticker-select');
    tSelect.innerHTML = '';
    state.tickers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tSelect.appendChild(opt);
    });

    if (state.tickers.length > 0) {
        await loadTicker(0);
    } else {
        const pricePane = state.paneRegistry.get('price');
        const volPane = state.paneRegistry.get('vol');
        if (pricePane && pricePane.primarySeries) pricePane.primarySeries.setData([]);
        if (volPane && volPane.primarySeries) volPane.primarySeries.setData([]);
    }
}

export async function loadSpecificTicker(ticker) {
    const tSelect = document.getElementById('ticker-select');
    const newIndex = state.tickers.indexOf(ticker);
    if (newIndex !== -1) {
        state.currentIndex = newIndex;
        if (tSelect) tSelect.value = ticker;
    }

    // Capture range before switching if locked
    if (state.isXLocked) {
        const pricePane = state.paneRegistry.get('price');
        if (pricePane && pricePane.chartInstance) {
            state.savedTimeRange = pricePane.chartInstance.timeScale().getVisibleRange();
        }
    }

    try {
        const resData = await fetch(`/api/chart/${ticker}`);
        if (!resData.ok) throw new Error("Chart data not found");
        state.currentData = await resData.json();

        try {
            const resInd = await fetch(`/api/indicators/${ticker}`);
            state.currentIndicatorData = await resInd.json();
        } catch (e) {
            console.error("Failed to load indicator data:", e);
            state.currentIndicatorData = {};
        }

        state.dataCache.clear();
        state.currentData.forEach(d => state.dataCache.set(d.time, d));

        const baselineData = state.currentData.map(d => ({ time: d.time, value: 0 }));
        state.paneRegistry.forEach(pane => {
            if (pane.baselineSeries) {
                pane.baselineSeries.setData(baselineData);
            }
        });

        const resAnno = await fetch(`/api/annotations/${ticker}`);
        state.annotations = await resAnno.json();

        renderChart();
        renderIndicatorDropdown();
        redrawActiveIndicators();
        renderTable();
    } catch (e) {
        console.error("Failed to load specific ticker:", e);
    }
}

export async function loadTicker(index) {
    if (index < 0 || index >= state.tickers.length) return;
    state.currentIndex = index;
    const ticker = state.tickers[state.currentIndex];
    await loadSpecificTicker(ticker);
}

export async function saveAnnotations() {
    const ticker = state.tickers[state.currentIndex];
    await fetch(`/api/annotations/${ticker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.annotations)
    });
}

// =====================================
// RENDERING
// =====================================
export function renderChart() {
    if (!state.currentData || state.currentData.length === 0) {
        const pricePane = state.paneRegistry.get('price');
        const volPane = state.paneRegistry.get('vol');
        if (pricePane && pricePane.primarySeries) pricePane.primarySeries.setData([]);
        if (volPane && volPane.primarySeries) volPane.primarySeries.setData([]);
        return;
    }

    const pricePane = state.paneRegistry.get('price');
    const volPane = state.paneRegistry.get('vol');

    const candleData = state.currentData.map(d => ({
        time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    }));

    const volData = state.currentData.map(d => ({
        time: d.time,
        value: d.value,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));

    pricePane.primarySeries.setData(candleData);
    if (volPane && volPane.primarySeries) volPane.primarySeries.setData(volData);
    state.selectionSeries.setData(candleData.map(d => ({ time: d.time, value: d.close })));

    state.selectionRange = { start: null, end: null };
    drawSelectionMarkers();
    drawAnnotations();

    const isAuto = document.getElementById('autoscale-toggle').checked;
    applyAutoScaleToAll(isAuto);

    // X-Axis Handling (F-UI-510, F-UI-520, F-UI-530)
    if (state.isXLocked && state.savedTimeRange && state.savedTimeRange.from) {
        for (const pane of state.paneRegistry.values()) {
            if (pane.isVisible && pane.chartInstance) {
                pane.chartInstance.timeScale().setVisibleRange(state.savedTimeRange);
            }
        }
    } else {
        // Default: Show configurable candle count and add right padding (F-UI-520, F-UI-525)
        const visibleCount = state.chartConfig.defaultVisibleCandles || 126;
        const total = state.currentData.length;
        const offset = state.chartConfig.rightOffsetPercent || 20;

        const padding = Math.floor(visibleCount * (offset / (100 - offset)));
        for (const pane of state.paneRegistry.values()) {
            if (pane.isVisible && pane.chartInstance) {
                pane.chartInstance.timeScale().applyOptions({ rightOffset: padding });
                pane.chartInstance.timeScale().setVisibleLogicalRange({
                    from: total - visibleCount,
                    to: total - 1 + padding
                });
            }
        }
    }
}
