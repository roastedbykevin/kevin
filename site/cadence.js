// When Kevin pops a riff on what's playing: every few minutes with jitter, never on a fixed loop, and he backs off
// when ignored (every 3 ignored riffs, half as often). Any interaction resets him. Pure, so it is unit-tested.
export function cadence({ baseMs = 4 * 60000, jitter = 0.5, maxMs = 40 * 60000, random = Math.random } = {}) {
  let factor = 1, ignored = 0;
  return {
    next() { const ms = baseMs * factor; return Math.min(maxMs, Math.round(ms * (1 - jitter / 2 + random() * jitter))); },
    ignored() { ignored++; if (ignored % 3 === 0) factor *= 2; return factor; },
    engaged() { ignored = 0; factor = 1; },
    get factor() { return factor; }
  };
}
