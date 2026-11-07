# Phase 0: Pre-flight (find out the real state before redesigning)

Branch: `overhaul/phase-0-preflight`

## Context
Read `CLAUDE.md` first. The author of this codebase could not run `npm install`, the real typecheck, `vite build`, a browser, or
audio. Everything that touches the 3D scene, the build and the browser is **unverified**. Your job is to establish the truth and
make the smallest changes needed to get a clean, reproducible baseline. This phase is **not** a redesign.

## Tasks
1. **Clean state.** `git status` must be clean. Create the branch above. Confirm you are in the folder containing `package.json`.
2. **Install.** Run `npm install`. If `package-lock.json` is new, commit it alone (`chore: add lockfile`). Note any dependency that failed to
   resolve; the version ranges in `package.json` were written without registry access.
3. **Verify, record exact output.** Run `npm run typecheck`, `npm test`, `npm run build`, `npm run preview` (start, load once, stop).
   If something fails, fix only what blocks it: real type errors against the real `@types/*`, wrong imports, wrong prop names for
   react-three-fiber/drei, missing files. One commit per logical fix. **No refactors, no styling changes, no behaviour changes.**
   Never edit an existing test to make it pass; if a test fails, find out whether the code or the test is wrong and explain.
4. **Visual QA of the current app** (this is the first time anyone looks at it):
   - `npm i --no-save playwright && npx playwright install chromium`
   - `npm run dev`, then `node scripts/qa-screenshots.mjs http://localhost:5173 qa-screenshots/phase-0`
   - Open the screenshots yourself and describe what you see. Check specifically: is the 3D canvas non-blank; are the motor, flywheel,
     bearing, sensors, edge box and cables positioned sensibly and at sensible scale; do parts float or intersect; is the fog/lighting readable;
     do labels overlap; does the right pane scroll independently; any horizontal page scroll; any console error or warning; **any request
     to a non-local origin** (this would violate the zero-external-assets rule).
   - Also exercise it with the script options or by reasoning from code: Progressive Unbalance, Critical Trip, Reset, Evaluator Walkthrough.
     If you can drive the page with Playwright (click the buttons and screenshot again), do so. If you cannot, say so.
5. **Graceful WebGL failure.** Jury laptops can have WebGL disabled. Add a small new file `src/components/CanvasBoundary.tsx` (React error boundary)
   and wrap `<Canvas>` in `Scene.tsx` with it. On failure show a flat panel: "3D view unavailable on this device. Telemetry and controls still work."
   Keep the change under ~40 lines in existing files.
6. **Housekeeping.** Append `qa-screenshots/` to `.gitignore`. Confirm Vercel needs no `vercel.json` (Vite preset: build `npm run build`, output `dist`).
   Confirm `dist/` contains no references to external hosts (`grep -r "https://" dist | grep -v "w3.org\|reactjs.org\|github.com"` and explain any hit).

## Acceptance criteria
- [ ] `npm run typecheck` reports 0 errors; `npm test` passes; `npm run build` succeeds
- [ ] `package-lock.json` committed
- [ ] Screenshots exist for 3 viewports and were actually viewed
- [ ] No runtime requests to external origins
- [ ] WebGL failure shows the fallback panel instead of a white screen (test by blocking WebGL in the browser launch flags if you can)
- [ ] A ranked **defect list** (blocker / major / cosmetic) with a one-line proposed fix each; nothing from that list is fixed beyond blockers

## Report format
1. Command results (paste the final lines of each).
2. Files changed (should be few) and why.
3. Defect list from visual QA.
4. **What you could not verify**, plainly.
5. Questions for the user.

## STOP
Output: "Phase 0 complete. Awaiting confirmation to proceed to Phase 1." Then wait.
