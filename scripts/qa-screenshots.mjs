// Visual QA helper for the Machynex digital twin.
//
// Usage:  node scripts/qa-screenshots.mjs [url] [outDir]
//   url     default http://localhost:5173   (start `npm run dev` or `npm run preview` first)
//   outDir  default qa-screenshots/run
//
// Requires Playwright WITHOUT touching package.json:
//   npm i --no-save playwright && npx playwright install chromium
//
// NOTE: written without the ability to run a browser. If it fails, fix the script first and say so in your report.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173';
const outDir = process.argv[3] ?? 'qa-screenshots/run';
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 },
];

const browser = await chromium.launch({
  headless: true,
  // software WebGL so the 3D canvas renders without a GPU
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const origin = new URL(url).origin;
let problems = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleIssues = [];
  const pageErrors = [];
  const externalRequests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (!u.startsWith(origin)) externalRequests.push(u);
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // let the scene settle

  const info = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    overflowY: document.documentElement.scrollHeight > window.innerHeight + 1,
    canvases: document.querySelectorAll('canvas').length,
    bannerPresent: document.body.innerText.includes('NO HARDWARE CONNECTED'),
  }));

  await page.screenshot({ path: `${outDir}/${vp.name}-initial.png` });

  // exercise the main interactions if the buttons exist (labels may change between phases; each click is optional)
  const clickIf = async (re, file) => {
    const el = page.getByRole('button', { name: re }).first();
    if (await el.count()) {
      await el.click();
      await page.waitForTimeout(file.includes('trip') ? 4500 : 3000);
      await page.screenshot({ path: `${outDir}/${vp.name}-${file}.png` });
      return true;
    }
    return false;
  };
  const did = {
    progressive: await clickIf(/progressive|1X imbalance/i, 'progressive'),
    trip: await clickIf(/critical trip|severe fault/i, 'trip'),
  };

  console.log(`\n=== ${vp.name}`);
  console.log(`canvas elements: ${info.canvases} | banner present: ${info.bannerPresent} | horizontal overflow: ${info.overflowX} | vertical page overflow: ${info.overflowY}`);
  console.log(`interactions exercised: ${JSON.stringify(did)}`);
  console.log(`page errors: ${pageErrors.length ? '\n  - ' + pageErrors.join('\n  - ') : 'none'}`);
  console.log(`console errors/warnings: ${consoleIssues.length ? '\n  - ' + [...new Set(consoleIssues)].slice(0, 15).join('\n  - ') : 'none'}`);
  console.log(`external requests: ${externalRequests.length ? '\n  - ' + [...new Set(externalRequests)].join('\n  - ') : 'none'}`);
  if (pageErrors.length || externalRequests.length || info.overflowX || !info.bannerPresent || info.canvases === 0) problems += 1;
  await page.close();
}

await browser.close();
console.log(`\nScreenshots saved in ${outDir}. Open them and look at the 3D canvas before trusting any of the above.`);
process.exit(problems ? 1 : 0);
