// Runs the app with a hidden window against the live /sprite and exits 0 when Kevin's face loads (no sound, no window).
const { spawnSync } = require('child_process');
const electron = require('electron');
// "node smoke.js media" also mocks now-playing data (no real media, no sound) and waits for Kevin to riff it.
// "node smoke.js wake [clip.wav]" feeds a 16 kHz clip to the ear (no mic) and needs a wake plus the handed-over clip.
const path = require('path');
const mock = process.argv[2] === 'media' ? { KEVIN_MOCK_MEDIA: JSON.stringify({ title: 'In a World: The Trailer Voice Supercut', app: 'YouTube', playing: true }) }
  : process.argv[2] === 'wake' ? { KEVIN_EAR_FIXTURE: path.resolve(process.argv[3] || path.join(__dirname, 'test', 'hey-kevin-then-ask.wav')) } : {};
const r = spawnSync(electron, ['.'], { cwd: __dirname, env: { ...process.env, KEVIN_SMOKE: '1', ELECTRON_ENABLE_LOGGING: '0', ...mock }, encoding: 'utf8', timeout: 120000 });
process.stdout.write(r.stdout || ''); process.stderr.write((r.stderr || '').split('\n').filter(l => /SMOKE/.test(l)).join('\n'));
process.exit(r.status === 0 && /SMOKE OK/.test(r.stdout || '') ? 0 : 1);
