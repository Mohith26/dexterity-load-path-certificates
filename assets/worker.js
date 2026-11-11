// Runs an agent off the main thread: pack 120 boxes and audit the margin after every placement.
import * as L from '../src/loadpath.js';
self.onmessage = (e) => {
  const { id, seed, rule } = e.data;
  try {
    const g = L.pack(L.sequence(seed), rule);
    const margins = L.audit(g.placed, { cap: 0.5 }).map((a) => +a.margin.toFixed(4));
    self.postMessage({ id, run: { placed: g.placed, margins, density: g.density, stoppedAt: g.stoppedAt } });
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
