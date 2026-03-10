// =====================================
// EVENT LISTENERS
// =====================================
import { state } from './state.js';
import { updateLayout } from './layoutManager.js';
import { loadSelectedWatchlist, loadTicker, loadSpecificTicker, saveAnnotations } from './apiClient.js';
import { renderTable, drawAnnotations, drawSelectionMarkers } from './annotationManager.js';
import { applyAutoScaleToAll } from './utils.js';
import { togglePaneVisibility } from './chartManager.js';

export function setupEventListeners() {
    // Table Toggle
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.addEventListener('change', (e) => {
        state.isTableVisible = e.target.checked;
        localStorage.setItem('tableVisible', state.isTableVisible);
        updateLayout();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            state.isTableVisible = !state.isTableVisible;
            tableToggle.checked = state.isTableVisible;
            localStorage.setItem('tableVisible', state.isTableVisible);
            updateLayout();
        }
    });

    // Watchlist
    document.getElementById('watchlist-select').addEventListener('change', async (e) => {
        await loadSelectedWatchlist(e.target.value);
    });

    // Ticker
    document.getElementById('ticker-select').addEventListener('change', async (e) => {
        const selectedTicker = e.target.value;
        const newIndex = state.tickers.indexOf(selectedTicker);
        if (newIndex !== -1) await loadTicker(newIndex);
    });

    // Ticker search
    document.getElementById('ticker-search').addEventListener('input', (e) => {
        const searchValue = e.target.value.toUpperCase();
        const datalist = document.getElementById('ticker-datalist');
        datalist.innerHTML = '';
        if (searchValue.length > 0) {
            const matches = state.allTickers.filter(t => t.includes(searchValue));
            const limit = Math.min(matches.length, 50);
            for (let i = 0; i < limit; i++) {
                const opt = document.createElement('option');
                opt.value = matches[i];
                datalist.appendChild(opt);
            }
        }
    });

    document.getElementById('ticker-search').addEventListener('change', async (e) => {
        const searchValue = e.target.value.toUpperCase();
        e.target.value = searchValue;
        if (searchValue.length === 0) return;
        if (state.allTickers.includes(searchValue)) {
            await loadSpecificTicker(searchValue);
            e.target.value = '';
            document.getElementById('ticker-datalist').innerHTML = '';
        } else {
            const matches = state.allTickers.filter(t => t.includes(searchValue));
            if (matches.length === 1) {
                await loadSpecificTicker(matches[0]);
                e.target.value = '';
                document.getElementById('ticker-datalist').innerHTML = '';
            }
        }
    });

    // Navigation
    document.getElementById('btn-prev').addEventListener('click', () => loadTicker((state.currentIndex - 1 + state.tickers.length) % state.tickers.length));
    document.getElementById('btn-next').addEventListener('click', () => loadTicker((state.currentIndex + 1) % state.tickers.length));

    // View Toggle
    document.querySelectorAll('input[name="viewToggle"]').forEach(el => {
        el.addEventListener('change', () => {
            renderTable();
            drawAnnotations();
        });
    });

    // Score Buttons
    document.querySelectorAll('.btn-score').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!document.getElementById('viewHuman').checked) {
                alert("Please switch to 'Human' mode to annotate.");
                return;
            }
            const score = parseInt(e.target.getAttribute('data-score'));
            let start_date, end_date;

            if (state.selectionRange.start && state.selectionRange.end) {
                start_date = state.selectionRange.start;
                end_date = state.selectionRange.end;
            } else {
                const pricePane = state.paneRegistry.get('price');
                if (pricePane && pricePane.chartInstance) {
                    const range = pricePane.chartInstance.timeScale().getVisibleRange();
                    if (range && range.from && range.to) {
                        const logicalRange = pricePane.chartInstance.timeScale().getVisibleLogicalRange();
                        if (logicalRange) {
                            const fromIdx = Math.max(0, Math.floor(logicalRange.from));
                            const toIdx = Math.min(state.currentData.length - 1, Math.ceil(logicalRange.to));
                            const visibleData = state.currentData.slice(fromIdx, toIdx + 1);
                            if (visibleData.length > 0) {
                                start_date = visibleData[0].time;
                                end_date = visibleData[visibleData.length - 1].time;
                            }
                        }
                    }
                }
            }

            if (start_date && end_date) {
                state.annotations.human_annotations.push({
                    start: start_date, end: end_date, pattern: "vcp", score: score
                });
                state.selectionRange = { start: null, end: null };
                document.getElementById('select-mode-toggle').checked = false;
                await saveAnnotations();
                renderTable();
                drawAnnotations();
            }
            drawSelectionMarkers();
        });
    });

    // Timeframe Buttons
    document.querySelectorAll('.btn-tf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = parseInt(e.target.getAttribute('data-days'));
            const dataPoints = Math.floor(days * 0.7);
            const pricePane = state.paneRegistry.get('price');
            if (pricePane && pricePane.chartInstance) {
                const logicalRange = pricePane.chartInstance.timeScale().getVisibleLogicalRange();
                if (logicalRange) {
                    pricePane.chartInstance.timeScale().setVisibleLogicalRange({
                        from: logicalRange.from,
                        to: logicalRange.from + dataPoints
                    });
                }
            }
        });
    });

    // Autoscale Toggle
    document.getElementById('autoscale-toggle').addEventListener('change', (e) => {
        applyAutoScaleToAll(e.target.checked);
    });

    // Close buttons on panes
    document.querySelectorAll('.pane-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.closeCategory;
            if (cat) togglePaneVisibility(cat, false);
        });
    });
}
