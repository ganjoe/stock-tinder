// =====================================
// CONSTANTS & CATEGORIES
// =====================================
const PANE_CATEGORIES = ['price', 'vol', 'norm', 'norm_abs', 'pct_abs', 'pct', 'abs'];

// Default chart_type and scaleMargins per category
const CATEGORY_DEFAULTS = {
    price: { chart_type: 'line', scaleMargins: { top: 0.05, bottom: 0.05 } },
    vol: { chart_type: 'bar', scaleMargins: { top: 0.1, bottom: 0 } },
    abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0 } },
    norm: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    norm_abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    pct: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    pct_abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0 } },
};

// =====================================
// GLOBAL STATE
// =====================================
let tickers = [];
let allTickers = [];
let currentIndex = 0;
let watchlists = [];
let currentWatchlist = null;
let currentData = [];
let dataCache = new Map();
let annotations = { human_annotations: [], ai_predictions: [] };
let indicatorStyleConfig = { aliases: {}, indicators: {} };
let currentIndicatorData = {};

// Pane management
let paneRegistry = new Map(); // Map<category, PaneState>
let paneOrderCounter = 1;     // Chronological ordering for dynamic panes

// Indicator management
let activeIndicators = new Set();       // Set of indicator labelNames
let indicatorSeriesMap = {};            // fullName -> { series, chartInstance }

// Layout
let isTableVisible = localStorage.getItem('tableVisible') !== 'false';
let selectionSeries = null;
let selectionRange = { start: null, end: null };

// Store pane heights to persist across ticker changes
let storedPaneHeights = {}; // category -> pixel height (for non-price panes)

// Global State for Chart Zoom Persistence
let currentBarsVisible = 90; // Default zoom window (F-UX-040)
let lastTo = null;
let lastWidth = null;

// Sync-Management
let isSyncingTime = false;
let isSyncingCrosshair = false;

const COLOR_HUMAN = 'rgba(0, 255, 0, 0.2)';
const COLOR_BOT = 'rgba(0, 0, 255, 0.2)';

// =====================================
// INITIALIZATION
// =====================================
document.addEventListener("DOMContentLoaded", async () => {
    initCharts();
    await fetchIndicatorConfig();
    renderPaneDropdown();
    await fetchAllTickers();
    await fetchWatchlists();
    setupEventListeners();
});

async function fetchIndicatorConfig() {
    try {
        const res = await fetch('/api/indicator_config');
        indicatorStyleConfig = await res.json();
        if (!indicatorStyleConfig.aliases) indicatorStyleConfig.aliases = {};
        if (!indicatorStyleConfig.indicators) indicatorStyleConfig.indicators = {};
    } catch (e) {
        console.error("Failed to load indicator colors config:", e);
    }
}

// =====================================
// CHART / PANE CREATION
// =====================================

function createChartInstance(container, options = {}) {
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

function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

function initCharts() {
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

    selectionSeries = priceChart.addLineSeries({
        color: 'transparent', lineWidth: 0,
        crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
        autoscaleInfoProvider: () => null,
    });

    const priceBaselineSeries = priceChart.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => null });

    paneRegistry.set('price', {
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

    const volBaselineSeries = volumeChart.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => null });

    paneRegistry.set('vol', {
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

    // Crosshair Sync is now handled via subscribeToSync

    // ---- Window Resize ----
    window.addEventListener('resize', () => resizeAllPanes());

    // ---- Initialize Layout ----
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.checked = isTableVisible;
    updateLayout();

    // Rebuild DOM resizers after initial panes are registered
    rebuildResizersDOM();
    updateLayoutHeights();

    // ---- Chart Click for Selection ----
    priceChart.subscribeClick((param) => {
        if (!param.time || !param.sourceEvent) return;
        const isSelectMode = document.getElementById('select-mode-toggle').checked;
        if (!param.sourceEvent.shiftKey && !isSelectMode) return;
        const clickedTime = param.time;
        if (!selectionRange.start || (selectionRange.start && selectionRange.end)) {
            selectionRange.start = clickedTime;
            selectionRange.end = null;
        } else {
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

// =====================================
// PANE MANAGEMENT
// =====================================

function createPane(category) {
    if (paneRegistry.has(category)) return paneRegistry.get(category);
    if (!PANE_CATEGORIES.includes(category)) {
        console.warn(`[Pane] Unknown category "${category}", skipping.`);
        return null;
    }

    const wrapper = document.getElementById('chart-wrapper');
    const volResizer = document.getElementById('vol-resizer');

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

    const baselineSeries = chartInstance.addLineSeries({ color: 'transparent', lineWidth: 0, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: () => null });

    const paneState = {
        category,
        containerId: container.id,
        chartInstance,
        isVisible: true,
        orderIndex: paneOrderCounter++,
        primarySeries: null,
        baselineSeries: baselineSeries,
    };

    paneRegistry.set(category, paneState);
    subscribeToSync(category, chartInstance, null);

    if (currentData && currentData.length > 0) {
        baselineSeries.setData(currentData.map(d => ({ time: d.time, value: 0 })));
    }

    return paneState;
}

function togglePaneVisibility(category, forceShow) {
    if (category === 'price') return; // Price is always visible

    const show = forceShow !== undefined ? forceShow : !(paneRegistry.has(category) && paneRegistry.get(category).isVisible);

    if (show) {
        let pane = paneRegistry.get(category);
        if (!pane) {
            pane = createPane(category);
        }
        if (!pane) return;

        const container = document.getElementById(pane.containerId);
        if (container) container.style.display = '';
        pane.isVisible = true;

    } else {
        const pane = paneRegistry.get(category);
        if (!pane) return;

        const container = document.getElementById(pane.containerId);
        if (container) {
            storedPaneHeights[category] = container.clientHeight;
            container.style.display = 'none';
        }

        pane.isVisible = false;
        removeIndicatorsForCategory(category);
    }

    rebuildResizersDOM();
    updateLayoutHeights();
    resizeAllPanes();
    syncTimeScales();

    // Sync checkbox in dropdown
    const checkbox = document.getElementById(`pane-toggle-${category}`);
    if (checkbox) checkbox.checked = show;
}

function removeIndicatorsForCategory(category) {
    const pane = paneRegistry.get(category);
    if (!pane || !pane.chartInstance) return;

    const toRemove = [];
    for (const [fullName, entry] of Object.entries(indicatorSeriesMap)) {
        if (entry.category === category) {
            try { pane.chartInstance.removeSeries(entry.series); } catch (e) { }
            toRemove.push(fullName);
        }
    }
    toRemove.forEach(k => {
        delete indicatorSeriesMap[k];
    });

    // Uncheck indicators in dropdown
    for (const name of activeIndicators) {
        const conf = getIndicatorConfig(name);
        if (conf._category === category) {
            activeIndicators.delete(name);
            const cb = document.getElementById(`ind-toggle-${sanitizeId(name)}`);
            if (cb) cb.checked = false;
        }
    }
}

// =====================================
// TIME SCALE SYNC
// =====================================

function subscribeToSync(sourceCategory, sourceChart, sourceSeries) {
    // ---- TIME SCALE SYNC ----
    sourceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (isSyncingTime || !range) return;

        let finalRange = range;
        const currentWidth = range.to - range.from;

        // F-UX-230/240: Right-Anchored Zoom Logic
        // If width changed significantly (zoom detected) and we have a previous anchor
        if (lastWidth !== null && Math.abs(currentWidth - lastWidth) > 0.01) {
            if (lastTo !== null) {
                finalRange = { from: lastTo - currentWidth, to: lastTo };

                // Immediately correct the source chart to stay anchored
                isSyncingTime = true;
                sourceChart.timeScale().setVisibleLogicalRange(finalRange);
                isSyncingTime = false;
            }
        }

        // Update persistence trackers
        lastTo = finalRange.to;
        lastWidth = finalRange.to - finalRange.from;
        currentBarsVisible = lastWidth; // Persist for Ticker Switch

        // Sync other panes
        isSyncingTime = true;
        paneRegistry.forEach((p, cat) => {
            if (cat !== sourceCategory && p.isVisible && p.chartInstance) {
                p.chartInstance.timeScale().setVisibleLogicalRange(finalRange);
            }
        });
        isSyncingTime = false;
    });

    // ---- CROSSHAIR SYNC ----
    sourceChart.subscribeCrosshairMove(param => {
        if (isSyncingCrosshair) return;
        isSyncingCrosshair = true;

        paneRegistry.forEach((targetPane, targetCat) => {
            if (targetCat === sourceCategory || !targetPane.isVisible || !targetPane.chartInstance) return;

            if (!param.time) {
                targetPane.chartInstance.clearCrosshairPosition();
                return;
            }

            let price = null;
            if (targetPane.primarySeries) {
                const d = dataCache.get(param.time);
                if (d) {
                    if (targetCat === 'price') price = d.close;
                    else if (targetCat === 'vol') price = d.value;
                }
            }
            targetPane.chartInstance.setCrosshairPosition(price || 0, param.time, targetPane.primarySeries || null);
        });

        isSyncingCrosshair = false;
    });
}

function syncTimeScales() {
    // Legacy / manual trigger
    const allPanes = Array.from(paneRegistry.values()).filter(p => p.isVisible && p.chartInstance);
    if (allPanes.length < 2) return;
    const range = allPanes[0].chartInstance.timeScale().getVisibleLogicalRange();
    if (!range) return;

    isSyncingTime = true;
    allPanes.forEach(p => {
        p.chartInstance.timeScale().setVisibleLogicalRange(range);
    });
    isSyncingTime = false;
}

// =====================================
// DYNAMIC LAYOUT & RESIZER LOGIC
// =====================================

const MIN_PANE_HEIGHT = 80;
const RESIZER_HEIGHT = 4;

function getVisiblePanesDOM() {
    return Array.from(document.querySelectorAll('.chart-pane-container'))
        .filter(el => el.style.display !== 'none');
}

function rebuildResizersDOM() {
    const wrapper = document.getElementById('chart-wrapper');
    const panes = getVisiblePanesDOM();

    // Remove old resizers
    document.querySelectorAll('.chart-resizer').forEach(el => el.remove());

    // Inject exact number of resizers (n-1) between visible panes
    for (let i = 0; i < panes.length - 1; i++) {
        const paneAbove = panes[i];
        const paneBelow = panes[i + 1];

        const resizer = document.createElement('div');
        resizer.className = 'chart-resizer';
        resizer.id = `resizer-${paneAbove.dataset.category}-${paneBelow.dataset.category}`;

        // Insert right before paneBelow
        wrapper.insertBefore(resizer, paneBelow);

        attachResizerEvents(resizer, paneAbove, paneBelow);
    }
}

function updateLayoutHeights() {
    const wrapper = document.getElementById('chart-wrapper');
    if (!wrapper) return;

    const panes = getVisiblePanesDOM();
    if (panes.length === 0) return;

    const totalHeight = wrapper.clientHeight;
    const resizerSpace = (panes.length - 1) * RESIZER_HEIGHT;
    const availableHeight = totalHeight - resizerSpace;

    // 1. Assign heights based on stored properties OR minimums
    let usedHeight = 0;
    const paneHeights = new Array(panes.length).fill(0);

    panes.forEach((pane, i) => {
        const cat = pane.dataset.category;
        // Priority: 1) Currently explicitly rendered height, 2) Stored memory height, 3) Default 20%
        let requested = pane.style.height ? parseFloat(pane.style.height) : (storedPaneHeights[cat] || (i === 0 ? availableHeight * 0.7 : MIN_PANE_HEIGHT));
        requested = Math.max(MIN_PANE_HEIGHT, requested);
        paneHeights[i] = requested;
        usedHeight += requested;
    });

    // 2. Normalize proportionally to ensure exact 100% fill (availableHeight)
    const scaleFactor = availableHeight / usedHeight;

    panes.forEach((pane, i) => {
        const h = Math.floor(paneHeights[i] * scaleFactor);
        const cat = pane.dataset.category;
        pane.style.height = `${h}px`;
        pane.style.flex = `0 0 ${h}px`;
        storedPaneHeights[cat] = h; // Cache the new height

        // F-UX-060/070: Show timeScale ONLY on the bottom-most visible pane
        const paneState = paneRegistry.get(cat);
        if (paneState && paneState.chartInstance) {
            const isBottom = (i === panes.length - 1);
            paneState.chartInstance.timeScale().applyOptions({ visible: isBottom });
        }
    });
}

function attachResizerEvents(resizer, paneAbove, paneBelow) {
    let isResizing = false;
    let startY = 0;
    let startHeightAbove = 0;
    let startHeightBelow = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
        startY = e.clientY;
        startHeightAbove = paneAbove.clientHeight;
        startHeightBelow = paneBelow.clientHeight;
    });

    const onMouseMove = (e) => {
        if (!isResizing) return;

        let deltaY = e.clientY - startY;

        // Constraints: Do not shrink below MIN_PANE_HEIGHT
        if (startHeightAbove + deltaY < MIN_PANE_HEIGHT) {
            deltaY = MIN_PANE_HEIGHT - startHeightAbove;
        }
        if (startHeightBelow - deltaY < MIN_PANE_HEIGHT) {
            deltaY = startHeightBelow - MIN_PANE_HEIGHT;
        }

        const newAbove = startHeightAbove + deltaY;
        const newBelow = startHeightBelow - deltaY;

        paneAbove.style.height = `${newAbove}px`;
        paneAbove.style.flex = `0 0 ${newAbove}px`;

        paneBelow.style.height = `${newBelow}px`;
        paneBelow.style.flex = `0 0 ${newBelow}px`;

        storedPaneHeights[paneAbove.dataset.category] = newAbove;
        storedPaneHeights[paneBelow.dataset.category] = newBelow;

        resizeAllPanes();
    };

    const onMouseUp = () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    };

    // Attach to document for global tracking during drag
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function resizeAllPanes() {
    for (const pane of paneRegistry.values()) {
        if (!pane.isVisible || !pane.chartInstance) continue;
        const container = document.getElementById(pane.containerId);
        if (!container) continue;
        pane.chartInstance.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
        });
    }
}

// =====================================
// DROPDOWN RENDERERS
// =====================================

function renderPaneDropdown() {
    const menu = document.getElementById('pane-dropdown-menu');
    if (!menu) return;
    menu.innerHTML = '';

    // Show all categories except 'price' (always visible)
    PANE_CATEGORIES.filter(c => c !== 'price').forEach(cat => {
        const div = document.createElement('div');
        div.className = 'form-check';

        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = 'checkbox';
        input.id = `pane-toggle-${cat}`;
        input.checked = cat === 'vol'; // vol is visible by default

        input.addEventListener('change', (e) => {
            togglePaneVisibility(cat, e.target.checked);
        });

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = input.id;
        label.textContent = cat.toUpperCase();

        div.appendChild(input);
        div.appendChild(label);
        menu.appendChild(div);
    });
}

function renderIndicatorDropdown() {
    const menu = document.getElementById('indicator-dropdown-menu');
    if (!menu) return;
    menu.innerHTML = '';

    if (!currentIndicatorData) return;

    const indicators = extractIndicatorLeaves(currentIndicatorData);

    // Group by category
    const grouped = {};
    indicators.forEach(ind => {
        const conf = getIndicatorConfig(ind.indicatorName, ind.sourceType);
        const cat = conf._category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(ind);
    });

    // Render grouped
    for (const cat of PANE_CATEGORIES) {
        const items = grouped[cat];
        if (!items || items.length === 0) continue;

        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.textContent = cat.toUpperCase();
        menu.appendChild(header);

        items.forEach(ind => {
            const div = document.createElement('div');
            div.className = 'form-check';

            const input = document.createElement('input');
            input.className = 'form-check-input';
            input.type = 'checkbox';
            input.id = `ind-toggle-${sanitizeId(ind.indicatorName)}`;
            input.checked = activeIndicators.has(ind.indicatorName);

            input.addEventListener('change', (e) => {
                toggleIndicator(ind.indicatorName, ind.fullName, ind.dataArray, e.target.checked, ind.sourceType);
            });

            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = input.id;

            // Color swatch
            const conf = getIndicatorConfig(ind.indicatorName);
            const color = resolveColor(conf.color);
            label.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;"></span>${ind.indicatorName}`;

            div.appendChild(input);
            div.appendChild(label);
            menu.appendChild(div);
        });
    }
}

// =====================================
// INDICATOR MANAGEMENT
// =====================================

function extractIndicatorLeaves(indicatorData) {
    const leaves = [];
    if (!indicatorData || typeof indicatorData !== 'object') return leaves;

    function traverse(obj, currentPath, sourceType) {
        if (Array.isArray(obj)) {
            const indicatorName = currentPath.slice(1).join('_');
            const fullName = currentPath.join('_');
            leaves.push({ indicatorName, fullName, sourceType, dataArray: obj });
            return;
        }
        if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
                traverse(obj[key], currentPath.concat(key), sourceType);
            }
        }
    }

    Object.keys(indicatorData).forEach(key => {
        const sourceType = key === 'volume' ? 'volume' : 'stock';
        traverse(indicatorData[key], [key], sourceType);
    });

    return leaves;
}

function getIndicatorConfig(labelName, sourceType) {
    let matched = indicatorStyleConfig.indicators && indicatorStyleConfig.indicators[labelName];

    if (!matched && indicatorStyleConfig.indicators) {
        for (const key of Object.keys(indicatorStyleConfig.indicators)) {
            if (labelName.startsWith(key + '_') || labelName === key) {
                matched = indicatorStyleConfig.indicators[key];
                break;
            }
        }
    }

    const conf = matched ? { ...matched } : {};

    let cat = conf.pane_category || (sourceType === 'volume' ? 'vol' : 'price');
    if (!PANE_CATEGORIES.includes(cat)) {
        console.warn(`[Indicator] "${labelName}" has unknown pane_category "${cat}", defaulting to "price".`);
        cat = 'price';
    }
    conf._category = cat;

    if (!conf.chart_type) {
        conf.chart_type = (CATEGORY_DEFAULTS[cat] || { chart_type: 'line' }).chart_type;
    }

    return conf;
}

function sanitizeId(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toggleIndicator(labelName, fullName, dataArray, isChecked, sourceType) {
    if (isChecked) {
        activeIndicators.add(labelName);
        drawIndicatorSeries(labelName, fullName, dataArray, sourceType);
    } else {
        activeIndicators.delete(labelName);
        removeIndicatorSeries(fullName);
    }
}

function drawIndicatorSeries(labelName, fullName, dataArray, sourceType) {
    if (indicatorSeriesMap[fullName]) return;

    const conf = getIndicatorConfig(labelName, sourceType);
    const category = conf._category;

    // Auto-open pane if needed (F-UI-160)
    togglePaneVisibility(category, true);

    const pane = paneRegistry.get(category);
    if (!pane || !pane.isVisible || !pane.chartInstance) {
        console.warn(`[Indicator] No pane for category "${category}", skipping "${labelName}".`);
        return;
    }

    const chartInstance = pane.chartInstance;

    // Styling
    let color = resolveColor(conf.color) || '#FFFFFF';
    let lineWidth = conf.thickness || 2;
    let lineStyle = 0;
    if (conf.style === 'dotted') lineStyle = 1;
    if (conf.style === 'dashed') lineStyle = 2;

    // Fallback color if no config
    if (!conf.color) {
        let hash = 0;
        for (let i = 0; i < labelName.length; i++) hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
        color = `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
    }

    // Create series based on chart_type
    let series;
    const chartType = conf.chart_type || 'line';

    if (chartType === 'bar') {
        series = chartInstance.addHistogramSeries({
            color: color,
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
        });
    } else if (chartType === 'scatter') {
        series = chartInstance.addLineSeries({
            color: color,
            lineWidth: 0,
            lineVisible: false,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            pointMarkersVisible: true,
            pointMarkersRadius: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
    } else {
        // line (default)
        series = chartInstance.addLineSeries({
            color: color,
            lineWidth: lineWidth,
            lineStyle: lineStyle,
            crosshairMarkerVisible: false,
            priceScaleId: 'right',
        });
    }

    // Align data
    const alignedData = alignIndicatorData(currentData, dataArray);
    series.setData(alignedData);

    indicatorSeriesMap[fullName] = { series, chartInstance, category, labelName };
}

function removeIndicatorSeries(fullName) {
    const entry = indicatorSeriesMap[fullName];
    if (!entry) return;
    try { entry.chartInstance.removeSeries(entry.series); } catch (e) { }
    delete indicatorSeriesMap[fullName];
}

function alignIndicatorData(priceData, indicatorValues) {
    const result = [];
    for (let i = 0; i < priceData.length && i < indicatorValues.length; i++) {
        if (indicatorValues[i] !== null && indicatorValues[i] !== undefined) {
            result.push({ time: priceData[i].time, value: indicatorValues[i] });
        }
    }
    return result;
}

function resolveColor(colorNameOrHex) {
    if (!colorNameOrHex) return '#FFFFFF';
    if (indicatorStyleConfig.aliases && indicatorStyleConfig.aliases[colorNameOrHex]) {
        return indicatorStyleConfig.aliases[colorNameOrHex];
    }
    return colorNameOrHex;
}

// =====================================
// API CALLS
// =====================================
async function fetchAllTickers() {
    const res = await fetch('/api/tickers');
    const data = await res.json();
    allTickers = data.tickers || [];
    const datalist = document.getElementById('ticker-datalist');
    datalist.innerHTML = '';
}

async function fetchWatchlists() {
    const res = await fetch('/api/watchlists');
    const data = await res.json();
    watchlists = data.watchlists || [];

    const wsSelect = document.getElementById('watchlist-select');
    wsSelect.innerHTML = '';

    if (watchlists.length === 0) {
        tickers = allTickers;
        if (tickers.length > 0) await loadTicker(0);
        return;
    }

    watchlists.forEach(ws => {
        const opt = document.createElement('option');
        opt.value = ws;
        opt.textContent = ws;
        wsSelect.appendChild(opt);
    });

    wsSelect.value = watchlists[0];
    await loadSelectedWatchlist(watchlists[0]);
}

async function loadSelectedWatchlist(name) {
    currentWatchlist = name;
    const res = await fetch(`/api/watchlist/${name}`);
    const data = await res.json();
    tickers = data.tickers || [];

    const tSelect = document.getElementById('ticker-select');
    tSelect.innerHTML = '';
    tickers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tSelect.appendChild(opt);
    });

    if (tickers.length > 0) {
        await loadTicker(0);
    } else {
        const pricePane = paneRegistry.get('price');
        const volPane = paneRegistry.get('vol');
        if (pricePane && pricePane.primarySeries) pricePane.primarySeries.setData([]);
        if (volPane && volPane.primarySeries) volPane.primarySeries.setData([]);
    }
}

async function loadSpecificTicker(ticker) {
    const tSelect = document.getElementById('ticker-select');
    const newIndex = tickers.indexOf(ticker);
    if (newIndex !== -1) {
        currentIndex = newIndex;
        if (tSelect) tSelect.value = ticker;
    }

    // T-002 Capture Zoom State & Reset UI
    const pricePane = paneRegistry.get('price');
    if (pricePane && pricePane.chartInstance) {
        const range = pricePane.chartInstance.timeScale().getVisibleLogicalRange();
        if (range) {
            currentBarsVisible = range.to - range.from;
            currentBarsVisible = Math.max(10, currentBarsVisible);
        }
    }

    // F-UX-080: Reset Autoscale on ticker change
    const autoScaleToggle = document.getElementById('autoscale-toggle');
    if (autoScaleToggle) {
        autoScaleToggle.checked = true;
    }

    try {
        const resData = await fetch(`/api/chart/${ticker}`);
        if (!resData.ok) throw new Error("Chart data not found");
        currentData = await resData.json();

        try {
            const resInd = await fetch(`/api/indicators/${ticker}`);
            currentIndicatorData = await resInd.json();
        } catch (e) {
            console.error("Failed to load indicator data:", e);
            currentIndicatorData = {};
        }

        dataCache.clear();
        currentData.forEach(d => dataCache.set(d.time, d));

        const baselineData = currentData.map(d => ({ time: d.time, value: 0 }));
        paneRegistry.forEach(pane => {
            if (pane.baselineSeries) {
                pane.baselineSeries.setData(baselineData);
            }
        });

        const resAnno = await fetch(`/api/annotations/${ticker}`);
        annotations = await resAnno.json();

        renderChart();
        renderIndicatorDropdown();
        redrawActiveIndicators();
        renderTable();
    } catch (e) {
        console.error("Failed to load specific ticker:", e);
    }
}

async function loadTicker(index) {
    if (index < 0 || index >= tickers.length) return;
    currentIndex = index;
    const ticker = tickers[currentIndex];
    await loadSpecificTicker(ticker);
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
        const pricePane = paneRegistry.get('price');
        const volPane = paneRegistry.get('vol');
        if (pricePane && pricePane.primarySeries) pricePane.primarySeries.setData([]);
        if (volPane && volPane.primarySeries) volPane.primarySeries.setData([]);
        return;
    }

    const pricePane = paneRegistry.get('price');
    const volPane = paneRegistry.get('vol');

    const candleData = currentData.map(d => ({
        time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    }));

    const volData = currentData.map(d => ({
        time: d.time,
        value: d.value,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));

    pricePane.primarySeries.setData(candleData);
    if (volPane && volPane.primarySeries) volPane.primarySeries.setData(volData);
    selectionSeries.setData(candleData.map(d => ({ time: d.time, value: d.close })));

    selectionRange = { start: null, end: null };
    drawSelectionMarkers();
    drawAnnotations();

    // Auto-scale
    const isAuto = document.getElementById('autoscale-toggle').checked;
    applyAutoScaleToAll(isAuto);

    // T-003 Apply right-aligned Range Logic
    const totalBars = currentData.length;
    if (totalBars > 0) {
        const targetBars = Math.min(currentBarsVisible, totalBars);
        const newTo = totalBars - 1;
        const newFrom = newTo - targetBars;
        if (pricePane && pricePane.chartInstance) {
            pricePane.chartInstance.timeScale().setVisibleLogicalRange({ from: newFrom, to: newTo });
        }
    }
}

function redrawActiveIndicators() {
    // Remove all existing indicator series
    for (const [fullName, entry] of Object.entries(indicatorSeriesMap)) {
        try { entry.chartInstance.removeSeries(entry.series); } catch (e) { }
    }
    indicatorSeriesMap = {};

    if (!currentIndicatorData) return;

    // Re-traverse and re-draw active ones
    const indicators = extractIndicatorLeaves(currentIndicatorData);
    indicators.forEach(ind => {
        if (activeIndicators.has(ind.indicatorName)) {
            drawIndicatorSeries(ind.indicatorName, ind.fullName, ind.dataArray, ind.sourceType);
        }
    });
}

function drawAnnotations() {
    const pricePane = paneRegistry.get('price');
    if (!pricePane || !pricePane.primarySeries) return;

    pricePane.primarySeries.setMarkers([]);

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = annotations[viewMode] || [];
    const color = viewMode === 'human_annotations' ? '#00FF00' : '#0000FF';

    let markers = [];
    list.forEach(ann => {
        markers.push({
            time: ann.start, position: 'aboveBar', color: color,
            shape: 'arrowDown', text: `[${ann.score}] Start`
        });
        markers.push({
            time: ann.end, position: 'belowBar', color: color,
            shape: 'arrowUp', text: `End`
        });
    });

    markers.sort((a, b) => (a.time > b.time) ? 1 : ((b.time > a.time) ? -1 : 0));
    try { pricePane.primarySeries.setMarkers(markers); } catch (e) {
        console.warn("Could not set markers:", e);
    }
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

function formatTime(t) {
    if (typeof t === 'number') {
        const d = new Date(t * 1000);
        return d.toISOString().split('T')[0];
    }
    return t;
}

function renderTable() {
    const tbody = document.querySelector('#annotations-table tbody');
    tbody.innerHTML = '';

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = annotations[viewMode] || [];

    list.forEach((ann, index) => {
        const tr = document.createElement('tr');
        tr.className = 'cursor-pointer';
        tr.innerHTML = `
            <td class="nav-trigger">${formatTime(ann.start)}</td>
            <td class="nav-trigger">${formatTime(ann.end)}</td>
            <td class="nav-trigger">${ann.pattern}</td>
            <td><input type="number" class="score-input bg-dark text-white border-secondary"
                       value="${ann.score}" min="1" max="6" data-idx="${index}"></td>
            <td><button class="btn btn-danger btn-sm btn-delete" data-idx="${index}">X</button></td>
        `;
        tr.querySelectorAll('.nav-trigger').forEach(td => {
            td.addEventListener('click', () => zoomToRange(ann.start, ann.end));
        });
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.score-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            if (viewMode !== 'human_annotations') return;
            const idx = e.target.getAttribute('data-idx');
            annotations.human_annotations[idx].score = parseInt(e.target.value);
            await saveAnnotations();
            drawAnnotations();
        });
    });

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
    if (!currentData.length) return;
    let startIndex = currentData.findIndex(d => d.time === startStr);
    let endIndex = currentData.findIndex(d => d.time === endStr);

    if (startIndex !== -1 && endIndex !== -1) {
        let padding = Math.max(5, Math.floor((endIndex - startIndex) * 0.25));
        let startLog = Math.max(0, startIndex - padding);
        let endLog = Math.min(currentData.length - 1, endIndex + padding);

        const pricePane = paneRegistry.get('price');
        if (pricePane && pricePane.chartInstance) {
            pricePane.chartInstance.timeScale().setVisibleLogicalRange({ from: startLog, to: endLog });
        }
        document.getElementById('autoscale-toggle').checked = true;
        applyAutoScaleToAll(true);
    }
}

// =====================================
// AUTO-SCALE & PANNING
// =====================================

function applyAutoScaleToAll(isAuto) {
    for (const pane of paneRegistry.values()) {
        if (!pane.isVisible || !pane.chartInstance) continue;

        // Apply to all price scales
        try {
            const catDefaults = CATEGORY_DEFAULTS[pane.category] || CATEGORY_DEFAULTS.abs;
            const margins = isAuto ? catDefaults.scaleMargins : { top: 0.05, bottom: 0.05 };

            // Right scale
            pane.chartInstance.applyOptions({
                rightPriceScale: {
                    autoScale: isAuto,
                    scaleMargins: margins,
                },
                handleScale: {
                    axisPressedMouseMove: {
                        time: true,
                        price: !isAuto,
                    },
                },
                handleScroll: {
                    mouseWheel: true,
                    pressedMouseMove: true,
                },
            });

            // LOGIC FIX FOR F-UI-095: Force immediate Y-Axis snap
            if (isAuto && pane.chartInstance.priceScale('right')) {
                pane.chartInstance.priceScale('right').applyOptions({ autoScale: true });
            }
        } catch (e) { }
    }
}

// =====================================
// LAYOUT
// =====================================
function updateLayout() {
    const wrapper = document.getElementById('chart-wrapper');
    const tableRow = document.getElementById('annotations-table-row');

    wrapper.style.height = isTableVisible ? '60vh' : '82vh';

    if (isTableVisible) {
        tableRow.style.display = 'flex';
        setTimeout(() => tableRow.style.opacity = '1', 10);
    } else {
        tableRow.style.opacity = '0';
        setTimeout(() => tableRow.style.display = 'none', 300);
    }

    setTimeout(() => {
        updateLayoutHeights();
        resizeAllPanes();
    }, 310);
}

// =====================================
// EVENT LISTENERS
// =====================================
function setupEventListeners() {
    // Table Toggle
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.addEventListener('change', (e) => {
        isTableVisible = e.target.checked;
        localStorage.setItem('tableVisible', isTableVisible);
        updateLayout();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 't' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            isTableVisible = !isTableVisible;
            tableToggle.checked = isTableVisible;
            localStorage.setItem('tableVisible', isTableVisible);
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
        const newIndex = tickers.indexOf(selectedTicker);
        if (newIndex !== -1) await loadTicker(newIndex);
    });

    // Ticker search
    document.getElementById('ticker-search').addEventListener('input', (e) => {
        const searchValue = e.target.value.toUpperCase();
        const datalist = document.getElementById('ticker-datalist');
        datalist.innerHTML = '';
        if (searchValue.length > 0) {
            const matches = allTickers.filter(t => t.includes(searchValue));
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
        if (allTickers.includes(searchValue)) {
            await loadSpecificTicker(searchValue);
            e.target.value = '';
            document.getElementById('ticker-datalist').innerHTML = '';
        } else {
            const matches = allTickers.filter(t => t.includes(searchValue));
            if (matches.length === 1) {
                await loadSpecificTicker(matches[0]);
                e.target.value = '';
                document.getElementById('ticker-datalist').innerHTML = '';
            }
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

    // Score Buttons
    document.querySelectorAll('.btn-score').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!document.getElementById('viewHuman').checked) {
                alert("Please switch to 'Human' mode to annotate.");
                return;
            }
            const score = parseInt(e.target.getAttribute('data-score'));
            let start_date, end_date;

            if (selectionRange.start && selectionRange.end) {
                start_date = selectionRange.start;
                end_date = selectionRange.end;
            } else {
                const pricePane = paneRegistry.get('price');
                if (pricePane && pricePane.chartInstance) {
                    const range = pricePane.chartInstance.timeScale().getVisibleRange();
                    if (range && range.from && range.to) {
                        const logicalRange = pricePane.chartInstance.timeScale().getVisibleLogicalRange();
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
            }

            if (start_date && end_date) {
                annotations.human_annotations.push({
                    start: start_date, end: end_date, pattern: "vcp", score: score
                });
                selectionRange = { start: null, end: null };
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
            const pricePane = paneRegistry.get('price');
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

    // Autoscale Toggle (F-UI-090)
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
