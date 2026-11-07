# Phase 3: Multi-asset physics and extended evaluator walkthrough

Branch: `overhaul/phase-3-multi-asset` (from the merged Phase 2)

## Context
Read `CLAUDE.md` and `docs/overhaul/DECISIONS.md` (D1, D2, D7, D11, D12, D13). The goal is a **scalability illustration**: the same Machynex node and the same detection logic
applied to other machine types. The bench rig remains the default and the only asset in proposal scope. Pump and gearbox are **Concept assets**: illustrative fault models, not validated.
**Do not rewrite the engine.** Introduce an asset profile layer so that the default profile reproduces today's numbers exactly and **all existing tests pass unmodified**.

## Assets (all numbers illustrative; keep them in one config file)
| Asset id | Scope | Nominal rpm | Nominal current | Nominal temp | Fault | Signature |
| --- | --- | --- | --- | --- | --- | --- |
| `bench-dc` | **Proposal** (default) | 1450 | 1.2 A | 38 C | Rotor mass unbalance | Dominant 1X peak at rpm/60 = 24.17 Hz (today's behaviour) |
| `induction-05hp` | Concept (industrial scenario) | 1450 | 3.2 A | 38 C | Rotor mass unbalance | 1X peak 24.17 Hz; AC kit (SCT-013 clamp) |
| `slurry-pump` | Concept | 2900 | 6.8 A | 44 C | Impeller cavitation / starvation | 1X = 48.33 Hz plus rising broadband noise floor; **current falls** under fluid loss |
| `helical-gearbox` | Concept | 980 | 5.4 A | 52 C | Pinion tooth-flank pitting | Gear-mesh peak GMF = teeth x rpm/60 with 1X sidebands; heat rises; teeth count **assumed** (state it in the UI) |
The master plan lists the induction motor as the default; per D1 it is a Concept asset here. If the user changed D1 in `DECISIONS.md`, follow their version.

## Tasks

### 1. Asset profiles (new `src/sim/assets.ts`)
- `AssetProfile`: id, display name, `scope: 'proposal' | 'concept'`, nominal rpm/current/temp, current-critical and temperature thresholds (scaled from nominal and flagged illustrative), vibration zone bounds,
  fault label and a generic **fault severity** (0–1) mapping, a vibration/current/temperature response function `(severity, rpm) => {vib, currentDelta, tempTarget}`, a spectrum model `(state) => spectrum`, spectrum axis max (Hz), sensor kit, sensor mounts, `conceptNote` string.
- The bench profile's response must equal the current `vibFromMass` behaviour (mass slider maps to severity). Keep the mass slider for bench/induction; other assets show a **Fault severity** slider with the asset's fault name.
- Engine: `Simulator` takes an optional profile (default `bench-dc`) and `setAsset(id)` (resets state, logs an INFO line). Replace direct `CONFIG` reads for nominals/thresholds with profile reads. Keep exports used by the UI stable.
- Asset selector (segmented control in the right pane, under Simulation): `Bench rig` `Induction motor` `Slurry pump` `Helical gearbox`. Non-proposal assets show a flat tag `CONCEPT · illustrative fault model · not validated` in the HUD and in exports.

### 2. Physics specifics
- **Spin-down**: after a trip the shaft must reach 0 rpm in **2.5 s +- 0.3 s** (currently 3.45 s measured). Retune `spinDownTau` and the Coulomb term; assert with a test for all assets.
- **Thermal map** (D12): casing emissive blends from slate/teal below 45 C to amber/red above 75 C, smoothly, driven by the shared material; verify on every asset.
- **Cavitation**: broadband floor rising with severity across the visible band; modest current **drop**; give a note: real cavitation energy extends above the proposed sensor's ~500 Hz bandwidth, so this view is a concept.
- **Pitting**: GMF peak (assumed teeth, e.g. 23 pinion teeth; state it) with 1X sidebands growing with severity; spectrum axis 0–500 Hz so GMF is visible (still below the 500 Hz Nyquist of a 1 kHz sensor); temperature creeps up.
- Detection logic (persistence, hysteresis, hard limit, latch, knock rejection) is **shared and unchanged**; zone bounds and thresholds come from the profile.
- Mark any extrapolated number `illustrative`. Do not add accuracy figures anywhere.

### 3. Dynamic 3D (new files; do not bloat `Scene.tsx`)
- `src/components/machines/PumpRig.tsx` (volute casing, suction and discharge pipes with flanges, motor behind) and `GearboxRig.tsx` (ribbed cast housing, input/output shafts, breather, inspection cover). The existing bench rig stays as is.
- `Scene.tsx` renders the active machine by `asset.id`. Each machine exports `SensorMounts`; Phase 2's puck / current / temperature components attach to those mounts and use the asset's `sensorKit`.
- Vibration of the bearing housing along Y/Z proportional to RMS velocity (existing behaviour) applies to every machine. Camera presets get per-asset framing.
- All procedural. Dispose geometries/materials on asset switch (no leaks: switching 20 times must not grow memory noticeably; verify by reasoning and, if possible, a quick `renderer.info` check).

### 4. Extend what already exists (do not rebuild)
- **Audio**: the hum already follows rpm. Verify it works at 2900 rpm and 980 rpm without clipping; optional gentle gear-whine for the gearbox. Dual-click relay on trip/reset already exists; keep it.
- **Evaluator walkthrough**: keep the 4 scenes and timing logic in `buildTimeline`; make captions and the fault ramp **asset-aware** (use the profile's fault name). In scene 2, highlight the emerging FFT peak with a flat bracket annotation (no glow).
  Update `tests/walkthrough.test.ts` **by adding** new cases per asset; do not weaken the existing ones.
- **Export**: add `asset_id`, `asset_scope` and fault name to JSON metadata and a column to CSV; keep `synthetic: true`. Add tests.

## Tests to add
- Profile invariants: bench profile reproduces `vibFromMass` for a grid of (mass, rpm) values.
- Each asset: baseline stays NORMAL for 60 s; fault ramp reaches EARLY then CRITICAL; knock is rejected; trip spins down in 2.5 +- 0.3 s; reset after clearing works; 10-minute random soak has no NaN.
- Spectrum: peak at rpm/60 for pump (48.33 Hz); GMF peak position and sidebands for the gearbox; cavitation raises the floor monotonically with severity and lowers current.
- Design-rules test from Phase 1 still passes.

## Visual QA
Screenshots for each asset in Normal, Early Warning and Tripped states, plus the walkthrough scenes on the pump and on the bench rig. Check scale, no clipping, sensors attached at stress points, thermal map continuity, concept tag visible.

## Acceptance criteria
- [ ] Existing 23+ engine tests and all earlier tests pass **unmodified**
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass
- [ ] Bench rig is the default; concept assets are tagged everywhere they appear, including exports
- [ ] Spin-down 2.5 s +- 0.3 s on every asset
- [ ] No claim of validation, accuracy or industrial readiness anywhere in the UI

## Final verification (end of the whole overhaul)
Run `/verify`. Then list remaining risks: what is still unverified (for example audio on real speakers, WebGL on other GPUs), and what the presenters should say if asked whether the twin is validated.

## STOP
Output: "Phase 3 Complete: multi-asset simulation and extended walkthrough implemented. Awaiting final review." Then wait.
