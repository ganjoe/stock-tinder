# Implementation Blueprint: Dynamic Chart Layout & Auto-Scale (Junior AI)

*(Previous tasks T-UI-010 to T-UI-040 completed)*

## PART 2: Implementation Work Orders (Phase 3: Auto-Scale Snap)

**Task ID:** `T-UI-050`
**Target File:** `static/app.js`
**Description:** Implement requirement `F-UI-095` (Instant Y-Axis Auto-Scale). When the user toggles "Auto" to ON, the Y-axis must immediately snap to fit the visible data. To achieve this in Lightweight Charts without resetting the X-axis (time), you must explicitly invoke `applyOptions({ autoScale: true })` directly on each active chart's right price scale.

**Code Stub:**
```javascript
function applyAutoScaleToAll(isAuto) {
    for (const pane of paneRegistry.values()) {
        if (!pane.isVisible || !pane.chartInstance) continue;

        try {
            const catDefaults = CATEGORY_DEFAULTS[pane.category] || CATEGORY_DEFAULTS.abs;
            const margins = isAuto ? catDefaults.scaleMargins : { top: 0.05, bottom: 0.05 };

            // Apply standard options
            pane.chartInstance.applyOptions({
                rightPriceScale: {
                    autoScale: isAuto,
                    scaleMargins: margins,
                },
                handleScroll: {
                    mouseWheel: true,
                    pressedMouseMove: {
                        time: true,
                        price: !isAuto,
                    },
                },
            });

            // LOGIC FIX FOR F-UI-095
            // If isAuto is true, force an immediate vertical snap by re-asserting autoScale on the price scale itself.
            if (isAuto) {
                // TODO: Call priceScale('right').applyOptions({ autoScale: true })
            }
        } catch (e) { }
    }
}
```

**Algo/Logic Steps:**
1. In `applyAutoScaleToAll`, after `pane.chartInstance.applyOptions`, check if `isAuto` is `true`.
2. If true, explicitly call `pane.chartInstance.priceScale('right').applyOptions({ autoScale: true });`. This tells the engine to immediately discard any manual vertical overrides from previous drag actions and fit the currently visible Y-values, satisfying `F-UI-095`.
