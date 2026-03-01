# IMP_requirements.md - Resizer & Dynamic Pane Layout

## Executive Summary
This document provides the implementation blueprint for the dynamic charting architecture requested in the `requirements.md`, specifically addressing requirements `F-UI-130`, `F-UI-180`, and `F-UI-190`. The goal is to enforce a layout that always fills 100% of the available vertical space (`F-UI-130`), uses discrete drag handles that only affect the adjacent panes (`F-UI-180`), and maintains these bindings robustly as panes are added or removed dynamically (`F-UI-190`).

---

## PART 1: The System Skeleton (Shared Context)

The charting UI is built using HTML/CSS Flexbox inside the `#chart-wrapper` container. Currently, the price pane (`#price-chart-container`) uses `flex: 1 1 auto` to fill space, while other panes use fixed pixel heights. 
To satisfy the requirements, all panes will transition to explicit pixel heights based on the total available container height. The Flexbox will use `flex-direction: column` without any `flex-grow` (all panes are `flex: 0 0 [height]px`) to ensure exact height control during resizing.

### Data Structures & Constants

```javascript
/**
 * Height Configuration Limits
 */
const MIN_PANE_HEIGHT = 80; // Minimum height in pixels for any pane

/**
 * Registry of all active panes in order.
 * Array of category strings (e.g. ['price', 'norm_abs', 'pct', 'vol']).
 * Derived dynamically by examining the DOM or iterating paneRegistry.
 */
let orderedActivePanes = []; 
```

### Logical Layout Concept
1. **Container Dimensions**: `#chart-wrapper` has a fixed height (e.g., `82vh` or `60vh` when table is visible).
2. **Total Size Distribution**: The sum of all pane heights must exactly match (containerHeight - totalResizerHeight).
3. **Resizer DOM Elements**: A `.chart-resizer` div must exist exactly *between* every two adjacent pane containers.

---

## PART 2: Implementation Work Orders

These tasks describe the specific implementations needed by the Junior AI.

### Task ID: [T-UI-010]
**Target File**: `static/app.js`
**Description**: Implement `updateLayoutHeights()` to distribute space when panes are added or removed (F-UI-130).
**Context**: This function will be called immediately after a pane is added to or removed from the DOM.

**Code Stub:**
```javascript
function updateLayoutHeights() {
    /**
     * Distributes available vertical height among all visible panes.
     * Guarantees 100% space utilization with no gaps.
     */
    // TODO: Implement logic
}
```
**Algo/Logic Steps:**
1. Get the exact height of the `#chart-wrapper` container.
2. Find all visible `.chart-pane-container` elements in DOM order. Store in an array.
3. Find all visible `.chart-resizer` elements and subtract their combined height from the total container height -> `availableHeight`.
4. If a new pane was added, assign it `min(150, availableHeight / num_panes)` pixels. Subtract this from the largest existing pane to make room.
5. If a pane was removed, distribute its former height proportionally across the remaining visible panes.
6. Check `storedPaneHeights` first. If a pane was hidden then shown again, try to restore its old height if room permits.
7. Apply the new heights explicitly via `element.style.flex = "0 0 XYZpx"` and `element.style.height = "XYZpx"`.
8. Call `resizeAllPanes()` when done.


### Task ID: [T-UI-020]
**Target File**: `static/app.js`
**Description**: Inject resizers correctly when creating panes (F-UI-190).
**Context**: Replaces the static `setupResizer` calls currently scattered in `createPane`.

**Code Stub:**
```javascript
function rebuildResizersDOM() {
    /**
     * Ensures exactly one resizer exists between each visible pane.
     * Cleans up orphaned or duplicate resizers.
     */
    // TODO: Implement logic
}
```
**Algo/Logic Steps:**
1. Find all visible `.chart-pane-container` objects inside `#chart-wrapper` in DOM order.
2. Remove any existing `.chart-resizer` elements from `#chart-wrapper`.
3. Loop through the visible panes from index `0` to `n-2`.
4. For each pane, create a new `div` with class `.chart-resizer`.
5. Set its ID to something deterministic: e.g., `resizer-${paneAbove.dataset.category}-${paneBelow.dataset.category}`.
6. Insert the resizer into the DOM exactly between `paneAbove` and `paneBelow`.
7. Call `attachResizerEvents(resizerElement, paneAbove, paneBelow)`.


### Task ID: [T-UI-030]
**Target File**: `static/app.js`
**Description**: Complete the proportional adjacent drag logic (F-UI-180).
**Context**: Completely replace the old `setupResizer` logic. It now acts dynamically on the exactly linked DOM objects.

**Code Stub:**
```javascript
function attachResizerEvents(resizer, paneAbove, paneBelow) {
    /**
     * Attaches drag events. Moving the resizer explicitly shrinks one pane 
     * and grows the other by the exact pixel delta of the mouse move.
     */
    // TODO: Implement logic
}
```
**Algo/Logic Steps:**
1. On `mousedown` on the resizer:
   - `e.preventDefault()`. Set a global state flag `isResizing = true`.
   - Store the starting `e.clientY`.
   - Store the starting exact pixel heights of `paneAbove` and `paneBelow` (using `getBoundingClientRect().height`).
2. Add global `mousemove` listener (bound to document):
   - Calculate `deltaY = e.clientY - startY`.
   - New height for `paneAbove` = `startY_AboveHeight + deltaY`.
   - New height for `paneBelow` = `startY_BelowHeight - deltaY`.
   - Enforce `MIN_PANE_HEIGHT` constraint bounds. If `deltaY` pushes a pane below this limit, clamp `deltaY` so neither pane shrinks too small.
   - Apply the newly calculated heights via `.style.flex` and `.style.height` to both containers.
   - Update `storedPaneHeights[category]` for both.
   - Call `resizeAllPanes()` to trigger LightweightCharts canvas resize.
3. On global `mouseup`:
   - Set `isResizing = false`.
   - Remove listeners.

### Task ID: [T-UI-040]
**Target File**: `static/app.js`
**Description**: Integrate the layout engine into the existing pane visibility functions.
**Context**: `togglePaneVisibility()` must call the newly defined DOM rebuilds.

**Code Stub:**
*(Modify existing `togglePaneVisibility` and `createPane`)*
**Algo/Logic Steps:**
1. In `createPane()`, do not create a resizer or do height math manually. Just create the pane container and append it before `#volume-chart-container` (or in correct order).
2. At the end of `togglePaneVisibility()`, call `rebuildResizersDOM()` followed by `updateLayoutHeights()`.
3. This guarantees that whenever a pane is toggled on or off, the DOM is rebuilt sequentially, the resizers are re-attached to exactly the adjacent visible siblings, and the height math evaluates to 100%.

---
**Input Data (Requirements)**
See `requirements.md` (F-UI-130, F-UI-180, F-UI-190).
