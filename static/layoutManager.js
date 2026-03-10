// =====================================
// DYNAMIC LAYOUT & RESIZER LOGIC
// =====================================
import { MIN_PANE_HEIGHT, RESIZER_HEIGHT, state } from './state.js';

export function getVisiblePanesDOM() {
    return Array.from(document.querySelectorAll('.chart-pane-container'))
        .filter(el => el.style.display !== 'none');
}

export function rebuildResizersDOM() {
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

        wrapper.insertBefore(resizer, paneBelow);
        attachResizerEvents(resizer, paneAbove, paneBelow);
    }
}

export function updateLayoutHeights() {
    const wrapper = document.getElementById('chart-wrapper');
    if (!wrapper) return;

    const panes = getVisiblePanesDOM();
    if (panes.length === 0) return;

    const totalHeight = wrapper.clientHeight;
    const resizerSpace = (panes.length - 1) * RESIZER_HEIGHT;
    const availableHeight = totalHeight - resizerSpace;

    let usedHeight = 0;
    const paneHeights = new Array(panes.length).fill(0);

    panes.forEach((pane, i) => {
        const cat = pane.dataset.category;
        let requested = pane.style.height ? parseFloat(pane.style.height) : (state.storedPaneHeights[cat] || (i === 0 ? availableHeight * 0.7 : MIN_PANE_HEIGHT));
        requested = Math.max(MIN_PANE_HEIGHT, requested);
        paneHeights[i] = requested;
        usedHeight += requested;
    });

    const scaleFactor = availableHeight / usedHeight;

    panes.forEach((pane, i) => {
        const h = Math.floor(paneHeights[i] * scaleFactor);
        pane.style.height = `${h}px`;
        pane.style.flex = `0 0 ${h}px`;
        state.storedPaneHeights[pane.dataset.category] = h;
    });
}

export function attachResizerEvents(resizer, paneAbove, paneBelow) {
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

        state.storedPaneHeights[paneAbove.dataset.category] = newAbove;
        state.storedPaneHeights[paneBelow.dataset.category] = newBelow;

        resizeAllPanes();
    };

    const onMouseUp = () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

export function resizeAllPanes() {
    for (const pane of state.paneRegistry.values()) {
        if (!pane.isVisible || !pane.chartInstance) continue;
        const container = document.getElementById(pane.containerId);
        if (!container) continue;
        pane.chartInstance.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
        });
    }
}

export function updateLayout() {
    const tableRow = document.getElementById('annotations-table-row');
    const chartWrapper = document.getElementById('chart-wrapper');

    chartWrapper.style.height = state.isTableVisible ? '60vh' : '82vh';

    if (state.isTableVisible) {
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
