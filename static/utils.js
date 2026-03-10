// =====================================
// UTILITY FUNCTIONS
// =====================================
import { PANE_CATEGORIES, state } from './state.js';

export function deepMerge(target, source) {
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

export function sanitizeId(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function formatTime(t) {
    if (typeof t === 'number') {
        const d = new Date(t * 1000);
        return d.toISOString().split('T')[0];
    }
    return t;
}

export function renderPaneDropdown() {
    const menu = document.getElementById('pane-dropdown-menu');
    if (!menu) return;
    menu.innerHTML = '';

    PANE_CATEGORIES.filter(c => c !== 'price').forEach(cat => {
        const div = document.createElement('div');
        div.className = 'form-check';

        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = 'checkbox';
        input.id = `pane-toggle-${cat}`;
        input.checked = cat === 'vol';

        // Import togglePaneVisibility dynamically to avoid circular deps
        input.addEventListener('change', async (e) => {
            const { togglePaneVisibility } = await import('./chartManager.js');
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

export function applyAutoScaleToAll(isAuto) {
    state.paneRegistry.forEach((pane) => {
        if (!pane.isVisible || !pane.chartInstance) return;

        if (pane.category === 'price') {
            pane.chartInstance.priceScale('right').applyOptions({
                autoScale: isAuto,
            });
        } else {
            pane.chartInstance.priceScale('right').applyOptions({
                autoScale: isAuto,
            });
        }

        if (isAuto) {
            pane.chartInstance.timeScale().scrollToRealTime();
        }
    });
}
