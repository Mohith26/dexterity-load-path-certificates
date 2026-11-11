// Run every agent on 50 seeded 120-box sequences (the size of the challenge's private evaluation),
// audit the load-path margin after every placement, and write results/results.json plus the
// showcase games the page opens with (data/showcase.json). Usage: node scripts/experiment.mjs
import fs from 'node:fs';
import * as L from '../src/loadpath.js';

export const SEEDS = Array.from({ length: 50 }, (_, i) => 1001 + i);
export const RULES = [
  { key: 'ratio70', label: 'Support ≥ 70% of base', rule: { kind: 'ratio', min: 0.7 } },
  { key: 'ratio80', label: 'Support ≥ 80% of base', rule: { kind: 'ratio', min: 0.8 } },
  { key: 'cert00', label: 'Certified, any margin', rule: { kind: 'cert', margin: 0 } },
  { key: 'cert02', label: 'Certified ≥ 0.02 g', rule: { kind: 'cert', margin: 0.02 } },
  { key: 'cert05', label: 'Certified ≥ 0.05 g', rule: { kind: 'cert', margin: 0.05 } },
  { key: 'cert08', label: 'Certified ≥ 0.08 g', rule: { kind: 'cert', margin: 0.08 } },
];
export const SHOW_SEED = 1007;
const r4 = (x) => +x.toFixed(4);

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now(), out = { seeds: SEEDS.length, boxesPerSequence: 120, truck: L.TRUCK, rules: {} }, show = { seed: SHOW_SEED, sequence: L.sequence(SHOW_SEED), games: {} };
  for (const R of RULES) {
    const dens = [], minM = [], below = [], placedN = [];
    for (const s of SEEDS) {
      const g = L.pack(L.sequence(s), R.rule);
      const au = L.audit(g.placed, { cap: 0.5 });
      dens.push(g.density); placedN.push(g.placed.length);
      const ms = au.map((a) => a.margin); minM.push(Math.min(...ms)); below.push(ms.filter((m) => m < 0.02).length);
      if (s === SHOW_SEED) show.games[R.key] = { placed: g.placed.map((b) => ({ ...b, x0: r4(b.x0), y0: r4(b.y0), z0: r4(b.z0), x1: r4(b.x1), y1: r4(b.y1), z1: r4(b.z1) })), margins: ms.map(r4), density: r4(g.density) };
    }
    out.rules[R.key] = {
      label: R.label, rule: R.rule,
      iqmDensityPct: +(100 * L.iqm(dens)).toFixed(1), meanDensityPct: +(100 * dens.reduce((a, b) => a + b, 0) / dens.length).toFixed(1),
      worstGameMinMarginG: r4(Math.min(...minM)), medianGameMinMarginG: r4([...minM].sort((a, b) => a - b)[Math.floor(minM.length / 2)]),
      gamesWithStepBelow002g: below.filter((x) => x > 0).length, stepsBelow002g: below.reduce((a, b) => a + b, 0),
      meanBoxesPlaced: +(placedN.reduce((a, b) => a + b, 0) / placedN.length).toFixed(1),
      densities: dens.map(r4), minMargins: minM.map(r4),
    };
    console.log(R.key, out.rules[R.key].iqmDensityPct, out.rules[R.key].worstGameMinMarginG, out.rules[R.key].gamesWithStepBelow002g, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const a = out.rules.ratio70, b = out.rules.cert05, c = out.rules.cert08;
  out.headline = { ratio70IqmPct: a.iqmDensityPct, cert05IqmPct: b.iqmDensityPct, gainPts: +(b.iqmDensityPct - a.iqmDensityPct).toFixed(1), ratio70WorstMarginG: a.worstGameMinMarginG, ratio70GamesBelow002g: a.gamesWithStepBelow002g, ratio70GamesWithUncertifiedStep: a.minMargins.filter((m) => m === 0).length, cert08IqmPct: c.iqmDensityPct };
  fs.mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../results/results.json', import.meta.url), JSON.stringify(out, null, 1));
  fs.writeFileSync(new URL('../data/showcase.json', import.meta.url), JSON.stringify(show));
  console.log(JSON.stringify(out.headline), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
