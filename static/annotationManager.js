// =====================================
// ANNOTATION MANAGEMENT
// =====================================
import { state } from './state.js';
import { formatTime } from './utils.js';

export function drawAnnotations() {
    const pricePane = state.paneRegistry.get('price');
    if (!pricePane || !pricePane.primarySeries) return;

    pricePane.primarySeries.setMarkers([]);

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = state.annotations[viewMode] || [];
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

export function drawSelectionMarkers() {
    let markers = [];
    if (state.selectionRange.start) {
        markers.push({ time: state.selectionRange.start, position: 'belowBar', color: '#ffcc00', shape: 'arrowUp', text: 'Select Start' });
    }
    if (state.selectionRange.end) {
        markers.push({ time: state.selectionRange.end, position: 'aboveBar', color: '#ffcc00', shape: 'arrowDown', text: 'Select End' });
    }
    state.selectionSeries.setMarkers(markers);
}

export function renderTable() {
    const tbody = document.querySelector('#annotations-table tbody');
    tbody.innerHTML = '';

    const viewMode = document.getElementById('viewHuman').checked ? 'human_annotations' : 'ai_predictions';
    const list = state.annotations[viewMode] || [];

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
            const { saveAnnotations } = await import('./apiClient.js');
            const idx = e.target.getAttribute('data-idx');
            state.annotations.human_annotations[idx].score = parseInt(e.target.value);
            await saveAnnotations();
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (viewMode !== 'human_annotations') return;
            const { saveAnnotations } = await import('./apiClient.js');
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.annotations.human_annotations.splice(idx, 1);
            await saveAnnotations();
            renderTable();
            drawAnnotations();
        });
    });
}

export function zoomToRange(startStr, endStr) {
    const pricePane = state.paneRegistry.get('price');
    if (!pricePane || !pricePane.chartInstance || !state.currentData || state.currentData.length === 0) return;

    let startIdx = state.currentData.findIndex(d => d.time >= startStr);
    let endIdx = state.currentData.findIndex(d => d.time >= endStr);

    if (startIdx < 0) startIdx = 0;
    if (endIdx < 0) endIdx = state.currentData.length - 1;

    const padding = Math.max(5, Math.floor((endIdx - startIdx) * 0.2));
    const from = Math.max(0, startIdx - padding);
    const to = Math.min(state.currentData.length - 1, endIdx + padding);

    pricePane.chartInstance.timeScale().setVisibleLogicalRange({ from, to });
}
