# IMP_brainstorming_indicators.md

## PART 1: The System Skeleton (Shared Context)

Die Datenstrukturen und Interfaces für das dynamische Indikatoren-Dropdown und die Kategorisierung basieren auf den aus der API bezogenen Daten (`indikator.json`) sowie der Styling-Konfiguration (`indikator_colors.json`).

```javascript
/**
 * @typedef {Object} IndicatorStyleConfig
 * @property {Record<string, string>} aliases - Color aliases (e.g. "red" -> "#FF0000")
 * @property {Record<string, IndicatorConfig>} indicators - Styling configurations keyed by indicator name/prefix
 */

/**
 * @typedef {Object} IndicatorConfig
 * @property {string} color - Color name or hex code
 * @property {number} thickness - Line thickness
 * @property {string} style - Line style (e.g., "dashed", "solid")
 * @property {string} type - Target pane category (e.g., "price", "vol", "norm")
 * @property {string} [chart_type] - Render type from F-ARCH-035 (e.g., "line", "bar")
 * @property {string} [_category] - Internally resolved category (fallback included)
 */

/**
 * @typedef {Object} IndicatorLeaf
 * @property {string} indicatorName - The base name of the indicator (e.g. "stoch_10_1")
 * @property {string} fullName - The full logical path (e.g. "stock_stoch_10_1")
 * @property {string} sourceType - "stock" or "volume"
 * @property {Array<number|null>} dataArray - The actual data array
 */
```

## PART 2: Implementation Work Orders

**Task ID:** `T-UI-141`
**Target File:** `static/app.js`
**Description:** Implement the dynamic indicator extraction (F-UI-141). Extract all leaf arrays from the hierarchical indicator data.

**Context:** Uses `IndicatorLeaf` from Part 1 to represent the flattened structure of the data.

**Code Stub:**
```javascript
function extractIndicatorLeaves(indicatorData) {
    /**
     * Traverses the indicatorData object and returns a flat array of IndicatorLeaf objects.
     * @param {Object} indicatorData - The currentIndicatorData from the API
     * @returns {IndicatorLeaf[]} - Array of all found leaf indicators
     */
    const leaves = [];
    // TODO: Implement recursive traversal to find all arrays
    return leaves;
}
```
**Algo/Logic Steps:**
1. Check if `indicatorData` is falsy or not an object. If so, return an empty array.
2. Define a nested recursive function `traverse(obj, currentPath, sourceType)` that pushes leaf arrays containing metric values to the outer array `leaves`.
3. If an array is found: Set `indicatorName` to the last element of `currentPath` joined by `_` (e.g. `path.slice(1).join('_')`). Set `fullName` to `currentPath.join('_')`. Push an object with `{ indicatorName, fullName, sourceType, dataArray }` to the `leaves` array.
4. If it is a nested object, loop keys and recurse.
5. Iterate over root keys (e.g., "stock" and "volume"). Set `sourceType` based on whether the key equals "volume" or "stock" and trigger the `traverse`.
6. Return `leaves`.


---

**Task ID:** `T-UI-143_144`
**Target File:** `static/app.js`
**Description:** Implement indicator configuration resolution with exact match, prefix matching, and safe fallbacks (F-UI-143, F-UI-144).

**Context:** Uses `IndicatorConfig` to define styling and behavior logic.

**Code Stub:**
```javascript
function getIndicatorConfig(labelName, sourceType) {
    /**
     * Resolves the styling and category configuration for a given indicator.
     * @param {string} labelName - The name from the leaf node (e.g., "stoch_10_1")
     * @param {string} sourceType - "stock" or "volume"
     * @returns {IndicatorConfig} - The resolved configuration with _category and chart_type set.
     */
    // TODO: Implement exact match, prefix match, and fallback logic
    return {};
}
```
**Algo/Logic Steps:**
1. Check for an exact match in `indicatorStyleConfig.indicators[labelName]`.
2. If no exact match: Loop through the keys of `indicatorStyleConfig.indicators`. If `labelName` starts with `key + '_'` or equals `key`, then use that configuration.
3. Fallback: If no match at all is found, instantiate an empty object `{}`.
4. Clone the configuration using `{ ...matched }` or similar, to avoid modifying reference data.
5. Identify resolving category (`_category`): If the matched config has a `type` property, use it. Else, fall back to "vol" if `sourceType === 'volume'`, otherwise "price".
6. Validate the resolved category against `PANE_CATEGORIES` (or generic fallback to "price" and emit a console warning if unknown). Assign the final valid result to `_category`.
7. Configure `chart_type`: Assign from matched config `chart_type`. If missing, default to `CATEGORY_DEFAULTS[_category].chart_type` or "line". (Based on F-ARCH-035).
8. Return the fully formed configuration object.


---

**Task ID:** `T-UI-141_Render`
**Target File:** `static/app.js`
**Description:** Wire everything together to group and render the dropdown menu correctly.

**Context:** Replaces the inline generation flow in `renderIndicatorDropdown` with the isolated helper functions.

**Code Stub:**
```javascript
function renderIndicatorDropdown() {
    // TODO: Update DOM with checkboxes, grouped by resolving category.
}
```
**Algo/Logic Steps:**
1. Check if `currentIndicatorData` exists. Clear `#indicator-dropdown-menu`.
2. Call `extractIndicatorLeaves(currentIndicatorData)` to get a flat list of `IndicatorLeaf` objects.
3. Group the indicators by their resolved categories: Initialize an empty grouped object `{}`. For each indicator, call `getIndicatorConfig(ind.indicatorName, ind.sourceType)`. Extract the `_category` value, create an array in the grouped object if it doesn't exist, and push the indicator to it.
4. Iterate strictly over `PANE_CATEGORIES` (like PRICE, VOL, NORM, etc.) to guarantee order.
5. For each category: If there are grouped indicators for this category, create a DOM header (`<div class="dropdown-header">CATEGORY_NAME</div>`) and append it to the menu.
6. For each indicator in the category under that header: Create a DOM Checkbox using `ind-toggle-${sanitizeId(ind.indicatorName)}`. The checked state should match `activeIndicators.has(ind.indicatorName)`. Attach an event listener for `toggleIndicator`. Add the color swatch to the label from `getIndicatorConfig`. Append to the menu.
