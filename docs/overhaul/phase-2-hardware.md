# Phase 2: Hardware-centric 3D detailing and component inspection

Branch: `overhaul/phase-2-hardware` (from the merged Phase 1)

## Context
Read `CLAUDE.md` (sections 2, 3, 4) and `docs/overhaul/DECISIONS.md` (D2, D3, D4). The 3D scene should now showcase the **Machynex hardware suite**, not just the host machine.
All geometry is procedural (no model files, no textures from disk). Prefer **new files** under `src/components/hardware/`.

## Sensor kits (important)
Build both kits as reusable components. A config value `sensorKit: 'bench' | 'industrial'` selects which is drawn.
| Role | Bench kit (default, matches the deck) | Industrial-retrofit kit (concept) |
| --- | --- | --- |
| Vibration | MPU6050 inside a potted puck (shared component) | same puck |
| Current | ACS712-type Hall-effect module, in-line on the DC lead (optional, dashed/translucent as before) | SCT-013 two-piece split-core clamp on one AC lead |
| Temperature | DS18B20 stainless-sleeve probe on a clamp band | MLX90614 M12 canister on an adjustable bracket aimed at the stator |
The industrial kit carries the tag `CONCEPT · not in the proposed bill of materials`. A small "Sensor kit" switch (Inspector header) previews it on the bench rig, labelled as a preview.
Never draw an SCT-013 on a DC lead in the bench kit (CLAUDE.md §4).

## Tasks

### 1. Edge Processing Node: `src/components/hardware/EdgeNode.tsx`
- Industrial IP65-style enclosure: body with exterior heatsink fins on top, four hex corner fasteners, a polycarbonate lid.
- Three threaded nylon cable glands (PG7/PG9 style: cylinder + hex nut + strain-relief cone) where the sensor harnesses enter.
- Interior visible through the transparent lid (and fully when X-ray is on): PCB, **ESP32** module with a metal shield can and a printed antenna trace, the cut-off switching element,
  and three micro status LEDs (green/amber/red) driven by the health state. Label the cut-off `Safety cut-off (concept)`: DC-rated switch on the bench kit.
- Keep the front-panel indicator LEDs and the cut-off state LED behaviour that exists today (blink on CRITICAL).

### 2. Sensor packaging: `VibrationPuck.tsx`, `CurrentSensor.tsx` (module + clamp variants), `TempSensor.tsx` (probe + IR variants)
- **Puck**: knurled stainless cylinder (ridges from a ring of thin boxes or a custom geometry), M6 stud into the bearing housing, dark magnet base, braided flexible conduit (tube with a procedural stripe texture) running to a gland.
- **Clamp (concept kit)**: two dark-blue ABS half-rings with hinge and latch around a single lead; output cable to a gland. **Module (bench kit)**: small PCB with terminal blocks, translucent when optional.
- **IR canister (concept kit)**: M12 threaded cylinder (stacked rings), bracket with a slotted arm, angled at the drive-end stator. No glow, no cone.
- Cables: every sensor harness ends in one of the three glands; no cable passes through geometry.
- Sensors attach via **mount points** exported by the machine component (position + orientation), so Phase 3 can re-attach them to other machines. Define `type SensorMounts = { puck: Mount; temp: Mount; current: Mount }` in a new `src/sim/mounts.ts`.

### 3. Hardware Inspector drawer: `src/components/InspectorDrawer.tsx` and `src/sim/hardwareSpecs.ts`
- Clicking the Edge Node, puck, current sensor or temperature sensor in 3D (R3F pointer events, `stopPropagation`, hover cursor + a flat outline, not a glow) opens a slide-over spec sheet
  over the left edge of the right pane (about 380 px, closes with Esc and a Close button, focus-trapped). A "Hardware" list in the pane gives keyboard access to the same four items.
- For each component show: name, **protocol** (I2C / 1-Wire / analog ratiometric / analog CT / SMBus / Wi-Fi SoC), supply and role, **sampling rate** (MPU6050: 1 kHz accelerometer output rate target;
  DS18B20: about 1 Hz; ACS712-type and SCT-013: ADC at about 1 kHz target), **simulated raw registers** and the **conversion factor**, and a status line `SIMULATED VALUES`.
- `hardwareSpecs.ts` holds pure functions (unit-tested) that turn the current simulated physical values into raw readings:
  - MPU6050: int16 accel X/Y/Z counts from simulated acceleration plus 1 g on the vertical axis; LSB/g for the selected range (default +-2 g).
  - DS18B20: 12-bit raw temperature register (0.0625 C per LSB) and its hex form.
  - ACS712-type (5 A variant): sensor voltage vs current (zero-current midpoint and sensitivity from the datasheet) plus a note that 3.3 V ADC conditioning is **not designed yet**.
  - SCT-013 (pick one named variant and say which, e.g. the 30 A : 1 V type): sensor voltage vs AC current.
  - MLX90614: raw object-temperature word (0.02 K per LSB) converted to C.
  - **Verify every address, LSB factor and sensitivity against the datasheet before hard-coding; cite the datasheet in a code comment. If you cannot verify one, show it as `unverified` in the UI.**
- Values refresh at 10 Hz from the snapshot. Show hex and decimal in mono.

### 4. Camera presets and X-ray
- Buttons (in the canvas top-left cluster or the header's camera menu): `Full Rig`, `Edge Node Close-Up`, `Bearing Puck`, `CT Clamp` (when the bench kit is active, this focuses the current module and the button label reads `Current Sensor`).
  Add the shot definitions in `src/sim/shots.ts`; animate with the existing camera director.
- `X-Ray / Open Enclosure` toggle: host machine materials switch to 25% opacity wireframe (transparent, `depthWrite: false`), the enclosure lid becomes fully transparent, Machynex hardware stays opaque.
  Implement by passing an `xray` flag into the host-machine components and using shared materials so the toggle is one assignment, not a remount. The thermal heat-map on the motor must keep working in X-ray.

## Tests to add
- `tests/hardware-specs.test.ts`: round-trip and boundary tests for each conversion (temperature raw to C and back, current to voltage and back, accel counts to g, saturation at range limits, no NaN), and that every inspector entry has name, protocol, sampling rate, conversion factor, and a non-empty `source` string.
- A test that the camera shot names added exist and have finite positions.

## Visual QA
Capture: Full Rig; Edge Node Close-Up (lid on and X-ray on); Bearing Puck; Current sensor/CT Clamp; one Inspector open per component. Check: no clipping, glands visible with cables entering them, fins and fasteners at sensible scale,
host machine readable but subdued in X-ray, no HTML bubbles over the scene, Esc closes the drawer, the first click on a component does not also start an orbit drag.

## Acceptance criteria
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass; no external assets
- [ ] All four hardware items are clickable and inspectable; specs show `SIMULATED VALUES`
- [ ] Both sensor kits exist; the bench kit never shows an AC-only sensor on a DC lead
- [ ] X-ray toggle works with the thermal heat-map
- [ ] Every datasheet-derived number is sourced in a comment or marked `unverified`

## STOP
Output: "Phase 2 Complete: Hardware-Centric 3D Architecture and Inspector implemented. Awaiting confirmation to proceed to Phase 3." Then wait.
