# Machynex — Industrial Digital Twin Overhaul

## Sequential Master Prompt for Claude Code (Phased Execution)

> **Instructions for the AI Assistant / Claude Code:**
>
> Execute this refactoring plan **one phase at a time**. After completing each phase:
>
> 1. Run all tests and build verification (`npm run test` and `npm run build`).
>
> 2. Summarize the files modified and confirm the build succeeds with zero errors.
>
> 3. **STOP and wait for user confirmation** before starting the next phase. Do NOT execute multiple phases in a single turn.

## Global Design Rules & Strict Negative Constraints (Zero "AI Slop")

Before writing any UI code, strictly apply these design rules across all files:

* **NO Background Gradients:** Use flat, solid base surfaces (`#09090b` for canvas, `#111317` for panels).

* **NO Neon Glows or Blurred Drop-Shadows:** No `box-shadow` blooms or colored neon halos.

* **NO Rounded-Pill Bulges:** Corner radius must be restrained to `rounded-sm` or `rounded-md` (max 6px).

* **NO Floating 3D Speech Bubbles:** Remove all billboard HTML speech bubbles obscuring the 3D scene.

* **Color Discipline:** Semantic colors are reserved strictly for system states:

  * Normal: Muted solid emerald (`#10b981`)

  * Advisory: Warm amber (`#f59e0b`)

  * Critical: Flat crimson (`#ef4444`)

  * Telemetry Accent: Steel blue / cyan (`#38bdf8`)

* **Typography:** Monospace (`font-mono` / tabular figures) for all numbers, units, ISO codes, and timestamps. Clean neutral sans (`Inter`) for labels and metadata.

## Phase 1: Visual De-Slopping, Viewport Decoupling & SCADA Layout

### Goal

Replace the generic, template-like dashboard with a professional, restrained engineering workstation interface (Linear / Vercel style) while keeping the existing physics math and audio engine intact.

### Files to Target

* `src/App.tsx`

* `src/components/Dashboard.tsx`

* `src/components/Charts.tsx`

* `src/components/LabelLayer.tsx`

* `src/components/Gauge.tsx`

### Key Requirements

1. **Header Bar (44px fixed height):**

   * Brand title `Machynex` with subtle mono version tag `v1.0-sim`.

   * Hardware status pill: `Node: MNX-EDGE-S3` with solid 8px status dot (green/amber/red).

   * Minimal action buttons: Camera Presets (`Default`, `Bearing`, `Edge Node`) and `Reset Simulation`.

2. **Dual-Pane Viewport (100vh Locked):**

   * **Left 60%:** Fixed-height 3D canvas (`h-[calc(100vh-44px)]`) with OrbitControls.

   * **Right 40%:** Independent scrollable telemetry and controls pane with a clean 4px track scrollbar.

3. **3D HUD Overlay:**

   * Remove floating HTML speech bubbles from `LabelLayer.tsx`.

   * Place a compact ISO 10816-3 severity bar (`Zone A` | `Zone B` | `Zone C` | `Zone D`) in the bottom-left corner of the 3D canvas.

4. **Telemetry & Waveform Cards:**

   * Metric Grid: 2x2 flat tabular grid (Vibration RMS, Motor Current, Stator Temp, Rotational Speed). 11px uppercase gray labels above large monospace values.

   * FFT Spectrum: Clean 1px trace stroke over muted dark gridlines. Prominent vertical dashed marker at the 1X rotational frequency ($f_{\text{rot}} = \frac{\text{RPM}}{60} \approx 24.17\text{ Hz}$).

   * Stripcharts: Rolling history charts with thin trace lines and zero gradient fills beneath curves.

5. **Control Sliders & Relay Action:**

   * Sliders: Minimalist 1px tracks with small circular thumbs and discrete numeric readouts.

   * Diagnostic presets row: Segmented ghost buttons `[Nominal]`, `[1X Imbalance]`, `[Transient Knock]`, `[Severe Fault]`.

   * Hardware Interlock: Clear state indicator (`ENERGIZED` vs `TRIPPED`) with an explicit `Reset Interlock` button.

### Checkpoint & Gate

* Ensure `npm run build` passes with zero errors.

* **STOP HERE.** Output: *"Phase 1 Complete: SCADA Layout & Visual De-slopping applied. Awaiting confirmation to proceed to Phase 2."*

## Phase 2: Hardware-Centric 3D Detailing & Component Inspection

### Goal

Shift the visual and architectural focus of the 3D scene directly onto the **Machynex proprietary hardware suite** rather than just the generic host machinery.

### Files to Target

* `src/components/Scene.tsx`

* `src/components/LabelLayer.tsx` (or new `src/components/HardwareDrawer.tsx`)

* `src/sim/config.ts`

### Key Requirements

1. **Procedural Machynex Edge Processing Node (Central Enclosure):**

   * Industrial IP65 cast-aluminum/polycarbonate enclosure with exterior heatsink cooling fins and corner hex fasteners.

   * 3 threaded nylon cable glands (PG7/PG9) sealing sensor harnesses entering the case.

   * Internal PCB visible via transparent lid or X-Ray toggle: ESP32-S3 SoC with metal shield can, optocoupled solid-state relay (SSR), and micro status LEDs.

2. **Modular Sensor Probe Packaging:**

   * **Vibration Transducer (ADXL345 / MPU6050):** Potted in a knurled stainless-steel industrial puck with an M6 mounting stud magnetically coupled to the bearing housing, with braided flexible conduit wire.

   * **Current Transformer (SCT-013):** Two-piece dark blue ABS split-core clamp around a single insulated motor power lead.

   * **IR Temperature Sensor (MLX90614):** Threaded stainless M12 cylindrical canister on an adjustable mounting bracket angled at the motor drive-end stator core.

3. **Interactive Hardware Inspector Drawer:**

   * Clicking any hardware component (Edge Node, Vibration Puck, Current Clamp, IR Sensor) opens a slide-over engineering spec sheet showing:

     * Component name and protocol (I2C, SPI, Analog CT).

     * Sampling rate (e.g., `1600 Hz ODR`).

     * Real-time raw register values and conversion factors.

4. **Hardware Inspection Camera Presets:**

   * Camera buttons to jump directly to: `[Full Rig]`, `[Edge Node Close-Up]`, `[Bearing Puck]`, and `[CT Clamp]`.

   * `[X-Ray / Open Enclosure]` toggle: Dims the host motor opacity to 25% wireframe so the Machynex hardware and wiring harnesses stand out prominently.

### Checkpoint & Gate

* Ensure all 3D meshes render procedurally without external asset dependencies.

* Ensure `npm run build` passes with zero errors.

* **STOP HERE.** Output: *"Phase 2 Complete: Hardware-Centric 3D Architecture and Inspector implemented. Awaiting confirmation to proceed to Phase 3."*

## Phase 3: Multi-Machine Physics Simulation & Evaluator Walkthrough

### Goal

Demonstrate that Machynex is a scalable industrial condition monitoring platform by supporting multiple machinery types, realistic physical fault responses, and an automated presentation walkthrough for evaluators.

### Files to Target

* `src/sim/config.ts`

* `src/sim/engine.ts`

* `src/components/Scene.tsx`

* `src/sim/walkthrough.ts`

* `src/sim/audio.ts`

### Key Requirements

1. **Multi-Asset Configuration & Physics Engine:**
   Add support for 3 selectable industrial machines:

   * **0.5 HP Induction Motor (Default):** 1450 RPM, 3.2A nominal, 38°C. Fault: Rotor Mass Unbalance. Dominant 1X vibration peak ($24.17\text{ Hz}$).

   * **Centrifugal Slurry Pump:** 2900 RPM, 6.8A nominal, 44°C. Fault: Impeller Cavitation & Starvation. Generates broadband high-frequency FFT acoustic noise and reduces current under fluid loss.

   * **Helical Reducer Gearbox:** 980 RPM, 5.4A nominal, 52°C. Fault: Pinion Tooth Flank Pitting. Harmonics at Gear Mesh Frequency ($GMF = \text{Teeth} \times \frac{\text{RPM}}{60}$).

2. **Dynamic 3D Geometry Swapping:**

   * `Scene.tsx` conditionally renders the active machine (Motor rig, Volute pump with suction/discharge pipes, or Ribbed gearbox transmission casing).

   * Sensor suite dynamically attaches to the correct mechanical stress points for each machine.

3. **Dynamic Physical Feedback & Thermal Emissive Shading:**

   * Physical mesh oscillation: Bearing housing vibrates along Y/Z axes proportionally to RMS velocity.

   * Thermal map: Smoothly blends casing material emissive color from cool slate/teal ($<45^\circ\text{C}$) to glowing radiant amber/red ($>75^\circ\text{C}$).

   * Inertial spin-down: When the relay trips, motor shaft smoothly decelerates from nominal RPM to 0 RPM over 2.5 seconds.

4. **Synthesized Web Audio Feedback:**

   * Low-frequency motor running hum proportional to current RPM.

   * Sharp mechanical dual-click sound effect when the SSR trips or resets.

5. **Evaluator Guided Walkthrough:**

   * An automated 4-step guided presentation mode:

     1. Baseline Operation (Camera frames sensor suite under nominal load).

     2. Incipient Degradation (Ramps fault into Amber Advisory; highlights emerging FFT peak).

     3. Transient Knock Rejection (Injects a 300ms vibration shock; cross-sensor corroboration rejects false alarm without tripping).

     4. Critical Trip (Triggers emergency cutoff; SSR trips, motor decelerates, red latch engages).

   * Telemetry export button to download the streaming edge log as `.json` or `.csv`.

### Checkpoint & Final Verification

* Run tests: `npm run test`

* Run production build: `npm run build`

* Confirm zero Vercel deployment blockers or missing packages.