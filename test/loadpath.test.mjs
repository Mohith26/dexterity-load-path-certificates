import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../src/loadpath.js';
import { SEEDS, RULES, SHOW_SEED } from '../scripts/experiment.mjs';

const RES = JSON.parse(fs.readFileSync(new URL('../results/results.json', import.meta.url)));
const box = (x0, y0, z0, dx, dy, dz, m = 1, id = 'b') => ({ id, x0, y0, z0, x1: x0 + dx, y1: y0 + dy, z1: z0 + dz, m });

test('convex hull drops interior points and keeps CCW order', () => {
  const h = L.hull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.2, 0.7]]);
  assert.equal(h.length, 4);
  for (let i = 0; i < 4; i++) { const a = h[i], b = h[(i + 1) % 4], c = h[(i + 2) % 4]; assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0); }
  assert.ok(L.insideDepth(h, [0.5, 0.5]) > 0.49 && L.insideDepth(h, [2, 0.5]) < 0);
});

test('PROPERTY: convexWeights writes any inside point as a valid convex combination', () => {
  const r = L.mulberry32(9);
  for (let t = 0; t < 400; t++) {
    const pts = Array.from({ length: 4 + Math.floor(r() * 12) }, () => [r() * 2, r() * 2]);
    const h = L.hull(pts), q = [r() * 2, r() * 2], w = L.convexWeights(pts, q);
    if (L.insideDepth(h, q) < -1e-9) { assert.equal(w, null); continue; }
    assert.ok(w); let sx = 0, sy = 0, s = 0;
    pts.forEach((p, i) => { assert.ok(w[i] >= -1e-12); sx += w[i] * p[0]; sy += w[i] * p[1]; s += w[i]; });
    assert.ok(Math.abs(s - 1) < 1e-9 && Math.abs(sx - q[0]) < 1e-9 && Math.abs(sy - q[1]) < 1e-9);
  }
});

test('single box: tipping margin equals the closed form min(depth, width) / height', () => {
  const b = [box(0, 0, 0, 0.2, 0.3, 1.0, 5)];
  assert.ok(L.certify(b).ok);
  assert.ok(Math.abs(L.margin(b, { cap: 0.6, iters: 30 }) - 0.2) < 1e-6);
  assert.ok(L.certify(b, 0.199, 0).ok && !L.certify(b, 0.201, 0).ok);
  assert.ok(L.certify(b, 0, 0.299).ok && !L.certify(b, 0, 0.301).ok);
});

test('overhang: a box whose centre is off its support has no load path; the support-ratio rule agrees', () => {
  const s = [box(0, 0, 0, 0.4, 0.4, 0.3), box(0.25, 0, 0.3, 0.4, 0.4, 0.2)];
  assert.equal(L.certify(s).ok, false);
  assert.equal(L.certify(s).failBox, 1);
  assert.ok(L.supportRatio(s, 1) < 0.5);
});

test('bridge: 52% base support fails the 70% rule but is certified (centre between two supports)', () => {
  const s = [box(0, 0, 0, 0.3, 0.4, 0.3), box(0.6, 0, 0, 0.3, 0.4, 0.3), box(0.15, 0, 0.3, 0.6, 0.4, 0.2)];
  assert.ok(L.supportRatio(s, 2) < 0.7);
  assert.ok(L.certify(s).ok);
});

test('heavy box on an overhanging light box: each box looks fine alone, the stack has no load path', () => {
  const base = box(0, 0, 0, 0.4, 0.4, 0.3, 2), mid = box(0.12, 0, 0.3, 0.4, 0.4, 0.2, 1), top = box(0.32, 0, 0.5, 0.3, 0.4, 0.2, 20);
  assert.ok(L.certify([base, mid]).ok);
  assert.ok(L.supportRatio([base, mid, top], 2) >= 0.66);
  assert.equal(L.certify([base, mid, top]).ok, false);
});

test('PROPERTY: certified packs conserve load (floor carries total weight) and every box balances torque', () => {
  for (const seed of [11, 12, 13]) {
    const g = L.pack(L.sequence(seed).slice(0, 60), { kind: 'cert', margin: 0.02 });
    for (const [ax, ay] of [[0, 0], [0.02, 0], [0, -0.02]]) {
      const c = L.certify(g.placed, ax, ay); assert.ok(c.ok);
      const W = g.placed.reduce((s, b) => s + b.m, 0), floor = c.flows.filter((f) => f.to === -1).reduce((s, f) => s + f.f, 0);
      assert.ok(Math.abs(floor - W) < 1e-6 * W);
      g.placed.forEach((b, i) => { const out = c.flows.filter((f) => f.from === i), F = out.reduce((s, f) => s + f.f, 0); assert.ok(Math.abs(F - c.loads[i]) < 1e-9 * F); });
    }
  }
});

test('packing invariants: inside the truck, no overlaps, every box resting on something', () => {
  const g = L.pack(L.sequence(21), { kind: 'cert', margin: 0.05 });
  const T = L.TRUCK, P = g.placed;
  for (const b of P) assert.ok(b.x0 >= -1e-9 && b.y0 >= -1e-9 && b.z0 >= -1e-9 && b.x1 <= T.depth + 1e-6 && b.y1 <= T.width + 1e-6 && b.z1 <= T.height + 1e-6);
  for (let i = 0; i < P.length; i++) { assert.ok(L.supportsOf(P, i).length > 0); for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j]; const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6; assert.ok(!ov, `${i} ${j}`); } }
});

test('certified agent keeps the margin floor after every placement', () => {
  const g = L.pack(L.sequence(31).slice(0, 70), { kind: 'cert', margin: 0.05 });
  for (const a of L.audit(g.placed, { cap: 0.5 })) assert.ok(a.ok && a.margin >= 0.05 - 1e-4, `step ${a.k}: ${a.margin}`);
});

test('box streams are deterministic and pinned (identical on every platform)', () => {
  const s = L.sequence(1001);
  assert.equal(s.length, 120);
  assert.deepEqual(L.sequence(1001), s);
  assert.deepEqual(s[0], JSON.parse(fs.readFileSync(new URL('../data/pin.json', import.meta.url))).first);
  for (const b of s) { for (const d of b.dims) assert.ok(d >= 0.1 && d <= 0.65); assert.ok(b.weight > 0); }
});

test('density follows the challenge formula: box volume / (pack front x width x height)', () => {
  const p = [box(0, 0, 0, 0.5, 2.6, 2.75), box(0.5, 0, 0, 0.5, 1.3, 2.75)];
  assert.ok(Math.abs(L.density(p) - (0.5 * 2.6 * 2.75 + 0.5 * 1.3 * 2.75) / (1.0 * 2.6 * 2.75)) < 1e-12);
  assert.ok(Math.abs(L.iqm([1, 2, 3, 4, 5, 6, 7, 100]) - 4.5) < 1e-12);
});

test('HEADLINE: certified >= 0.05 g agent beats the 70% support rule on IQM density over 50 sequences', () => {
  const pick = (k) => RULES.find((r) => r.key === k).rule;
  const d70 = SEEDS.map((s) => L.pack(L.sequence(s), pick('ratio70')).density), d05 = SEEDS.map((s) => L.pack(L.sequence(s), pick('cert05')).density);
  assert.equal(+(100 * L.iqm(d70)).toFixed(1), RES.headline.ratio70IqmPct);
  assert.equal(+(100 * L.iqm(d05)).toFixed(1), RES.headline.cert05IqmPct);
  assert.equal(RES.headline.ratio70IqmPct, 45.9);
  assert.equal(RES.headline.cert05IqmPct, 51.9);
  assert.ok(RES.rules.cert05.worstGameMinMarginG >= 0.05 - 1e-4 && RES.headline.ratio70GamesBelow002g === 23);
});

test('showcase game on the page equals a fresh run', () => {
  const show = JSON.parse(fs.readFileSync(new URL('../data/showcase.json', import.meta.url)));
  assert.equal(show.seed, SHOW_SEED);
  const g = L.pack(L.sequence(SHOW_SEED), { kind: 'cert', margin: 0.05 });
  assert.equal(g.placed.length, show.games.cert05.placed.length);
  assert.ok(Math.abs(g.density - show.games.cert05.density) < 1e-4);
});
