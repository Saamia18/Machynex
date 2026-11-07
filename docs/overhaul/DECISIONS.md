# Decisions: where the master plan and the proposal deck disagree

The master plan (`master-plan-original.md`) was written without the deck's facts. Where they conflict, the phase prompts
follow the **Default** column. To override one, edit the row here and the matching line in `CLAUDE.md`, then re-run the phase.

| # | Topic | Master plan says | Deck / project facts | **Default used in the prompts** | Why |
| --- | --- | --- | --- | --- | --- |
| D1 | Default machine | 0.5 HP AC induction motor, 3.2 A | 12 V DC (775-class) bench motor, low voltage only | **Bench rig (12 V DC) stays the default asset** and is the only asset in proposal scope. Induction motor, pump and gearbox are **Concept assets** | The jury will compare the twin with the slides. Showing mains equipment as "our rig" contradicts the safety stance (low voltage only) |
| D2 | Sensor kits | SCT-013 clamp + MLX90614 IR on the rig | MPU6050, DS18B20, optional ACS712-type on a DC rig | **Two sensor kits.** *Bench kit* (deck parts) is default. *Industrial-retrofit kit* (SCT-013 clamp, IR canister) is built and shown only on Concept assets or via a labelled "Sensor kit" switch | SCT-013 is AC-only and cannot measure a DC motor lead. Both kits get built, so the plan's CT-clamp and IR visuals are delivered honestly |
| D3 | Edge node chip | ESP32-S3, node `MNX-EDGE-S3` | ESP32 DevKit V1 | Label the part `ESP32`; node id `MNX-EDGE-01` | Matches the deck |
| D4 | Interlock / SSR | Optocoupled SSR + relay trip | No relay in the BOM | Show as **"Safety cut-off (concept, not in BOM)"**. Bench kit: DC-rated switch. Concept AC assets: AC SSR | An AC SSR cannot switch DC; keeps the BOM honest |
| D5 | ISO severity bar | "ISO 10816-3 severity" | Rig is far below the standard's 15 kW scope | Keep the A/B/C/D bar, labelled `ISO 10816-3-style · illustrative`, tooltip with the caveat | Avoids a false compliance claim |
| D6 | Disclaimer banner | Not mentioned | Required: synthetic, no hardware | Keep a thin 24 px strip under the 44 px header, always visible | Honesty rule 1 |
| D7 | Pump and gearbox physics | Selectable machines with fault models | Not in proposal scope | Build them as **Concept assets** with a visible `CONCEPT · illustrative fault model · not validated` tag; note the MPU6050 bandwidth limit; label tooth counts as assumed | Shows scalability without over-claiming |
| D8 | FFT view | Flat 1 px trace + 1X marker | Earlier version drew a waterfall | Flat trace (plan wins). Keep the waterfall data in the engine, unused | Simpler and cleaner |
| D9 | Floating labels | Remove all speech bubbles | An earlier request wanted occlusion-aware labels | Remove them (plan wins). Replace with a HUD severity bar and, in Phase 2, clickable hardware + Inspector drawer | Cleaner scene |
| D10 | Font | Inter | Zero external assets | Bundle via `@fontsource-variable/inter`; fall back to `system-ui` | No CDN request |
| D11 | Spin-down | 0 rpm over 2.5 s | Current engine measures **3.45 s** trip-to-stop | Tune to 2.5 s (tolerance 0.3 s) in Phase 3, with a test | Measured, not assumed |
| D12 | Heat map range | Cool below 45 C, glowing amber/red above 75 C | Previous build used 40–95 C with glow above 60 C | Plan wins (45–75 C) | Latest instruction |
| D13 | Walkthrough, export, audio | Phase 3 asks to build them | **Already built and tested** | Phase 3 *extends* them (asset-aware, FFT peak highlight, asset fields in export) | Avoids rewriting working code |
| D14 | Phase 0 | Not in plan | `build` and 3D rendering never verified | **Add Phase 0 (pre-flight)** before Phase 1 | Find real errors early |
| D15 | Lockfile | Not mentioned | Uploaded repo has no `package-lock.json` | Phase 0 commits the lockfile | Reproducible Vercel builds |
| D16 | Time to threshold | Not mentioned | Must not imply RUL | Keep the illustrative label | Honesty rule 3 |

## Suggestion for the presentation itself
Show the bench rig first and keep pump/gearbox for a single "scalability" moment, clearly tagged as concept. If a juror asks
"is that validated?", the honest answer is that it is a visual of a future direction and nothing is validated.
