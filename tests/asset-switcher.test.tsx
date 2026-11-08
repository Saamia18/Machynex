import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetSwitcher, CONCEPT_ASSET_TEXT, KIT_PREVIEW_TEXT, WALK_LOCK_TIP } from '../src/components/AssetSwitcher';
import { ASSET_IDS } from '../src/sim/assets';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const render = (props: Partial<Parameters<typeof AssetSwitcher>[0]> & { asset: (typeof ASSET_IDS)[number] }) =>
  renderToStaticMarkup(<AssetSwitcher onChange={() => {}} {...props} />);

test('renders a radiogroup with 4 radios and exactly one aria-checked="true"', () => {
  for (const id of ASSET_IDS) {
    const html = render({ asset: id });
    assert.equal(count(html, 'role="radiogroup"'), 1);
    assert.equal(count(html, 'role="radio"'), 4);
    assert.equal(count(html, 'aria-checked="true"'), 1, id);
    assert.equal(count(html, 'aria-checked="false"'), 3, id);
    for (const label of ['Bench rig', 'Induction', 'Pump', 'Gearbox']) assert.ok(html.includes(`>${label}<`), label);
  }
});

test('roving tabindex: only the selected radio is in the tab order', () => {
  const html = render({ asset: 'slurry-pump' });
  assert.equal(count(html, 'tabindex="0"'), 1);
  assert.equal(count(html, 'tabindex="-1"'), 3);
});

test('CONCEPT tag for Induction / Pump / Gearbox, not for Bench rig', () => {
  assert.ok(!render({ asset: 'bench-dc' }).includes('>CONCEPT<'));
  for (const id of ['induction-05hp', 'slurry-pump', 'helical-gearbox'] as const) assert.ok(render({ asset: id }).includes('>CONCEPT<'), id);
});

test('the (i) popover text is not in the markup until the popover is opened', () => {
  for (const id of ['induction-05hp', 'slurry-pump', 'helical-gearbox'] as const) {
    assert.ok(!render({ asset: id }).includes(CONCEPT_ASSET_TEXT), `${id}: long text must stay out of the overlay`);
    assert.ok(render({ asset: id, initialInfoOpen: true }).includes(CONCEPT_ASSET_TEXT), `${id}: popover shows the text`);
  }
  assert.ok(!render({ asset: 'bench-dc', initialInfoOpen: true }).includes(CONCEPT_ASSET_TEXT));
});

test('bench rig with the industrial kit preview gets its own marker and text', () => {
  const html = render({ asset: 'bench-dc', kitPreview: true });
  assert.ok(html.includes('>KIT PREVIEW<'));
  assert.ok(!html.includes('>CONCEPT<'));
  assert.ok(render({ asset: 'bench-dc', kitPreview: true, initialInfoOpen: true }).includes(KIT_PREVIEW_TEXT));
});

test('disabled during the walkthrough: aria-disabled and the tooltip', () => {
  const html = render({ asset: 'bench-dc', disabled: true });
  assert.ok(html.includes('aria-disabled="true"'));
  assert.ok(html.includes(WALK_LOCK_TIP));
  assert.ok(!render({ asset: 'bench-dc' }).includes('aria-disabled'));
});

test('compact mode is a single "Asset: <name>" dropdown with no radios until opened', () => {
  const html = render({ asset: 'helical-gearbox', compact: true });
  assert.equal(count(html, 'role="radio"'), 0);
  assert.ok(html.includes('Asset:') && html.includes('Gearbox'));
  assert.ok(html.includes('aria-expanded="false"'));
});

test('announces the active machine politely and uses no banned styling', () => {
  const html = render({ asset: 'slurry-pump' });
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(!/shadow|blur|gradient|cyan-|rounded-(lg|xl|full)/.test(html));
});

test('banner says NO HARDWARE CONNECTED and no longer claims a rig exists', () => {
  const app = readFileSync(join(import.meta.dirname, '..', 'src', 'App.tsx'), 'utf8');
  const m = app.match(/BANNER_TEXT\s*=\s*'([^']+)'/);
  assert.ok(m, 'banner constant missing');
  assert.equal(m![1], 'PROPOSED CONCEPT · SYNTHETIC TELEMETRY · NO HARDWARE CONNECTED');
  assert.match(app, /\{BANNER_TEXT\}/);
});

console.log(`\n${passed} asset-switcher tests passed`);
