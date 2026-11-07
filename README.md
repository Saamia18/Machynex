# Machynex · Digital Twin Simulation

A browser-based **concept simulation** of the proposed Machynex bench rig. Every value is synthetic.
No hardware is connected and no real data has been collected. A banner on screen says so.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation-engine and chart tests (no browser needed)
npm run typecheck  # full TypeScript check (needs the installed type packages)
npm run build      # production build into dist/
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel choose **Add New → Project**, import the repo. Vercel detects **Vite** automatically
   (build command `npm run build`, output `dist`). No environment variables, no `vercel.json` needed.
3. Or from a terminal: `npx vercel --prod`.

Tip: put the resulting URL behind a QR code on your Thank You slide.
For the live demo, keep a 20–30 s screen recording as a fallback in case venue Wi-Fi fails.

## New in this release

- **Evaluator walkthrough** (button in the top bar): 4 scenes over 50 s with guided camera moves and captions: baseline, progressive imbalance (bearing close-up and spectrum), floor-bump rejection, critical overload and relay trip. Press **Stop** at any time; the rig returns to a clean baseline.
- **Export telemetry**: JSON or CSV of the 2 Hz packet capture (up to 1 hour) plus the event log, from the terminal panel. Files are marked synthetic.
- **ISO 10816-3-style gauge**: segmented Zone A / B / C / D arc with needle. The bands (1.4 / 2.8 / 4.5 mm/s) are illustrative. The real standard targets larger machines and has been superseded by ISO 20816-3, so no ISO compliance is claimed.
- **Audio**: continuous motor hum whose pitch follows rpm (and falls during spin-down), a two-click relay sound on trip and reset, and intermittent alarm beeps (single in Early Warning, double in Critical). Phones also get a short haptic buzz on trip. Use *Sound* and *Alarms* in the viewport to mute.
- **3D polish**: stylised cooling fins and brushed-metal roughness, heat map (slate/teal to orange to red, glowing above 60 °C), superlinear vibration with structural flutter, flywheel precession and a flexing orange mass, procedural sparks and smoke at the bearing on trip, procedural reflections.
- **Labels**: screen-space layout that moves chips apart so they never overlap, hides the lowest-priority chip when crowded, and draws leader lines. A **minimap** (bottom-right) shows the rig from above: click a dot to fly the camera to that part, tick or untick to show or hide its label.
- **Layout**: the 3D viewport fills the full height of the left pane; the telemetry panel on the right scrolls on its own.

## 60-second demo path

1. Orbit the rig, hover a label (each one explains its role). Click **Reset camera** when lost.
2. **Progressive Unbalance** → the orange mass grows, 1X peak rises, state goes to Early Warning, a time-to-threshold appears.
3. **Normal Baseline**, then **Transient Floor Shock** → vibration spikes but the state does not change. The terminal logs the `[FILTER]` line.
4. **Critical Trip Event** → persistence of 1 s, then the cut-off opens, LED flashes red, a click plays and the motor coasts to 0 rpm.
5. Press **Reset Relay** (it is refused while the fault is present) → **Normal Baseline** → **Reset Relay**.

## What was verified, and what was not

| Part | Status |
| --- | --- |
| Simulation engine (`src/sim`): plant model, persistence, hysteresis, latch/reset, knock rejection, spectrum, lead time, zones, telemetry capture and export | **Tested**: 23 tests pass (`npm test`), strict TypeScript clean |
| Walkthrough timeline | **Tested** against the real engine from a clean start and from a tripped start: NORMAL, then EARLY, then the knock is rejected, then CRITICAL with the relay open |
| Dashboard, gauge and chart drawing code | **Smoke-tested** with real React server rendering through all states, and chart drawing against a fake canvas |
| Full project typecheck, `npm install`, `vite build` | Typecheck only against stubs in the author's sandbox. Run `npm run typecheck` and `npm run build` yourself |
| 3D scene appearance and performance: fins, heat map, wobble, sparks and smoke, label layout, minimap, camera moves | **Never rendered by the author.** Expect to tweak positions, sizes, colours and particle amounts |
| Audio (hum, relay clicks, beeps) | Written to the Web Audio API; **never heard by the author** |

If `npm run build` complains, send the first error message. `build` deliberately skips `tsc`, so a type
error cannot block deployment; run `npm run typecheck` separately.

## Where this differs from the original brief (and why)

The twin is aligned with the Machynex deck so the jury sees one consistent system.

| Brief | Built | Reason |
| --- | --- | --- |
| 0.5 HP AC induction motor | **12 V DC, 775-class motor** | The deck proposes low-voltage DC only; an AC motor implies mains wiring and mains current sensing |
| SCT-013 clamp, MLX90614 IR | **ACS712-type module (optional)** and **DS18B20 probe** | Matches the deck's parts list |
| Current 1–15 A, nominal 3.2 A, trip 9 A | **0.5–5 A, nominal 1.2 A, trip 4.0 A** | A 12 V 5 A adapter and 5 A sensor bound this rig; thresholds are illustrative |
| "ISO 10816-3 Zone C/D" labels | **No ISO zone claimed** | ISO 20816-3 (successor) covers machines above 15 kW; a bench rig is outside it. Thresholds 2.8 / 4.5 mm/s kept as illustrative values |
| ADVISORY / CRITICAL TRIP | **Early Warning / Critical / Unsafe Threshold Approaching** | Same names as the deck. The relay is shown as a *concept* safety cut-off, not in the current bill of materials |
| Knock rejected by corroboration alone | **Persistence window (1 s) plus corroboration** | The deck says a hard vibration limit is never suppressed by corroboration, so sustained vibration alone still trips. A 300 ms impulse is shorter than the persistence window |
| "Edge-AI" | **Analytics on a laptop** (terminal labelled accordingly) | Matches the deck. No ML model is simulated |
| Recharts | Canvas charts | Fewer dependencies, 20 fps, no layout surprises |
| Est. time to threshold | Kept, labelled **ILLUSTRATIVE TREND ESTIMATE — SYNTHETIC DATA** plus "not remaining useful life" | Avoids implying failure prediction |

Added beyond the brief: visual slow-motion slider (real rpm would strobe at 60 Hz), pause, sound and label toggles,
speed slider (vibration ∝ rpm²), eccentric-mass size follows the slider, evidence chips and confidence level,
latch hint when a reset is refused, optional physical-coupling toggle, an "About" panel stating assumptions.

## Files

```
src/sim/config.ts        all numbers (illustrative) in one place
src/sim/engine.ts        pure TypeScript simulator (no React, fully tested)
src/sim/audio.ts         synthesised relay click
src/sim/useSimulator.ts  fixed-step loop, 10 Hz UI publish
src/components/Scene.tsx procedural 3D rig (react-three-fiber)
src/components/Charts.tsx FFT waterfall and 10 s strip charts (canvas)
src/components/Dashboard.tsx health banner, metrics, controls, terminal
tests/                   engine and chart tests
```
