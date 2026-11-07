# Phase 1: Visual de-slopping, viewport decoupling, SCADA layout

Branch: `overhaul/phase-1-scada-ui` (from the merged Phase 0)

## Context
Read `CLAUDE.md` (especially sections 3, 5 and 9) and `docs/overhaul/DECISIONS.md` (D5, D6, D8, D9, D10).
Keep the **physics math and audio engine intact**. This phase changes presentation and layout, plus one small engine addition
(`Simulator.reset()`). The source plan for this phase is `docs/overhaul/master-plan-original.md`, Phase 1; this file refines it.

## Tasks

### 1. Design tokens and typography
- New `src/styles/tokens.css` with CSS variables for the palette in CLAUDE.md section 9; import it from `src/index.css`. Extend `tailwind.config.js` colours
  (`canvas`, `panel`, `line`, `ok`, `warn`, `crit`, `accent`). Remove `pulse-ring`, the glow keyframes, custom shadows, the blur on panels.
- `npm i @fontsource-variable/inter`, import it in `src/main.tsx`; `font-family: 'Inter Variable', system-ui, sans-serif`. Mono: system mono stack with
  `font-variant-numeric: tabular-nums`. No CDN fonts. If the package will not install, fall back to `system-ui` and say so.

### 2. Chrome and layout (`src/App.tsx`, new `src/components/HeaderBar.tsx`)
- Rows: **header 44 px**, **disclaimer strip 24 px** (the required banner text, mono, muted amber, flat), then the content row filling the remainder of `100dvh`.
- Header content: `Machynex` + mono tag `v1.0-sim`; status pill `Node: MNX-EDGE-01` with a solid 8 px dot (green/amber/red from the health state; tooltip
  "Simulated node. No hardware connected."); camera presets as a segmented control `Default | Bearing | Edge Node` (use existing `focus('home'|'bearing'|'edge')`);
  `Reset Simulation`; and the existing **Evaluator walkthrough** button restyled to match (keep Stop behaviour).
- Add `Simulator.reset()` in `engine.ts` (re-create initial state, clear logs/capture/ramps, relay closed) and a test. `Reset Simulation` calls it and stops any walkthrough.
- Content: left 60% canvas, right 40% scroll pane with a 4 px scrollbar. The canvas height is exactly the remaining viewport (no page scroll at any size >= 1280x720).
  Below 1024 px wide: canvas on top (55%), pane below.

### 3. 3D HUD (replace floating labels)
- Stop rendering `LabelLayer`. Keep `LabelRegistry` and the projector for Phase 2 hotspots; mark `LabelLayer.tsx` with a deprecation comment (do not delete yet).
- Replace `Gauge.tsx` with `SeverityBar.tsx` (use `git mv` then rewrite): a compact horizontal 4-segment bar `A | B | C | D`, flat fills (muted, active segment solid),
  a thin marker for the current value, mono readout `1.02 mm/s`, bottom-left of the canvas. Label: `ISO 10816-3-style · illustrative` with an info tooltip carrying the caveat from CLAUDE.md §3.5.
- Move the slow-motion slider out of the canvas into the right pane under a "Simulation" section. Keep Pause / Sound / Alarms as small flat icon buttons top-left of the canvas.
- Restyle `Minimap.tsx` flat (no blur); remove its label-visibility toggles (they controlled the removed labels); keep click-to-focus.

### 4. Telemetry cards (`Dashboard.tsx`, `Charts.tsx`)
- Health banner: flat bar, state name in the semantic colour, no pulse, no glow. Include evidence chips (flat, square) and confidence.
- **Metric grid 2x2**: Vibration RMS (mm/s), Motor Current (A), Stator Temp (C), Rotational Speed (rpm). Label 11 px uppercase grey; value large mono; unit small. Value text is neutral
  unless a threshold is crossed (then the semantic colour).
- **FFT**: replace the waterfall with a single flat trace, 1 px stroke, dark muted gridlines, axis ticks every 25 Hz, and a **dashed vertical 1X marker with mono label**
  (`1X 24.17 Hz` at nominal). Optionally a faint peak-hold line. Keep `getSpectrum().waterfall` in the engine (unused).
- **Stripcharts**: 1 px traces, no fills, threshold lines dashed and muted, a mono current-value readout.
- Keep the **time-to-threshold** card with its illustrative label, the terminal and the JSON/CSV export (restyled flat).

### 5. Controls and interlock
- Sliders: 1 px track, 12 px circular thumb, mono numeric readout. Update the CSS in `index.css`.
- Presets as a segmented ghost-button row: `Nominal` `1X Imbalance` `Transient Knock` `Severe Fault` (map to baseline / progressive / shock / critical).
- Interlock card: a clear `ENERGIZED` / `TRIPPED` indicator (flat, semantic colour) with `Reset Interlock`. Tooltip: "Safety cut-off. Concept add-on, not in the proposed bill of materials."
  Keep the existing "fault still present" explanation when a reset is refused.

### 6. Remove "slop" everywhere
Search and remove: `gradient`, `shadow-*`, `backdrop-blur`, `blur-*`, `rounded-lg|xl|2xl|3xl`, `rounded-full` (except 8 px dots and slider thumbs), glow animations, emoji.

## Tests to add (do not edit existing tests)
- `tests/design-rules.test.ts`: scan `src/**/*.{ts,tsx,css}` for banned patterns (list above; allow-list `rounded-full` only in `HeaderBar.tsx` status dot, the health dot and CSS slider thumbs),
  assert the banner text exists in `src/App.tsx`, assert Inter is imported from the npm package and no `fonts.googleapis.com` string exists.
- `Simulator.reset()` test in a new file `tests/reset.test.ts`.
- Add both to the `npm test` script.

## Visual QA
Run `node scripts/qa-screenshots.mjs` at the three viewports. View them. Check: no horizontal scroll, right pane scrolls independently, header exactly 44 px, canvas fills the row,
HUD bar legible over the 3D scene, FFT 1X marker aligned with the peak, no element with a shadow/blur/gradient. Include before/after observations.

## Acceptance criteria
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass
- [ ] Design-rules test passes; disclaimer banner present
- [ ] No floating chips in the 3D view; severity bar bottom-left; metrics are a 2x2 grid
- [ ] Reset Simulation works mid-trip and mid-walkthrough
- [ ] Physics numbers and audio unchanged (existing 23+ engine tests untouched and green)

## STOP
Output: "Phase 1 Complete: SCADA Layout & Visual De-slopping applied. Awaiting confirmation to proceed to Phase 2." Then wait.
