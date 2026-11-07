# Overhaul kit: how to use it

This kit adds **only new files** to your repo. Nothing you have pushed is modified until Claude Code starts a phase.

## 1. Install the kit (one time)
Extract the zip into the folder that contains `package.json` (the folder you run `npm run dev` in), so you get:
```
CLAUDE.md                       <- Claude Code reads this automatically
.claude/commands/phase0..3.md   <- slash commands: /phase0 /phase1 /phase2 /phase3 /verify
docs/overhaul/                  <- prompts, decisions, original master plan
scripts/qa-screenshots.mjs      <- visual QA helper
```
```bash
git switch -c chore/claude-code-kit
git add CLAUDE.md .claude docs scripts
git commit -m "docs: add Claude Code project memory and phased overhaul prompts"
git push -u origin chore/claude-code-kit     # merge it when ready
```

## 2. Safe Git workflow (so pushing stays easy)
- One branch per phase: `overhaul/phase-0-preflight`, `overhaul/phase-1-scada-ui`, `overhaul/phase-2-hardware`, `overhaul/phase-3-multi-asset`.
- Open a pull request per phase. **Vercel builds a preview URL for every branch**, so you can look at the result before merging.
  Your production link only changes when you merge to `main`.
- If a phase goes wrong, close the PR. `main` is untouched.
- Commit `package-lock.json` (Phase 0 does this). Vercel then installs exactly the versions you tested.

## 3. Running a phase
Open a terminal in the repo folder and start Claude Code (`claude`). Then type:
```
/phase0
```
Claude Code does only that phase, reports, and stops. Review the report and the preview, then type `/phase1`, and so on.
Order: **phase0 -> phase1 -> phase2 -> phase3.** Do not skip phase0: the app's build and 3D rendering have never been run by the author.

If you are not using Claude Code, open `docs/overhaul/phase-N-*.md`, paste the whole file into any coding assistant that can edit
your repo, and also paste `CLAUDE.md` first.

## 4. Visual QA helper
`scripts/qa-screenshots.mjs` opens the running app in headless Chromium, saves screenshots at 1920x1080, 1440x900 and 1280x720, and
prints: console errors and warnings, uncaught exceptions, any request to a non-local origin (must be none), and horizontal overflow.
```bash
npm i --no-save playwright && npx playwright install chromium    # does not touch package.json
npm run dev                                                     # in one terminal
node scripts/qa-screenshots.mjs http://localhost:5173 qa-screenshots/phase-1
```
The 3D scene needs WebGL; the script launches Chromium with software GL flags. It has **not been run by the author**; if it fails,
fix the script first and say so in the report. Screenshots go in `qa-screenshots/` (git-ignored by Phase 0).

## 5. What each phase delivers
| Phase | Delivers | Main risk it addresses |
| --- | --- | --- |
| 0 Pre-flight | Real typecheck/test/build results, lockfile, WebGL fallback, screenshot baseline, defect list | Unknown build and rendering state |
| 1 SCADA layout | Flat professional UI, header, HUD severity bar, 2x2 metrics, flat FFT, segmented presets, interlock card, design-rule test | "Template-looking" dashboard |
| 2 Hardware detail | Edge node enclosure, packaged sensors, click-to-inspect drawer, camera presets, X-ray toggle | Focus on Machynex hardware, not the host machine |
| 3 Multi-asset | Asset profiles (bench rig default, pump and gearbox as concepts), geometry swap, 2.5 s spin-down, extended walkthrough and export | Scalability story without over-claiming |
