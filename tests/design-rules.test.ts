import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Enforces the greppable UI rules from CLAUDE.md §9 (flat surfaces, no glow/blur, radius <= 6px, no CDN fonts)
// and the honesty banner from §3.1.

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(f) ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ path: relative(ROOT, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }));

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', name); };

// a Tailwind class token: preceded by start/space/quote/backtick/colon (variants), followed by space/quote/backtick
const cls = (body: string) => new RegExp(`(?:^|[\\s"'\`:])(?:${body})(?=[\\s"'\`]|$)`, 'm');

/** files allowed to contain a pattern, with the reason */
const BANNED: { name: string; re: RegExp; allow?: Record<string, string> }[] = [
  {
    name: 'gradient',
    re: /gradient/i,
    // 3D particle sprite: a soft alpha falloff texture for sparks/smoke, not a UI surface or background
    allow: { 'src/components/Fx.tsx': 'particle sprite alpha texture' },
  },
  { name: 'shadow-* utility', re: cls('(?:drop-)?shadow(?:-(?:sm|md|lg|xl|2xl|inner|none|\\[[^\\]]*\\]|[a-z]+-\\d+(?:/\\d+)?))?') },
  { name: 'box-shadow / boxShadow', re: /box-shadow|boxShadow/ },
  { name: 'backdrop-blur / blur-*', re: /backdrop-blur|(?:^|[\s"'`:])blur(?:-[a-z0-9]+)?(?=[\s"'`]|$)|filter:\s*blur/m },
  { name: 'rounded-lg and larger', re: cls('rounded(?:-[trbl]{1,2})?-(?:lg|xl|2xl|3xl)') },
  // CSS glow/pulse animations and glow utilities (the 3D motor heat tint is a material colour, see DECISIONS.md D12)
  { name: 'glow animations', re: /pulse-ring|blink-crit|@keyframes[^{]*glow|(?:^|[\s"'`:])glow-[a-z]/im },
  { name: 'cyan accent classes', re: cls('(?:text|bg|border|ring|from|to|via|accent|fill|stroke)-cyan-\\d{2,3}(?:/\\d+)?') },
  { name: 'emoji', re: /\p{Extended_Pictographic}/u },
  { name: 'CDN fonts', re: /fonts\.googleapis\.com|fonts\.gstatic\.com/ },
];

for (const rule of BANNED) {
  test(`no ${rule.name}`, () => {
    const hits = files.filter((f) => !rule.allow?.[f.path] && rule.re.test(f.text)).map((f) => {
      const line = f.text.split('\n').findIndex((l) => rule.re.test(l));
      return `${f.path}:${line + 1}`;
    });
    assert.deepEqual(hits, [], `banned pattern "${rule.name}" found in: ${hits.join(', ')}`);
  });
}

test('rounded-full only on 8px status dots in HeaderBar.tsx and Dashboard.tsx', () => {
  const allowed = new Set(['src/components/HeaderBar.tsx', 'src/components/Dashboard.tsx']);
  const bad: string[] = [];
  for (const f of files) {
    f.text.split('\n').forEach((l, i) => {
      if (!/rounded-full/.test(l)) return;
      if (!allowed.has(f.path) || !/\bh-2\b/.test(l) || !/\bw-2\b/.test(l)) bad.push(`${f.path}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('honesty banner is rendered from src/App.tsx and says synthetic + no hardware', () => {
  const app = files.find((f) => f.path === 'src/App.tsx')!.text;
  const m = app.match(/BANNER_TEXT\s*=\s*'([^']+)'/);
  assert.ok(m, 'BANNER_TEXT constant missing in App.tsx');
  assert.match(m![1], /SYNTHETIC/);
  assert.match(m![1], /NO HARDWARE CONNECTED/);
  assert.match(app, /\{BANNER_TEXT\}/, 'banner constant must be rendered');
});

test('Inter is bundled from the npm package', () => {
  const main = files.find((f) => f.path === 'src/main.tsx')!.text;
  assert.match(main, /import '@fontsource-variable\/inter'/);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@fontsource-variable/inter'], '@fontsource-variable/inter must be a dependency');
  assert.doesNotMatch(readFileSync(join(ROOT, 'index.html'), 'utf8'), /fonts\.googleapis\.com/);
});

test('floating 3D labels are not rendered', () => {
  const scene = files.find((f) => f.path === 'src/components/Scene.tsx')!.text;
  assert.doesNotMatch(scene, /<LabelLayer\b/);
});

console.log(`\n${passed} design-rule tests passed`);
