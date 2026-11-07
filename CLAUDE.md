# CLAUDE.md — Machynex Digital Twin (project memory)

Read this file fully before doing anything. It is the shared context between the research chat that
planned this work and you. Decisions that deviate from `docs/overhaul/master-plan-original.md` are in
`docs/overhaul/DECISIONS.md`; the defaults there apply unless the user edits them.

## 1. What this repo is
A browser-based **concept simulation** (React + react-three-fiber + Vite, deployed on Vercel) that accompanies a
TECHgium 10th-edition presentation for **Machynex**: a *proposed*, retrofit-friendly condition-monitoring system for
rotating machinery. The team are AI & Data Science undergraduates. They present for 7 minutes, then 5 minutes of Q&A.
The twin is a visual supplement. **Nothing is built, purchased, measured or validated.** All data is synthetic.

## 2. The proposal the twin must stay consistent with (the slide deck)
- Initial proof-of-concept: **rotor imbalance** on a **bench-scale** rig. Recommended build = vibration + temperature,
  with motor-current sensing as an optional, feasibility-gated extra.
- Proposed bench hardware: ESP32 DevKit V1 (acquisition only), **MPU6050** accelerometer (datasheet: 1 kHz accelerometer
  output rate, so Nyquist is about 500 Hz), **DS18B20** temperature probe, optional **ACS712-type** current module,
  small **12 V DC (775-class)** motor with PWM speed control, disc with a controlled eccentric bolt, enclosed 12 V adapter.
  Analytics run on a laptop (Python), not on the device. A safety cut-off and indicator LEDs are a **concept add-on, not in the BOM**.
- Health states (exact names): **Normal Operation**, **Early Warning**, **Critical / Unsafe Threshold Approaching**.
- Detection logic: persistence (1.0 s), hysteresis (2.0 s to step down), sensor agreement shown as confidence,
  and a **hard vibration safety limit that corroboration never suppresses**. CRITICAL latches until reset.
- Estimated core build: about INR 2,100–5,150 (estimate; nothing purchased).

## 3. Honesty rules (never violate)
1. Banner `DIGITAL TWIN SIMULATION | SYNTHETIC DATA | NO HARDWARE CONNECTED` is always visible. Keep a test for it.
2. Never imply real hardware, measured data, validated models, accuracy figures, or industrial readiness.
3. Anomaly detection is **not** failure prediction. No remaining-useful-life claims. The "time to threshold" readout stays
   labelled `ILLUSTRATIVE TREND ESTIMATE — SYNTHETIC DATA` and says it is not remaining useful life.
4. All thresholds are illustrative placeholders. Real limits would come from baseline runs on a real rig.
5. ISO 10816-3-style zone bands (A/B/C/D, bounds 1.4 / 2.8 / 4.5 mm/s) are **illustrative**. ISO 10816-3 has been superseded by
   ISO 20816-3, which covers machines above 15 kW. Never claim ISO compliance for this rig; keep a tooltip saying so.
6. Anything not in the proposal (pump, gearbox, induction motor, SCT-013 clamp, IR sensor, enclosure, cut-off) must be labelled
   `CONCEPT · not in the proposed bill of materials`.
7. If you cannot verify something (a datasheet value, a rendering, a build), say so in your report. Do not guess.

## 4. Technical-correctness guardrails
- **SCT-013 is an AC-only current transformer.** Never draw it on a DC lead. DC rig = Hall-effect (ACS712-type) module.
- An AC solid-state relay cannot switch DC. DC rig cut-off = "DC-rated switch (concept)"; AC machine concepts may show an AC SSR.
- The proposed MPU6050 cannot capture broadband content above ~500 Hz. Any spectrum beyond that must be labelled
  `concept — needs a wider-bandwidth sensor`. Cavitation noise in real pumps extends well above 500 Hz; say so.
- Gear-mesh frequency = teeth x shaft Hz. Tooth counts here are **assumed illustrative values**; state that in the UI.
- Register addresses, LSB-per-unit factors and sensor specs shown in an Inspector must be checked against the datasheet
  before hard-coding. Put the source in a code comment. If you cannot check, label the value `unverified` in the UI.

## 5. Engine invariants (`src/sim/engine.ts`; covered by tests; do not break)
- Fixed tick 0.05 s. Vibration (mm/s RMS) = (0.5 + (mass - 0.05) x 7.5/1.45) x (rpm/1450)^2 for the bench rig.
- Persistence 1.0 s (vib, temp), 0.5 s (current). Hysteresis 2.0 s. Critical latches; `resetRelay()` refuses while a fault setpoint is present.
- A 300 ms shock is rejected (shorter than persistence) and logged: `[FILTER] Transient vibration impulse rejected. Supporting thermal/current corroboration absent.`
- Telemetry capture 2 Hz (up to 1 h), event log up to 2000 lines, JSON/CSV export marked synthetic.
- **Existing tests may not be edited to make them pass.** Add new tests. Changing physics math requires a test that proves the new behaviour.

## 6. Commands
```
npm install            # commit package-lock.json if it appears
npm run typecheck      # tsc --noEmit (must be 0 errors)
npm test               # engine, charts, walkthrough (+ new tests per phase)
npm run build          # vite build (must pass)
npm run dev            # http://localhost:5173
node scripts/qa-screenshots.mjs [url] [outDir]   # visual QA, see docs/overhaul/README.md
```

## 7. Repo map
```
src/sim/       config.ts engine.ts audio.ts useSimulator.ts walkthrough.ts shots.ts exporter.ts   (pure logic, unit-tested)
src/components Scene.tsx (3D) Fx.tsx (sparks/smoke) Dashboard.tsx Charts.tsx Gauge.tsx LabelLayer.tsx Minimap.tsx
src/App.tsx    layout + header + walkthrough control
tests/         engine.test.ts charts.test.ts walkthrough.test.ts   (tsx scripts using node:assert)
```

## 8. What has and has not been verified (as of the hand-off)
- Verified by the previous author: engine logic (23 tests), walkthrough timeline against the real engine, chart drawing against a
  fake canvas, dashboard server-render, strict typecheck of own code against stubbed library types.
- **Never verified by anyone:** `npm run build` with real packages, the real `npm run typecheck`, the 3D scene's appearance and
  performance, audio output, and any browser behaviour. Treat these as unknown. **Phase 0 exists to find out.**

## 9. UI design rules (apply from Phase 1 onward; a test enforces the greppable ones)
- Flat solid surfaces: canvas `#09090b`, panels `#111317`, hairline borders `#23262d`. **No gradients.**
- **No neon glows, no box-shadow blooms, no blur** (`shadow-*`, `backdrop-blur`, `blur-*` are banned).
- Corner radius max 6px (`rounded-sm` / `rounded-md`). `rounded-full` only for 8px status dots and slider thumbs.
- Semantic colour is reserved for system state: Normal `#10b981`, Advisory `#f59e0b`, Critical `#ef4444`, telemetry accent `#38bdf8`.
  Numbers are neutral text unless a threshold is crossed.
- Numbers, units, ISO codes, timestamps: monospace with tabular figures. Labels: Inter (bundled via npm `@fontsource-variable/inter`,
  never a CDN link), 11px uppercase grey for metric labels.
- No floating HTML speech bubbles over the 3D scene.
- Zero external assets or network requests at runtime (fonts, textures, models, icons are all bundled or procedural).

## 10. Working agreement
- Work **one phase at a time**, on its own git branch `overhaul/phase-N-name`. After a phase: run typecheck, tests and build,
  run the visual QA, report, then **STOP and wait for the user**.
- Prefer **new files** for new features. Edit existing files only where necessary and keep diffs small and reviewable.
- Do not add runtime dependencies without asking (exception: `@fontsource-variable/inter` in Phase 1). Dev-only tooling is installed with `--no-save`.
- Commit in small logical commits with clear messages. Do not push or open PRs unless asked.
- Report format: files changed, what was verified (with the command output), what could NOT be verified, open questions.
