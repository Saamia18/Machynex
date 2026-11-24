import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { HardwareSuiteOverlay } from '../src/components/HardwareSuiteOverlay';
import { CONCEPT_TAG } from '../src/components/InspectorDrawer';
import type { HardwareId } from '../src/sim/hardwareSpecs';
import type { SensorKit } from '../src/sim/mounts';

// Server-render checks for the left-docked HARDWARE SUITE list and the inspection card.

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const live = { state: 'NORMAL', relayClosed: true, vib: 1.23, current: 0.8, temp: 41.5 };
const render = (selected: HardwareId | null, kit: SensorKit = 'bench', acMachine = false) =>
  renderToStaticMarkup(
    <HardwareSuiteOverlay kit={kit} acMachine={acMachine} selected={selected} onSelect={() => {}} onExit={() => {}} onOpenSheet={() => {}} sheetOpen={false} live={live} />,
  );

test('list shows the four parts with codes; no card while nothing is inspected', () => {
  const html = render(null);
  assert.ok(html.includes('aria-label="Hardware suite"'));
  for (const s of ['NODE-01', 'Edge Box', 'VB-01', 'Vibration Pod', 'CT-01', 'Current Sensor', 'TP-01', 'Thermal Probe']) assert.ok(html.includes(s), s);
  assert.equal(count(html, 'aria-pressed="true"'), 0);
  assert.ok(!html.includes('Component inspection'));
});

test('inspecting a part marks its row and shows the card with live value, sections, Prev / Next', () => {
  const html = render('vibration');
  assert.equal(count(html, 'aria-pressed="true"'), 1);
  assert.ok(html.includes('aria-label="Component inspection"'));
  assert.ok(html.includes('1.23'), 'live vibration value');
  assert.ok(html.includes('mm/s RMS'));
  assert.ok(html.includes('SIMULATED'));
  for (const s of ['Measures', 'Physical build &amp; bus', 'Diagnostic role', 'Prev', 'Next', 'Spec sheet', 'VB-01 · 2 / 4', 'Exit inspection (Esc)']) assert.ok(html.includes(s), s);
  assert.ok(html.includes('MPU6050'), 'IC from the card');
  assert.ok(html.includes('0x68'), 'bus from hardwareSpecs');
});

test('concept tag on industrial-kit parts, not on bench sensors from the proposal', () => {
  assert.ok(render('current', 'industrial', true).includes(CONCEPT_TAG));
  assert.ok(!render('current', 'bench', false).includes(CONCEPT_TAG));
  assert.ok(!render('temperature', 'bench', false).includes(CONCEPT_TAG));
});

test('unverified figures carry the unverified badge', () => {
  assert.ok(render('vibration', 'industrial', true).includes('>unverified<'));
  assert.ok(!render('vibration', 'bench', false).includes('>unverified<'));
});

test('flat styling: no banned classes, radius <= 6px', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'components', 'HardwareSuiteOverlay.tsx'), 'utf8');
  assert.ok(!/shadow-|blur|rounded-(lg|xl|2xl|full)|gradient|cyan/.test(src));
  const html = render('node', 'industrial', true);
  assert.ok(!/shadow|blur|rounded-lg|rounded-xl/.test(html));
});

console.log(`\nhardware-suite: ${passed} tests passed`);
