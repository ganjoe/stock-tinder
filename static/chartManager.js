// =====================================
// CHART / PANE MANAGEMENT
// =====================================
import { PANE_CATEGORIES, CATEGORY_DEFAULTS, MIN_PANE_HEIGHT, state } from './state.js';
import { deepMerge } from './utils.js';
import { rebuildResizersDOM, updateLayoutHeights, resizeAllPanes } from './layoutManager.js';

export function createChartInstance(container, options = {}) {
    if (typeof window.LightweightCharts === 'undefined') return null;

    const defaults = {
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
        crosshair: { mode: 1 },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        timeScale: {
            visible: false,
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: false,
        },
    };

    const merged = deepMerge(defaults, options);
    return window.LightweightCharts.createChart(container, merged);
}

export function initCharts() {
    if (typeof window.LightweightCharts === 'undefined') {
        setTimeout(initCharts, 100);
        return;
    }

    // ---- PRICE PANE ----
    const priceContainer = document.getElementById('price-chart-container');
    const priceChart = createChartInstance(priceContainer);

    const candlestickSeries = priceChart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
        borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    state.selectionSeries = priceChart.addLineSeries({
        color: 'transparent', lineWidth: 0,
        crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    const priceBaselineSeries = priceChart.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });

    state.paneRegistry.set('price', {
        category: 'price',
        containerId: 'price-chart-container',
        chartInstance: priceChart,
        isVisible: true,
        orderIndex: 0,
        primarySeries: candlestickSeries,
        baselineSeries: priceBaselineSeries,
        resizerId: null,
    });
    subscribeToSync('price', priceChart, candlestickSeries);

    // ---- VOLUME PANE ----
    const volumeContainer = document.getElementById('volume-chart-container');
    const volumeChart = createChartInstance(volumeContainer, {
        rightPriceScale: {
            autoScale: true,
            scaleMargins: { top: 0.1, bottom: 0 },
        },
        timeScale: {
            visible: true,
            timeVisible: false,
            minBarSpacing: 0.5,
            tickMarkFormatter: (time) => {
                const date = new Date(time * 1000);
                const month = date.toLocaleString('en-US', { month: 'short' });
                const year = date.getFullYear().toString().slice(-2);
                return `${month} '${year}`;
            },
        },
        handleScale: { axisPressedMouseMove: { time: true, price: true } },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });

    const volumeSeries = volumeChart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
    });
    volumeSeries.priceScale().applyOptions({
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.05 },
    });

    const volBaselineSeries = volumeChart.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });

    state.paneRegistry.set('vol', {
        category: 'vol',
        containerId: 'volume-chart-container',
        chartInstance: volumeChart,
        isVisible: true,
        orderIndex: 9999,
        primarySeries: volumeSeries,
        baselineSeries: volBaselineSeries,
        resizerId: 'vol-resizer',
    });
    subscribeToSync('vol', volumeChart, volumeSeries);

    // ---- Window Resize ----
    window.addEventListener('resize', () => resizeAllPanes());

    // ---- Chart Click for Selection ----
    priceChart.subscribeClick((param) => {
        if (!param.time || !param.sourceEvent) return;
        const isSelectMode = document.getElementById('select-mode-toggle').checked;
        if (!param.sourceEvent.shiftKey && !isSelectMode) return;
        const clickedTime = param.time;
        if (!state.selectionRange.start || (state.selectionRange.start && state.selectionRange.end)) {
            state.selectionRange.start = clickedTime;
            state.selectionRange.end = null;
        } else {
            if (clickedTime < state.selectionRange.start) {
                state.selectionRange.end = state.selectionRange.start;
                state.selectionRange.start = clickedTime;
            } else {
                state.selectionRange.end = clickedTime;
            }
        }
        // Lazy import to avoid circular dependency
        import('./annotationManager.js').then(m => m.drawSelectionMarkers());
    });
}

export function createPane(category) {
    if (state.paneRegistry.has(category)) return state.paneRegistry.get(category);
    if (!PANE_CATEGORIES.includes(category)) {
        console.warn(`[Pane] Unknown category "${category}", skipping.`);
        return null;
    }

    const wrapper = document.getElementById('chart-wrapper');

    // Create container
    const container = document.createElement('div');
    container.id = `${category}-chart-container`;
    container.className = 'chart-pane-container';
    container.style.flex = `0 0 ${MIN_PANE_HEIGHT}px`;
    container.dataset.category = category;

    // Label
    const label = document.createElement('span');
    label.className = 'pane-label';
    label.textContent = category.toUpperCase();
    container.appendChild(label);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pane-close-btn';
    closeBtn.dataset.closeCategory = category;
    closeBtn.title = `Close ${category} pane`;
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => togglePaneVisibility(category, false));
    container.appendChild(closeBtn);

    // Insert before volume (always last)
    const volContainer = document.getElementById('volume-chart-container');
    wrapper.insertBefore(container, volContainer);

    // Create chart
    const catDefaults = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS.abs;
    const chartInstance = createChartInstance(container, {
        rightPriceScale: {
            autoScale: true,
            scaleMargins: catDefaults.scaleMargins,
        },
    });

    const baselineSeries = chartInstance.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });

    const paneState = {
        category,
        containerId: container.id,
        chartInstance,
        isVisible: true,
        orderIndex: state.paneOrderCounter++,
        primarySeries: null,
        baselineSeries: baselineSeries,
    };

    state.paneRegistry.set(category, paneState);
    subscribeToSync(category, chartInstance, null);

    if (state.currentData && state.currentData.length > 0) {
        baselineSeries.setData(state.currentData.map(d => ({ time: d.time, value: 0 })));
    }

    return paneState;
}

export function togglePaneVisibility(category, forceShow) {
    if (category === 'price') return;

    const show = forceShow !== undefined ? forceShow : !(state.paneRegistry.has(category) && state.paneRegistry.get(category).isVisible);

    if (show) {
        let pane = state.paneRegistry.get(category);
        if (!pane) {
            pane = createPane(category);
        }
        if (!pane) return;

        const container = document.getElementById(pane.containerId);
        if (container) container.style.display = '';
        pane.isVisible = true;
    } else {
        const pane = state.paneRegistry.get(category);
        if (!pane) return;

        const container = document.getElementById(pane.containerId);
        if (container) {
            state.storedPaneHeights[category] = container.clientHeight;
            container.style.display = 'none';
        }

        pane.isVisible = false;
        removeIndicatorsForCategory(category);
    }

    rebuildResizersDOM();
    updateLayoutHeights();
    resizeAllPanes();
    syncTimeScales();

    const checkbox = document.getElementById(`pane-toggle-${category}`);
    if (checkbox) checkbox.checked = show;
}

export function removeIndicatorsForCategory(category) {
    const pane = state.paneRegistry.get(category);
    if (!pane || !pane.chartInstance) return;

    const toRemove = [];
    for (const [fullName, entry] of Object.entries(state.indicatorSeriesMap)) {
        if (entry.category === category) {
            try { pane.chartInstance.removeSeries(entry.series); } catch (e) { }
            toRemove.push(fullName);
        }
    }
    toRemove.forEach(k => {
        delete state.indicatorSeriesMap[k];
    });

    for (const name of state.activeIndicators) {
        // Check if this feature's root pane matches this category
        const conf = state.featureConfig.features[name];
        if (conf && conf.pane === category) {
            state.activeIndicators.delete(name);
            const cb = document.getElementById(`ind-toggle-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
            if (cb) cb.checked = false;
        }
    }
}

// =====================================
// TIME SCALE SYNC
// =====================================
export function subscribeToSync(sourceCategory, sourceChart, sourceSeries) {
    sourceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (state.isSyncingTime || !range) return;
        state.isSyncingTime = true;

        state.paneRegistry.forEach((p, cat) => {
            if (cat !== sourceCategory && p.isVisible && p.chartInstance) {
                p.chartInstance.timeScale().setVisibleLogicalRange(range);
            }
        });

        state.isSyncingTime = false;
    });

    sourceChart.subscribeCrosshairMove(param => {
        if (state.isSyncingCrosshair) return;
        state.isSyncingCrosshair = true;

        state.paneRegistry.forEach((targetPane, targetCat) => {
            if (targetCat === sourceCategory || !targetPane.isVisible || !targetPane.chartInstance) return;

            if (!param.time) {
                targetPane.chartInstance.clearCrosshairPosition();
                return;
            }

            let price = null;
            if (targetPane.primarySeries) {
                const d = state.dataCache.get(param.time);
                if (d) {
                    if (targetCat === 'price') price = d.close;
                    else if (targetCat === 'vol') price = d.value;
                }
            }
            targetPane.chartInstance.setCrosshairPosition(price || 0, param.time, targetPane.primarySeries || null);
        });

        state.isSyncingCrosshair = false;
    });
}

export function syncTimeScales() {
    const allPanes = Array.from(state.paneRegistry.values()).filter(p => p.isVisible && p.chartInstance);
    if (allPanes.length < 2) return;
    const range = allPanes[0].chartInstance.timeScale().getVisibleLogicalRange();
    if (!range) return;

    state.isSyncingTime = true;
    allPanes.forEach(p => {
        p.chartInstance.timeScale().setVisibleLogicalRange(range);
    });
    state.isSyncingTime = false;
}
