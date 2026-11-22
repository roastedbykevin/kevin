// Runs the app with a hidden window against the live /sprite and exits 0 when Kevin's face loads (no sound, no window).
const { spawnSync } = require('child_process');
const electron = require('electron');
const r = spawnSync(electron, ['.'], { cwd: __dirname, env: { ...process.env, KEVIN_SMOKE: '1', ELECTRON_ENABLE_LOGGING: '0' }, encoding: 'utf8', timeout: 60000 });
process.stdout.write(r.stdout || ''); process.stderr.write((r.stderr || '').split('\n').filter(l => /SMOKE/.test(l)).join('\n'));
process.exit(r.status === 0 && /SMOKE OK/.test(r.stdout || '') ? 0 : 1);
