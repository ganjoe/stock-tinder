// =====================================
// SHARED STATE — Single Source of Truth
// =====================================
export const PANE_CATEGORIES = ['price', 'vol', 'norm', 'norm_abs', 'pct_abs', 'pct', 'abs'];

export const CATEGORY_DEFAULTS = {
    price: { chart_type: 'line', scaleMargins: { top: 0.05, bottom: 0.05 } },
    vol: { chart_type: 'bar', scaleMargins: { top: 0.1, bottom: 0 } },
    abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0 } },
    norm: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    norm_abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    pct: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0.1 } },
    pct_abs: { chart_type: 'line', scaleMargins: { top: 0.1, bottom: 0 } },
};

export const MIN_PANE_HEIGHT = 80;
export const RESIZER_HEIGHT = 4;
export const COLOR_HUMAN = 'rgba(0, 255, 0, 0.2)';
export const COLOR_BOT = 'rgba(0, 0, 255, 0.2)';

// Mutable state — exported as object so mutations are shared across modules
export const state = {
    tickers: [],
    allTickers: [],
    currentIndex: 0,
    watchlists: [],
    currentWatchlist: null,
    currentData: [],
    dataCache: new Map(),
    annotations: { human_annotations: [], ai_predictions: [] },
    featureConfig: { aliases: {}, features: {} },
    currentIndicatorData: {},

    // Pane management
    paneRegistry: new Map(),
    paneOrderCounter: 1,

    // Indicator management
    activeIndicators: new Set(),
    indicatorSeriesMap: {},

    // Layout
    isTableVisible: localStorage.getItem('tableVisible') !== 'false',
    selectionSeries: null,
    selectionRange: { start: null, end: null },
    storedPaneHeights: {},

    // Sync
    isSyncingTime: false,
    isSyncingCrosshair: false,
};
