// =====================================
// MAIN ENTRY POINT
// =====================================
import { initCharts } from './chartManager.js';
import { fetchFeatureConfig } from './featureManager.js';
import { renderPaneDropdown } from './utils.js';
import { fetchAllTickers, fetchWatchlists } from './apiClient.js';
import { setupEventListeners } from './eventHandlers.js';
import { rebuildResizersDOM, updateLayoutHeights, updateLayout } from './layoutManager.js';
import { state } from './state.js';

document.addEventListener("DOMContentLoaded", async () => {
    initCharts();
    await fetchFeatureConfig();
    const { fetchChartConfig } = await import('./apiClient.js');
    await fetchChartConfig();
    renderPaneDropdown();
    await fetchAllTickers();
    await fetchWatchlists();
    setupEventListeners();

    // Initialize Layout
    const tableToggle = document.getElementById('table-toggle');
    tableToggle.checked = state.isTableVisible;
    updateLayout();
    rebuildResizersDOM();
    updateLayoutHeights();
});
