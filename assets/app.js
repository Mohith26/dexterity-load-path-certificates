import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as L from '../src/loadpath.js';

const $ = (s) => document.querySelector(s);
const T = L.TRUCK;
const CARD = 0xb07a3b, STORE = 'dex-loadpath-v1';
let RES, SHOW, runs = {}, state = { agent: 'cert05', seed: 1007, step: 120, sel: -1, m: 0.05 }, playing = null;

// ------------------------------------------------------------------ three.js scene (game view: from the doors)
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 50);
const HOME = { pos: new THREE.Vector3(T.width / 2, 1.85, T.depth + 2.35), tgt: new THREE.Vector3(T.width / 2, 1.05, 0.55) };
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.maxDistance = 9; controls.minDistance = 1;
function resetView() { camera.position.copy(HOME.pos); controls.target.copy(HOME.tgt); controls.update(); }
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3020, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(1.5, 4, 4); scene.add(sun);

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#4b3a2b'; g.fillRect(0, 0, 512, 512);
  const r = L.mulberry32(4);
  for (let i = 0; i < 512; i += 32) { g.fillStyle = `rgba(${40 + r() * 30},${30 + r() * 20},${20 + r() * 10},0.55)`; g.fillRect(i, 0, 30, 512); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i + 30, 0, 2, 512); }
  for (let k = 0; k < 1400; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 8 + r() * 40); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wallTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#9a9a9a'); grd.addColorStop(1, '#6e6e6e'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const r = L.mulberry32(8); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 6, 2 + r() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const room = new THREE.Group(); scene.add(room);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(T.width, T.depth + 3), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(T.width / 2, 0, (T.depth + 3) / 2); room.add(floor);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95, side: THREE.DoubleSide });
for (const x of [0, T.width]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(T.depth + 3, T.height), wallMat); w.rotation.y = Math.PI / 2; w.position.set(x, T.height / 2, (T.depth + 3) / 2); room.add(w); }
const front = new THREE.Mesh(new THREE.PlaneGeometry(T.width, T.height), new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 1 })); front.position.set(T.width / 2, T.height / 2, 0); room.add(front);
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(T.width, T.depth + 3), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.set(T.width / 2, T.height, (T.depth + 3) / 2); room.add(ceil);
// side rails like the game's logistics posts
const railMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.4, roughness: 0.6 });
for (const x of [0.02, T.width - 0.02]) for (const z of [0.6, 1.4, 2.2, 3.0, 3.8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, T.height, 0.06), railMat); p.position.set(x, T.height / 2, z); room.add(p); }
// segment boundary (the 2.0 m challenge segment)
const seg = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(T.width, T.height, T.depth)), new THREE.LineDashedMaterial({ color: 0x48cae4, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.35 }));
seg.position.set(T.width / 2, T.height / 2, T.depth / 2); seg.computeLineDistances(); scene.add(seg);

const boxGroup = new THREE.Group(), pathGroup = new THREE.Group(); scene.add(boxGroup, pathGroup);
let meshes = [];
const toThree = (b) => ({ cx: (b.y0 + b.y1) / 2, cy: (b.z0 + b.z1) / 2, cz: (b.x0 + b.x1) / 2, sx: b.y1 - b.y0, sy: b.z1 - b.z0, sz: b.x1 - b.x0 });
function boxTexture(seed) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'), r = L.mulberry32(seed);
  g.fillStyle = '#b5803f'; g.fillRect(0, 0, 64, 64); for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,230,190'},${r() * 0.06})`; g.fillRect(r() * 64, r() * 64, 3, 3); }
  g.fillStyle = 'rgba(120,80,30,.35)'; g.fillRect(29, 0, 6, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const texes = Array.from({ length: 6 }, (_, i) => boxTexture(i + 1));
function buildBoxes(placed) {
  boxGroup.clear(); meshes = [];
  placed.forEach((b, i) => {
    const t = toThree(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.sx - 0.004, t.sy - 0.004, t.sz - 0.004), new THREE.MeshStandardMaterial({ map: texes[i % 6], roughness: 0.85, color: 0xffffff }));
    m.position.set(t.cx, t.cy, t.cz); m.userData.i = i;
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x5a3d1c, transparent: true, opacity: 0.7 })));
    boxGroup.add(m); meshes.push(m);
  });
}
function paint() {
  const run = cur(), k = state.step, weak = weakest();
  meshes.forEach((m, i) => {
    m.visible = i < k;
    const mat = m.material;
    mat.emissive = new THREE.Color(0x000000); mat.color.set(0xffffff);
    if (i === k - 1) mat.emissive.set(0x0b3b44);
    if (i === weak) { mat.color.set(0xffe08a); mat.emissive.set(0x3a2a00); }
    if (run.failAt && i === run.failAt) { mat.color.set(0xff8080); mat.emissive.set(0x400000); }
    if (i === state.sel) { mat.emissive.set(0x00566b); }
  });
  drawPath();
}

// ------------------------------------------------------------------ data
const cur = () => runs[`${state.agent}:${state.seed}:${state.agent === 'cert05' ? state.m : 0.7}`];
const rule = () => (state.agent === 'ratio70' ? { kind: 'ratio', min: 0.7 } : { kind: 'cert', margin: state.m });
function weakest() {
  const run = cur(), k = state.step, sub = run.placed.slice(0, k), mg = run.margins[k - 1];
  if (mg >= 0.5) return -1;
  const sup = L.supportGraph(sub);
  if (!L.certify(sub, 0, 0, sup).ok) return L.certify(sub, 0, 0, sup).failBox;
  const a = mg + 0.004;
  for (const [dx, dy] of L.DIRS) { const c = L.certify(sub, dx * a, dy * a, sup); if (!c.ok) return c.failBox; }
  return -1;
}
let worker = null;
function runAgent(seed, agent, m) {
  const key = `${agent}:${seed}:${agent === 'cert05' ? m : 0.7}`;
  if (runs[key]) return Promise.resolve(runs[key]);
  worker = worker || new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  return new Promise((res, rej) => {
    const id = Math.random();
    const on = (e) => { if (e.data.id !== id) return; worker.removeEventListener('message', on); if (e.data.error) rej(new Error(e.data.error)); else { runs[key] = e.data.run; res(e.data.run); } };
    worker.addEventListener('message', on);
    worker.postMessage({ id, seed, rule: agent === 'ratio70' ? { kind: 'ratio', min: 0.7 } : { kind: 'cert', margin: m } });
  });
}

// ------------------------------------------------------------------ HUD
const pct = (x, d = 1) => (100 * x).toFixed(d) + '%';
const cm = (d) => d.map((v) => (v * 100).toFixed(1)).join(' x ') + ' cm';
function hud() {
  const run = cur(), k = state.step, sub = run.placed.slice(0, k);
  $('#dens').textContent = pct(L.density(sub));
  $('#placed').textContent = k;
  const mg = run.margins[k - 1];
  const ok = mg > 0, chip = $('#chip');
  chip.className = 'chip ' + (!ok ? 'bad' : mg < 0.02 ? 'warn' : 'ok');
  chip.textContent = !ok ? 'No load path' : mg < 0.02 ? 'Marginal' : 'Certified';
  $('#marg').textContent = ok ? `${mg >= 0.5 ? '≥ 0.50' : mg.toFixed(3)} g` : '0 g';
  $('#stepLbl').textContent = `Step ${k} / ${run.placed.length}${run.stoppedAt != null ? ' · stopped' : ''}`;
  $('#step').max = run.placed.length; $('#step').value = k;
  $('#segm').textContent = state.m.toFixed(2);
  document.querySelectorAll('.seg [data-agent]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.agent === state.agent)));
  const seq = SHOW.seed === state.seed ? SHOW.sequence : L.sequence(state.seed);
  const cb = seq[k - 1], nb = seq[k];
  drawBox($('#cur'), cb?.dims); $('#curDims').textContent = cb ? `${cm(cb.dims)} · ${cb.weight} kg` : '–';
  drawBox($('#nxt'), nb?.dims); $('#nxtDims').textContent = nb ? `${cm(nb.dims)} · ${nb.weight} kg` : 'end of sequence';
  spark();
}
function drawBox(cv, d) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
  if (!d) return;
  const s = 120 / Math.max(...d) * 0.62, a = d[0] * s, b = d[1] * s * 0.6, h = d[2] * s, cx = W / 2, cy = H / 2 + h / 2 - b / 4;
  const P = (x, y) => [cx + x, cy + y];
  const top = [P(-a / 2, -h - b / 2), P(a / 2 - b / 2 + b / 2, -h - b / 2), P(a / 2 + b / 2 - b / 2 + b / 2 - b / 2 + b / 2, -h), P(-a / 2 + b / 2 + 0, -h + 0)];
  // simple oblique projection
  const fx = -a / 2 - b / 4, fy = -h / 2 + b / 4;
  const front = [[fx, fy], [fx + a, fy], [fx + a, fy + h], [fx, fy + h]];
  const off = [b * 0.5, -b * 0.5];
  const poly = (pts, c) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x, cy - h / 2 + y) : g.moveTo(cx + x, cy - h / 2 + y))); g.closePath(); g.fillStyle = c; g.fill(); g.strokeStyle = 'rgba(70,45,15,.9)'; g.lineWidth = 1; g.stroke(); };
  poly([front[0], [front[0][0] + off[0], front[0][1] + off[1]], [front[1][0] + off[0], front[1][1] + off[1]], front[1]], '#d39a55');
  poly([front[1], [front[1][0] + off[0], front[1][1] + off[1]], [front[2][0] + off[0], front[2][1] + off[1]], front[2]], '#8f5f2a');
  poly(front, '#b5803f');
  void top;
}
function spark() {
  const run = cur(), n = run.margins.length, W = 800, H = 70, cap = 0.2;
  const x = (i) => (i / Math.max(1, n - 1)) * W, y = (v) => H - 4 - (Math.min(cap, v) / cap) * (H - 10);
  let s = `<line x1="0" x2="${W}" y1="${y(0.02)}" y2="${y(0.02)}" stroke="rgba(255,101,104,.35)" stroke-dasharray="2 4"/>`;
  if (state.agent === 'cert05') s += `<line x1="0" x2="${W}" y1="${y(state.m)}" y2="${y(state.m)}" stroke="#05df72" stroke-dasharray="6 4" opacity=".8"/>`;
  run.margins.forEach((m, i) => { if (m < 0.02) s += `<rect x="${x(i) - 1.5}" y="${H - 14}" width="3" height="12" fill="#ff6568"/>`; });
  s += `<path d="${run.margins.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m).toFixed(1)}`).join('')}" fill="none" stroke="#00b4d8" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  s += `<line x1="${x(state.step - 1)}" x2="${x(state.step - 1)}" y1="0" y2="${H}" stroke="#fff" stroke-width="1" opacity=".7" vector-effect="non-scaling-stroke"/>`;
  $('#spark').innerHTML = s;
}

// ------------------------------------------------------------------ load path drawing + box detail
function drawPath() {
  pathGroup.clear();
  if (state.sel < 0 || state.sel >= state.step) return;
  const run = cur(), sub = run.placed.slice(0, state.step), c = L.certify(sub);
  if (!c.ok) return;
  const mat = new THREE.LineBasicMaterial({ color: 0x00b4d8 }), dot = new THREE.MeshBasicMaterial({ color: 0x48cae4 });
  const seen = new Set([state.sel]), queue = [state.sel];
  while (queue.length) {
    const i = queue.shift(), b = sub[i], ct = toThree(b);
    for (const f of c.flows.filter((q) => q.from === i)) {
      const p = new THREE.Vector3(f.point[1], f.point[2] + 0.003, f.point[0]);
      pathGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ct.cx, ct.cy, ct.cz), p]), mat));
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008 + 0.03 * Math.sqrt(f.f / c.loads[state.sel]), 10, 8), dot); s.position.copy(p); pathGroup.add(s);
      if (f.to >= 0 && !seen.has(f.to)) { seen.add(f.to); queue.push(f.to); }
    }
  }
}
function openBox(i) {
  state.sel = i; paint();
  const run = cur(), sub = run.placed.slice(0, state.step), b = sub[i], sup = L.supportsOf(sub, i), c = L.certify(sub);
  const ratio = L.supportRatio(sub, i, sup), d = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0];
  const flows = c.ok ? c.flows.filter((f) => f.from === i) : [];
  const by = {}; flows.forEach((f) => { by[f.to] = (by[f.to] || 0) + f.f; });
  $('#dbody').innerHTML = `<div class="eyebrow">Box ${b.id} · placement ${i + 1}</div><h2>${cm(d)}</h2>
    <p>${b.m.toFixed(2)} kg, placed at x ${b.x0.toFixed(3)}–${b.x1.toFixed(3)} m, height ${b.z0.toFixed(3)} m.</p>
    <div class="kv"><div>Base resting on supports</div><div class="v ${ratio < 0.7 ? 'warn' : ''}">${pct(ratio, 0)}</div>
    <div>Load carried (own + above)</div><div class="v">${c.ok ? c.loads[i].toFixed(1) + ' kgf' : '—'}</div>
    <div>Resultant inside support hull by</div><div class="v ${c.ok && c.slack[i] < 0.02 ? 'warn' : ''}">${c.ok ? (100 * c.slack[i]).toFixed(1) + ' cm' : '—'}</div>
    <div>Stack margin at this step</div><div class="v">${run.margins[state.step - 1].toFixed(3)} g</div></div>
    <div class="eyebrow" style="margin-top:18px">Load handed down</div>
    <table class="lb"><thead><tr><th>To</th><th style="text-align:right">Force</th><th style="text-align:right">Share</th></tr></thead><tbody>
    ${Object.entries(by).sort((p, q) => q[1] - p[1]).map(([to, f]) => `<tr><td>${+to < 0 ? 'Floor' : `Box ${sub[+to].id} (#${+to + 1})`}</td><td class="n">${f.toFixed(1)} kgf</td><td class="n">${pct(f / c.loads[i], 0)}</td></tr>`).join('') || '<tr><td colspan="3">No load path at rest</td></tr>'}
    </tbody></table>
    <p>The cyan lines in the truck trace this box's load to the floor. A load-path certificate is a set of contact forces that balances every box; the margin is the largest sideways or door-ward disturbance (in g) for which one still exists.</p>`;
  openDrawer();
}
function openCompare() {
  const R = RES.rules, rows = ['ratio70', 'ratio80', 'cert00', 'cert02', 'cert05', 'cert08'];
  const W = 400, H = 180, L0 = 36, B = 24, xs = (m) => L0 + (m / 0.1) * (W - L0 - 10), ys = (d) => H - B - ((d - 30) / 30) * (H - B - 10);
  let ch = '';
  for (const d of [30, 40, 50, 60]) ch += `<line x1="${L0}" x2="${W - 10}" y1="${ys(d)}" y2="${ys(d)}" stroke="#1e293b"/><text x="${L0 - 6}" y="${ys(d) + 4}" text-anchor="end" fill="#94a3b8" font-size="10" font-family="JetBrains Mono">${d}%</text>`;
  for (const m of [0, 0.02, 0.05, 0.08, 0.1]) ch += `<text x="${xs(m)}" y="${H - 6}" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="JetBrains Mono">${m}</text>`;
  const cert = ['cert00', 'cert02', 'cert05', 'cert08'].map((k) => [R[k].rule.margin, R[k].iqmDensityPct]);
  ch += `<path d="${cert.map(([m, d], j) => `${j ? 'L' : 'M'}${xs(m)},${ys(d)}`).join('')}" fill="none" stroke="#00b4d8" stroke-width="2"/>`;
  cert.forEach(([m, d]) => { ch += `<circle cx="${xs(m)}" cy="${ys(d)}" r="4" fill="#00b4d8"/>`; });
  for (const k of ['ratio70', 'ratio80']) { const m = Math.max(0, R[k].worstGameMinMarginG); ch += `<circle cx="${xs(m)}" cy="${ys(R[k].iqmDensityPct)}" r="5" fill="none" stroke="#fac800" stroke-width="2"/><text x="${xs(m) + 8}" y="${ys(R[k].iqmDensityPct) + 4}" fill="#fac800" font-size="10" font-family="JetBrains Mono">${k === 'ratio70' ? '70%' : '80%'} rule</text>`; }
  $('#dbody').innerHTML = `<div class="eyebrow">Foresight API Challenge format · ${RES.seeds} sequences × 120 boxes</div><h2>Certified placements pack denser</h2>
    <p>Same greedy wall-builder, same candidate order, only the acceptance test differs. A support-ratio rule both rejects stable bridges and accepts unstable stacks; the certificate accepts exactly what it can balance, with a guaranteed margin.</p>
    <table class="lb"><thead><tr><th>Acceptance test</th><th style="text-align:right">IQM density</th><th style="text-align:right">Worst margin</th><th style="text-align:right">Games &lt; 0.02 g</th></tr></thead><tbody>
    ${rows.map((k) => `<tr class="${k === 'cert05' ? 'hi' : k === 'ratio70' ? 'base' : ''}"><td>${R[k].label}</td><td class="n d">${R[k].iqmDensityPct.toFixed(1)}%</td><td class="n">${R[k].worstGameMinMarginG.toFixed(3)} g</td><td class="n">${R[k].gamesWithStepBelow002g}</td></tr>`).join('')}
    </tbody></table>
    <div class="eyebrow">IQM density vs guaranteed margin</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Density versus margin">${ch}</svg>
    <p style="margin-top:10px">Worst margin = the lowest certified margin after any placement in any of the ${RES.seeds} games (0 = some placement had no load path at rest). Densities use the challenge formula.</p>`;
  openDrawer();
}
function openRun() {
  $('#dbody').innerHTML = `<div class="eyebrow">Run settings</div><h2>Re-pack a sequence</h2>
    <p>Runs the certified agent in your browser on any seeded 120-box sequence, checking a load-path certificate at the margin floor in three directions before every placement.</p>
    <div class="field"><label for="seedIn">Sequence seed (1001–1050 are the benchmark set)</label><input id="seedIn" type="number" min="1" max="999999" value="${state.seed}"></div>
    <div class="field"><label for="mIn">Margin floor (g)</label><input id="mIn" type="number" min="0" max="0.2" step="0.01" value="${state.m}"></div>
    <button class="btn-green" id="go">Re-pack</button><p id="runMsg" style="margin-top:12px"></p>`;
  $('#go').onclick = async () => {
    const seed = Math.max(1, Math.min(999999, Math.round(+$('#seedIn').value || 1007))), m = Math.max(0, Math.min(0.2, Math.round(100 * (+$('#mIn').value || 0)) / 100));
    $('#go').disabled = true; $('#runMsg').textContent = 'Packing 120 boxes with certificates…';
    try { await Promise.all([runAgent(seed, 'cert05', m), runAgent(seed, 'ratio70', m)]); Object.assign(state, { seed, m, agent: 'cert05' }); state.step = cur().placed.length; state.sel = -1; persist(); refresh(); $('#runMsg').innerHTML = `<span class="ok">Done.</span> Certified ${pct(cur().density)} vs 70% rule ${pct(runs[`ratio70:${seed}:0.7`].density)} on this sequence.`; }
    catch (e) { $('#runMsg').innerHTML = `<span class="bad">Run failed: ${e.message}</span>`; }
    $('#go').disabled = false;
  };
  openDrawer();
}
function openHelp() {
  $('#dbody').innerHTML = `<div class="eyebrow">Keyboard</div><h2>Shortcuts</h2><div class="kv">${[['1 / 2', 'Support rule / certified agent'], ['← →', 'Step through placements'], ['Space', 'Play / pause'], ['Click a box', 'Inspect its load path'], ['C', 'Results over 50 sequences'], ['R', 'Re-pack settings'], ['E', 'Export placements + certificates'], ['V', 'Reset view'], ['Esc', 'Close panel']].map(([k, v]) => `<div>${v}</div><div class="v">${k}</div>`).join('')}</div>`;
  openDrawer();
}
function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); syncHash(); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); state.sel = -1; paint(); syncHash(); }

// ------------------------------------------------------------------ export (challenge /place payloads + certificate)
function exportJSON() {
  const run = cur(), seq = SHOW.seed === state.seed ? SHOW.sequence : L.sequence(state.seed);
  const quat = (b, s) => { const d = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].map((v) => +v.toFixed(3)), o = s.dims.map((v) => +v.toFixed(3)); const perm = [0, 1, 2].map((ax) => o.findIndex((v, j) => Math.abs(v - d[ax]) < 1e-3)); const key = perm.join(''); return { '012': [1, 0, 0, 0], '102': [0.7071, 0, 0, 0.7071], '021': [0.7071, 0.7071, 0, 0], '210': [0.7071, 0, 0.7071, 0], '120': [0.5, 0.5, 0.5, 0.5], '201': [0.5, -0.5, -0.5, -0.5] }[key] || [1, 0, 0, 0]; };
  const payload = { agent: state.agent === 'ratio70' ? 'support>=70%' : `certified>=${state.m}g`, seed: state.seed, truck: T, density: +run.density.toFixed(4),
    placements: run.placed.map((b, i) => ({ box_id: b.id, position: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2].map((v) => +v.toFixed(4)), orientation_wxyz: quat(b, seq[b.k]), certificate: { margin_g: run.margins[i], certified_at_rest: run.margins[i] > 0 } })) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
  a.download = `foresight-loadpath-${state.agent}-${state.seed}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Exported placements with certificates');
}

// ------------------------------------------------------------------ chrome
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2000); }
function syncHash() { const h = `#agent=${state.agent}&seed=${state.seed}&m=${state.m}&step=${state.step}${state.sel >= 0 ? `&box=${state.sel}` : ''}`; if (h !== location.hash) history.replaceState(null, '', h); }
function persist() { localStorage.setItem(STORE, JSON.stringify({ agent: state.agent, seed: state.seed, m: state.m })); }
function setStep(k) { const run = cur(); state.step = Math.max(1, Math.min(run.placed.length, k)); if (state.sel >= state.step) state.sel = -1; paint(); hud(); syncHash(); }
let builtFor = null;
function refresh() { const run = cur(), key = `${state.agent}:${state.seed}:${state.m}`; if (builtFor !== key) { buildBoxes(run.placed); builtFor = key; } state.step = Math.min(state.step, run.placed.length); paint(); hud(); syncHash(); }
async function setAgent(a) { if (a === state.agent) return; try { await runAgent(state.seed, a, state.m); } catch (e) { toast('Run failed: ' + e.message); return; } state.agent = a; state.step = cur().placed.length; state.sel = -1; persist(); refresh(); if ($('#drawer').classList.contains('open')) closeDrawer(); toast(a === 'ratio70' ? 'Support ≥ 70% rule' : `Certified ≥ ${state.m} g`); }
function togglePlay() { if (playing) { clearInterval(playing); playing = null; $('#play').textContent = 'Play'; return; } if (state.step >= cur().placed.length) setStep(1); $('#play').textContent = 'Pause'; playing = setInterval(() => { if (state.step >= cur().placed.length) { togglePlay(); return; } setStep(state.step + 1); }, 90); }

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => { canvas._down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!canvas._down || Math.hypot(e.clientX - canvas._down[0], e.clientY - canvas._down[1]) > 4) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(meshes.filter((m) => m.visible), false)[0];
  if (hit) openBox(hit.object.userData.i); else if (state.sel >= 0) { state.sel = -1; paint(); }
});
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }

async function main() {
  try {
    [RES, SHOW] = await Promise.all([fetch('results/results.json').then((r) => r.json()), fetch('data/showcase.json').then((r) => { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })]);
  } catch (e) { $('#boot').innerHTML = `<span class="bad">Couldn't load the packed truck (${e.message}). Reload to retry.</span>`; return; }
  for (const k of ['ratio70', 'cert05']) runs[`${k}:${SHOW.seed}:${k === 'cert05' ? 0.05 : 0.7}`] = { ...SHOW.games[k], stoppedAt: null };
  const q = new URLSearchParams(location.hash.slice(1)), saved = JSON.parse(localStorage.getItem(STORE) || 'null') || {};
  state.agent = q.get('agent') || saved.agent || 'cert05'; if (!['ratio70', 'cert05'].includes(state.agent)) state.agent = 'cert05';
  state.seed = +(q.get('seed') || saved.seed || SHOW.seed) || SHOW.seed; state.m = +(q.get('m') ?? saved.m ?? 0.05); if (!(state.m >= 0 && state.m <= 0.2)) state.m = 0.05;
  resize(); resetView(); loop();
  try { await runAgent(state.seed, state.agent, state.m); } catch { Object.assign(state, { seed: SHOW.seed, m: 0.05 }); }
  state.step = +(q.get('step') || cur().placed.length);
  refresh();
  $('#boot').remove();
  if (q.has('box')) { const i = +q.get('box'); if (i >= 0 && i < state.step) openBox(i); }
  $('#step').addEventListener('input', (e) => setStep(+e.target.value));
  $('#spark').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); setStep(Math.round(((e.clientX - r.left) / r.width) * (cur().placed.length - 1)) + 1); });
  document.querySelectorAll('.seg [data-agent]').forEach((b) => b.addEventListener('click', () => setAgent(b.dataset.agent)));
  $('#resetView').onclick = resetView; $('#play').onclick = togglePlay; $('#reset').onclick = () => { if (playing) togglePlay(); setStep(1); };
  $('#help').onclick = openHelp; $('#openCompare').onclick = openCompare; $('#openRun').onclick = openRun; $('#export').onclick = exportJSON; $('#dclose').onclick = closeDrawer;
  addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === '1') setAgent('ratio70'); else if (k === '2') setAgent('cert05');
    else if (k === 'ArrowRight') { e.preventDefault(); setStep(state.step + 1); } else if (k === 'ArrowLeft') { e.preventDefault(); setStep(state.step - 1); }
    else if (k === ' ') { e.preventDefault(); togglePlay(); } else if (k === 'Escape') closeDrawer();
    else if (k === 'c') openCompare(); else if (k === 'r') openRun(); else if (k === 'e') exportJSON(); else if (k === 'v') resetView(); else if (k === '?') openHelp();
  });
}
main();
