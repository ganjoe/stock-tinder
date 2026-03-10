// =====================================
// FEATURE / INDICATOR MANAGEMENT
// =====================================
import { PANE_CATEGORIES, CATEGORY_DEFAULTS, state } from './state.js';
import { sanitizeId } from './utils.js';
import { togglePaneVisibility } from './chartManager.js';

export async function fetchFeatureConfig() {
    try {
        const res = await fetch('/api/feature_config');
        state.featureConfig = await res.json();
        if (!state.featureConfig.aliases) state.featureConfig.aliases = {};
        if (!state.featureConfig.features) state.featureConfig.features = {};
    } catch (e) {
        console.error("Failed to load feature config:", e);
    }
}

export function resolveColor(colorNameOrHex) {
    if (!colorNameOrHex) return '#FFFFFF';
    if (state.featureConfig.aliases && state.featureConfig.aliases[colorNameOrHex]) {
        return state.featureConfig.aliases[colorNameOrHex];
    }
    return colorNameOrHex;
}

export function extractIndicatorLeaves(indicatorData) {
    const leaves = [];
    if (!indicatorData || typeof indicatorData !== 'object') return leaves;

    function traverse(obj, currentPath, sourceType) {
        if (Array.isArray(obj)) {
            const indicatorName = currentPath.join('_');
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

export function resolveFeatureRenderUnits(featureName, indicatorDataTree) {
    const rootConfig = state.featureConfig.features[featureName];
    if (!rootConfig) return [];

    const leaves = extractIndicatorLeaves(indicatorDataTree);
    const results = [];

    leaves.forEach(leaf => {
        if (leaf.indicatorName === featureName || leaf.indicatorName.startsWith(featureName + '_')) {
            let childKey = null;
            if (leaf.indicatorName.startsWith(featureName + '_')) {
                childKey = leaf.indicatorName.slice(featureName.length + 1);
            }

            const childConfig = (childKey && rootConfig[childKey]) ? rootConfig[childKey] : {};

            // Property Inheritance (F-ARCH-430)
            const merged = { ...rootConfig, ...childConfig };

            // Strict Pane Validation (F-ARCH-420)
            if (!merged.pane) return;

            results.push({
                groupKey: featureName,
                seriesKey: leaf.fullName,
                pane: merged.pane,
                color: resolveColor(merged.color),
                style: merged.style || 'solid',
                chart_type: merged.chart_type || (CATEGORY_DEFAULTS[merged.pane] || { chart_type: 'line' }).chart_type,
                thickness: merged.thickness || 2,
                dataArray: leaf.dataArray
            });
        }
    });

    return results;
}

export function renderIndicatorDropdown() {
    const menu = document.getElementById('indicator-dropdown-menu');
    if (!menu) return;
    menu.innerHTML = '';

    if (!state.featureConfig.features || !state.currentIndicatorData) return;

    // Group root features by their pane
    const grouped = {};
    Object.keys(state.featureConfig.features).forEach(featureName => {
        const conf = state.featureConfig.features[featureName];
        const cat = conf.pane;
        if (!cat) return;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(featureName);
    });

    for (const cat of PANE_CATEGORIES) {
        const featureNames = grouped[cat];
        if (!featureNames || featureNames.length === 0) continue;

        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.textContent = cat.toUpperCase();
        menu.appendChild(header);

        featureNames.forEach(featureName => {
            const conf = state.featureConfig.features[featureName];
            const div = document.createElement('div');
            div.className = 'form-check';

            const input = document.createElement('input');
            input.className = 'form-check-input';
            input.type = 'checkbox';
            input.id = `ind-toggle-${sanitizeId(featureName)}`;
            input.checked = state.activeIndicators.has(featureName);

            input.addEventListener('change', (e) => {
                toggleFeatureGroup(featureName, e.target.checked);
            });

            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = input.id;

            const color = resolveColor(conf.color);
            label.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px;"></span>${featureName}`;

            div.appendChild(input);
            div.appendChild(label);
            menu.appendChild(div);
        });
    }
}

export function toggleFeatureGroup(featureName, isChecked) {
    if (isChecked) {
        const units = resolveFeatureRenderUnits(featureName, state.currentIndicatorData);
        units.forEach(unit => drawIndicatorSeries(unit));
        state.activeIndicators.add(featureName);
    } else {
        const toRemove = [];
        for (const [fullName, entry] of Object.entries(state.indicatorSeriesMap)) {
            if (entry.groupKey === featureName) {
                toRemove.push(fullName);
            }
        }
        toRemove.forEach(removeIndicatorSeries);
        state.activeIndicators.delete(featureName);
    }
}

export function drawIndicatorSeries(unit) {
    if (state.indicatorSeriesMap[unit.seriesKey]) return;

    const category = unit.pane;
    togglePaneVisibility(category, true);

    const pane = state.paneRegistry.get(category);
    if (!pane || !pane.isVisible || !pane.chartInstance) return;

    const chartInstance = pane.chartInstance;

    let lineStyle = 0;
    if (unit.style === 'dotted') lineStyle = 1;
    if (unit.style === 'dashed') lineStyle = 2;

    let series;
    if (unit.chart_type === 'bar') {
        series = chartInstance.addHistogramSeries({
            color: unit.color,
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
        });
    } else if (unit.chart_type === 'scatter') {
        series = chartInstance.addLineSeries({
            color: unit.color,
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
        series = chartInstance.addLineSeries({
            color: unit.color,
            lineWidth: unit.thickness,
            lineStyle: lineStyle,
            crosshairMarkerVisible: false,
            priceScaleId: 'right',
        });
    }

    const alignedData = alignIndicatorData(state.currentData, unit.dataArray);
    series.setData(alignedData);

    state.indicatorSeriesMap[unit.seriesKey] = {
        series,
        chartInstance,
        category,
        groupKey: unit.groupKey
    };
}

export function removeIndicatorSeries(fullName) {
    const entry = state.indicatorSeriesMap[fullName];
    if (!entry) return;
    try { entry.chartInstance.removeSeries(entry.series); } catch (e) { }
    delete state.indicatorSeriesMap[fullName];
}

export function alignIndicatorData(priceData, indicatorValues) {
    const result = [];
    for (let i = 0; i < priceData.length && i < indicatorValues.length; i++) {
        if (indicatorValues[i] !== null && indicatorValues[i] !== undefined) {
            result.push({ time: priceData[i].time, value: indicatorValues[i] });
        }
    }
    return result;
}

export function redrawActiveIndicators() {
    for (const [fullName, entry] of Object.entries(state.indicatorSeriesMap)) {
        try { entry.chartInstance.removeSeries(entry.series); } catch (e) { }
    }
    state.indicatorSeriesMap = {};

    if (!state.currentIndicatorData) return;

    state.activeIndicators.forEach(featureName => {
        const units = resolveFeatureRenderUnits(featureName, state.currentIndicatorData);
        units.forEach(unit => drawIndicatorSeries(unit));
    });
}
