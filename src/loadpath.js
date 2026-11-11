// Load-path stability certificates for truck packing (Foresight API Challenge format).
// Pure ES module, no dependencies, no Math.random; used by the page, the experiment script and tests.
//
// Model. Boxes are axis-aligned cuboids in the truck segment (x = depth toward the doors, y = width,
// z = height). A horizontal disturbance a (in g: robot contact, conveyor bump, trailer motion) is
// modelled as tilted gravity: every body force points along d = (ax, ay, -1).
// Certificate. Boxes are processed top-down. Each box carries its own weight at its centre plus the
// loads handed to it by boxes above (all parallel to d), so their resultant is a single force along
// d through the weighted mean point P. Its line meets the box's bottom plane at Q. If Q lies inside
// the convex hull of the box's support contacts (rectangle overlaps with boxes directly below, or
// the floor), Q is written as a convex combination of contact corners and those forces are handed
// down. Every box then has parallel forces in and out with equal resultant on the same line: an
// exact static equilibrium (friction must cover |a| <= mu, reported separately). Finding such a
// force field certifies the stack; failing to find one flags the box where no load path exists.
// The certificate is sufficient, not necessary: side contacts are ignored (conservative) and the
// split of each load across supports is one particular choice.
// Margin. The largest a in the worst horizontal direction (+x toward the open face, +-y) for which
// the certificate still exists, found by bisection.

import { dexp, dlog, dcos } from './detmath.js';

export const TRUCK = { depth: 2.0, width: 2.6, height: 2.75 }; // metres, challenge truck segment
export const EPS = 1e-6, TOUCH = 2e-3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ 2D geometry
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** Convex hull (Andrew's monotone chain), counter-clockwise, collinear points dropped. Items keep a .ref. */
export function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
/** Signed distance from q to the boundary of convex CCW polygon h (positive inside). */
export function insideDepth(h, q) {
  if (h.length === 1) return -Math.hypot(q[0] - h[0][0], q[1] - h[0][1]);
  let best = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-12) continue;
    best = Math.min(best, cross(a, b, q) / L);
  }
  return h.length === 2 ? Math.min(best, 0) : best;
}

/**
 * Express q as a convex combination of the corner points (q inside their hull): mix of the uniform
 * weights on all corners (centroid c) and the hull edge where the ray c -> q exits.
 * Returns weights per input point, or null if q is outside.
 */
export function convexWeights(points, q) {
  const n = points.length;
  const c = [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  const h = hull(points.map((p, i) => Object.assign([p[0], p[1]], { i })));
  const w = new Float64Array(n);
  if (insideDepth(h, q) < -1e-9) return null;
  const dx = q[0] - c[0], dy = q[1] - c[1];
  if (Math.hypot(dx, dy) < 1e-12 || h.length < 3) { if (h.length < 3 && Math.hypot(dx, dy) > 1e-9) { /* degenerate support (line/point) */ return lineWeights(points, h, q, w); } w.fill(1 / n); return w; }
  // find exit point E = c + s*(q - c), s >= 1, on hull edge (a, b)
  let bestS = Infinity, ea = -1, eb = -1, eu = 0;
  for (let k = 0; k < h.length; k++) {
    const a = h[k], b = h[(k + 1) % h.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const s = ((a[0] - c[0]) * ey - (a[1] - c[1]) * ex) / den, u = ((a[0] - c[0]) * dy - (a[1] - c[1]) * dx) / den;
    if (s > 0 && u >= -1e-9 && u <= 1 + 1e-9 && s < bestS) { bestS = s; ea = a.i; eb = b.i; eu = Math.min(1, Math.max(0, u)); }
  }
  if (ea < 0 || bestS < 1 - 1e-9) return null;
  const t = 1 / bestS; // q = (1 - t) c + t E
  for (let i = 0; i < n; i++) w[i] = (1 - t) / n;
  w[ea] += t * (1 - eu); w[eb] += t * eu;
  return w;
}
function lineWeights(points, h, q, w) {
  if (h.length === 1) { if (Math.hypot(q[0] - h[0][0], q[1] - h[0][1]) > 1e-9) return null; w[h[0].i] = 1; return w; }
  const [a, b] = h, L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const u = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / L2;
  if (u < -1e-9 || u > 1 + 1e-9 || Math.abs(cross(a, b, q)) / Math.sqrt(L2) > 1e-9) return null;
  w[a.i] = 1 - u; w[b.i] = u; return w;
}

// ------------------------------------------------------------------ boxes and contacts
/** Box: { id, x0,y0,z0, x1,y1,z1, m } (metres, kg). */
export const vol = (b) => (b.x1 - b.x0) * (b.y1 - b.y0) * (b.z1 - b.z0);
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** Support contacts under box b: [{ by: index | -1 (floor), rect: [x0,y0,x1,y1] }]. */
export function supportsOf(boxes, i) {
  const b = boxes[i], out = [];
  if (b.z0 < TOUCH) out.push({ by: -1, rect: [b.x0, b.y0, b.x1, b.y1] });
  for (let j = 0; j < boxes.length; j++) {
    if (j === i) continue;
    const c = boxes[j];
    if (Math.abs(c.z1 - b.z0) > TOUCH) continue;
    const ox = overlap(b.x0, b.x1, c.x0, c.x1), oy = overlap(b.y0, b.y1, c.y0, c.y1);
    if (ox > TOUCH && oy > TOUCH) out.push({ by: j, rect: [Math.max(b.x0, c.x0), Math.max(b.y0, c.y0), Math.min(b.x1, c.x1), Math.min(b.y1, c.y1)] });
  }
  return out;
}
export function supportGraph(boxes) { return boxes.map((_, i) => supportsOf(boxes, i)); }
/** Fraction of b's base area resting on supports (the common packing heuristic). */
export function supportRatio(boxes, i, sup = supportsOf(boxes, i)) {
  const b = boxes[i], A = (b.x1 - b.x0) * (b.y1 - b.y0);
  if (sup.some((s) => s.by === -1)) return 1;
  return Math.min(1, sup.reduce((s, c) => s + (c.rect[2] - c.rect[0]) * (c.rect[3] - c.rect[1]), 0) / A);
}

/**
 * Build the load-path certificate under disturbance (ax, ay) in g. Returns
 * { ok, failBox, loads: per box total transmitted load (kg-force), slack: per box inside-depth of
 *   Q in its support hull (m), flows: [{ from, to, point:[x,y,z], f }] }.
 */
export function certify(boxes, ax = 0, ay = 0, sup = supportGraph(boxes)) {
  const n = boxes.length, order = boxes.map((_, i) => i).sort((p, q) => boxes[q].z0 - boxes[p].z0 || p - q);
  const inbound = boxes.map(() => []); // [x,y,z,f]
  const loads = new Float64Array(n), slack = new Float64Array(n).fill(Infinity), flows = [];
  for (const i of order) {
    const b = boxes[i];
    let F = b.m, px = b.m * (b.x0 + b.x1) / 2, py = b.m * (b.y0 + b.y1) / 2, pz = b.m * (b.z0 + b.z1) / 2;
    for (const [x, y, z, f] of inbound[i]) { F += f; px += f * x; py += f * y; pz += f * z; }
    px /= F; py /= F; pz /= F; loads[i] = F;
    const drop = pz - b.z0, q = [px + ax * drop, py + ay * drop];
    const S = sup[i];
    if (!S.length) return { ok: false, failBox: i, loads, slack, flows, reason: 'no support' };
    const corners = [], owner = [];
    for (let k = 0; k < S.length; k++) { const [x0, y0, x1, y1] = S[k].rect; for (const c of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { corners.push(c); owner.push(S[k].by); } }
    const h = hull(corners.map((c) => [c[0], c[1]]));
    slack[i] = insideDepth(h, q);
    if (slack[i] < -1e-9) return { ok: false, failBox: i, loads, slack, flows, q, reason: 'resultant outside support' };
    const w = convexWeights(corners, q);
    if (!w) return { ok: false, failBox: i, loads, slack, flows, q, reason: 'resultant outside support' };
    for (let k = 0; k < corners.length; k++) {
      if (w[k] < 1e-12) continue;
      const f = w[k] * F;
      if (owner[k] >= 0) inbound[owner[k]].push([corners[k][0], corners[k][1], b.z0, f]);
      flows.push({ from: i, to: owner[k], point: [corners[k][0], corners[k][1], b.z0], f });
    }
  }
  return { ok: true, failBox: -1, loads, slack, flows };
}

/** Directions checked for the margin: toward the open face (+x) and both sides. */
export const DIRS = [[1, 0], [0, 1], [0, -1]];
/** Largest disturbance (g, <= cap) in the worst checked direction that keeps a certificate. */
export function margin(boxes, { cap = 0.6, iters = 18, sup = supportGraph(boxes) } = {}) {
  if (!certify(boxes, 0, 0, sup).ok) return 0;
  let worst = cap;
  for (const [dx, dy] of DIRS) {
    if (certify(boxes, dx * worst, dy * worst, sup).ok) continue;
    let lo = 0, hi = worst;
    for (let k = 0; k < iters; k++) { const mid = (lo + hi) / 2; if (certify(boxes, dx * mid, dy * mid, sup).ok) lo = mid; else hi = mid; }
    worst = lo;
  }
  return worst;
}
/** Margin of each individual box as the worst case of its own resultant (for colouring): slack in metres at a = 0. */
export function boxSlack(boxes) { return certify(boxes).slack; }

// ------------------------------------------------------------------ box streams (challenge format)
/**
 * Seeded 120-box sequence in the challenge's format. Size and weight ranges are anchored on the
 * public examples (0.406 x 0.310 x 0.211 m, 3.13 kg; 0.350 x 0.280 x 0.190 m, 2.45 kg; the game's
 * 41.7 x 38.1 x 34.5 cm): corrugated parcels with dimensions 0.15-0.65 m and 60-180 kg/m^3.
 */
export function sequence(seed, n = 120) {
  const r = mulberry32(seed);
  const ln = (mu, s, lo, hi) => { let v; do { const u = r() || 1e-9, u2 = r(); v = dexp(mu + s * Math.sqrt(-2 * dlog(u)) * dcos(2 * Math.PI * u2)); } while (v < lo || v > hi); return v; };
  return Array.from({ length: n }, (_, k) => {
    const d = [ln(dlog(0.40), 0.28, 0.18, 0.65), ln(dlog(0.31), 0.25, 0.15, 0.55), ln(dlog(0.24), 0.30, 0.10, 0.50)].map((v) => Math.round(v * 1000) / 1000);
    const rho = 60 + 120 * r();
    return { id: String(100000 + Math.floor(r() * 900000)), k, dims: d, weight: Math.round(d[0] * d[1] * d[2] * rho * 100) / 100 };
  });
}

// ------------------------------------------------------------------ agents
const ORIENT = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]];
/** Candidate anchor points (extreme points) for the next box. */
function anchors(boxes) {
  const pts = [[0, 0, 0]];
  for (const b of boxes) pts.push([b.x1, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x0, b.y0, b.z1], [0, b.y1, b.z0], [b.x1, 0, b.z0], [0, b.y0, b.z1], [b.x0, 0, b.z1]);
  return pts;
}
const collide = (a, b) => overlap(a.x0, a.x1, b.x0, b.x1) > EPS && overlap(a.y0, a.y1, b.y0, b.y1) > EPS && overlap(a.z0, a.z1, b.z0, b.z1) > EPS;
/** Drop a box at (x, y) from height z to the highest surface below it (no floating placements). */
function settleZ(boxes, c) {
  let z = 0;
  for (const b of boxes) if (overlap(c.x0, c.x1, b.x0, b.x1) > EPS && overlap(c.y0, c.y1, b.y0, b.y1) > EPS && b.z1 <= c.z0 + TOUCH) z = Math.max(z, b.z1);
  const h = c.z1 - c.z0; return { ...c, z0: z, z1: z + h };
}

/**
 * Greedy wall-building agent: candidates = extreme points x 6 orientations, ranked by
 * (pack-front depth after placement, then z, then y, then x); the first candidate that passes the
 * acceptance rule is taken. rule: { kind: 'ratio', min } (fraction of base supported) or
 * { kind: 'cert', margin } (load-path certificate at the given disturbance).
 * Returns { placed, steps: [{ k, accepted, margin, ratio, front, density }], stoppedAt }.
 */
export function pack(seq, rule, truck = TRUCK) {
  const placed = [], steps = [];
  let front = 0, volSum = 0;
  for (const box of seq) {
    const cands = [];
    for (const [px, py, pz] of anchors(placed)) for (const o of ORIENT) {
      const d = [box.dims[o[0]], box.dims[o[1]], box.dims[o[2]]];
      let c = { x0: px, y0: py, z0: pz, x1: px + d[0], y1: py + d[1], z1: pz + d[2], m: box.weight, id: box.id, k: box.k };
      if (c.x1 > truck.depth + EPS || c.y1 > truck.width + EPS || c.z1 > truck.height + EPS) continue;
      c = settleZ(placed, c);
      if (c.z1 > truck.height + EPS) continue;
      cands.push(c);
    }
    cands.sort((a, b) => Math.max(front, a.x1) - Math.max(front, b.x1) || a.z0 - b.z0 || a.y0 - b.y0 || a.x0 - b.x0 || (b.z1 - b.z0) - (a.z1 - a.z0));
    let chosen = null, seen = new Set();
    for (const c of cands) {
      const key = [c.x0, c.y0, c.z0, c.x1, c.y1, c.z1].map((v) => v.toFixed(4)).join();
      if (seen.has(key)) continue; seen.add(key);
      if (placed.some((b) => collide(b, c))) continue;
      const trial = placed.concat([c]);
      if (rule.kind === 'ratio') { if (supportRatio(trial, trial.length - 1) < rule.min - 1e-9) continue; }
      else {
        const sup = supportGraph(trial);
        if (!certify(trial, 0, 0, sup).ok) continue;
        if (rule.margin > 0 && !DIRS.every(([dx, dy]) => certify(trial, dx * rule.margin, dy * rule.margin, sup).ok)) continue;
      }
      chosen = c; break;
    }
    if (!chosen) { steps.push({ k: box.k, accepted: false }); return { placed, steps, stoppedAt: box.k, density: density(placed, truck) }; }
    placed.push(chosen); front = Math.max(front, chosen.x1); volSum += vol(chosen);
    steps.push({ k: box.k, accepted: true, ratio: supportRatio(placed, placed.length - 1), front, density: volSum / (front * truck.width * truck.height) });
  }
  return { placed, steps, stoppedAt: null, density: density(placed, truck) };
}
export function density(placed, truck = TRUCK) {
  if (!placed.length) return 0;
  const front = Math.max(...placed.map((b) => b.x1));
  return placed.reduce((s, b) => s + vol(b), 0) / (front * truck.width * truck.height);
}
/** Interquartile mean (the challenge's ranking statistic). */
export function iqm(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length, lo = Math.floor(n / 4), hi = Math.ceil((3 * n) / 4);
  const mid = s.slice(lo, hi); return mid.reduce((a, b) => a + b, 0) / mid.length;
}
/** Audit a finished pack: certified at rest?, margin after every placement prefix, worst box. */
export function audit(placed, { cap = 0.6 } = {}) {
  const prefix = [];
  for (let k = 1; k <= placed.length; k++) { const sub = placed.slice(0, k), sup = supportGraph(sub); prefix.push({ k, ok: certify(sub, 0, 0, sup).ok, margin: margin(sub, { cap, sup }) }); }
  return prefix;
}
