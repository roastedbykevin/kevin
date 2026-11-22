// What's playing, read only from allow-listed media apps and media sites: a title, the app's name, play or pause, and
// (Windows) whether video is full screen and where the media window is. Never other windows, never screenshots.
const { execFile } = require('child_process');
const run = (cmd, args, timeout = 5000) => new Promise(res => execFile(cmd, args, { timeout, windowsHide: true }, (e, out) => res(e ? '' : String(out).trim())));

const SITES = [
  [/(^|\.)music\.youtube\.com$/, 'YouTube Music', / - YouTube Music$/], [/(^|\.)youtube\.com$/, 'YouTube', / - YouTube$/],
  [/(^|\.)netflix\.com$/, 'Netflix', /^Netflix$| \| Netflix$/], [/(^|\.)primevideo\.com$|(^|\.)amazon\.com$/, 'Prime Video', /^Prime Video: |^Amazon\.com: /],
  [/(^|\.)disneyplus\.com$/, 'Disney+', / \| Disney\+$/], [/(^|\.)max\.com$/, 'Max', / \| Max$/], [/(^|\.)hulu\.com$/, 'Hulu', / \| Hulu$/], [/^tv\.apple\.com$/, 'Apple TV', / - Apple TV\+?$/]
];
// A browser tab counts only on an allow-listed media site, and only with a real title (not just the site's name).
function fromTab(url, title) {
  let host; try { host = new URL(url).hostname; } catch { return null; }
  const s = SITES.find(([re]) => re.test(host));
  if (!s || (s[1] === 'Prime Video' && host.endsWith('amazon.com') && !/\/gp\/video|\/video\//.test(url))) return null;
  const t = String(title || '').replace(s[2], '').trim();
  return t && t !== s[1] ? { app: s[1], title: t, playing: true } : null;
}

const MAC = [
  ['Spotify', 'Spotify', 'tell application "Spotify" to return (name of current track) & tab & (player state as string)'],
  ['Music', 'Apple Music', 'tell application "Music" to return (name of current track) & tab & (player state as string)'],
  ['TV', 'Apple TV', 'tell application "TV" to return (name of current track) & tab & (player state as string)'],
  ['VLC', 'VLC', 'tell application "VLC" to return (name of current item) & tab & (playing as string)']
];
async function mac() {
  for (const [proc, app, script] of MAC) {
    if (!await run('pgrep', ['-x', proc])) continue; // never touch an app that isn't open
    const [title, state] = (await run('osascript', ['-e', script])).split('\t');
    if (title && /playing|true/.test(state || '')) return { app, title, playing: true };
  }
  for (const [proc, script] of [['Safari', 'tell application "Safari" to return (URL of current tab of front window) & tab & (name of current tab of front window)'],
    ['Google Chrome', 'tell application "Google Chrome" to return (URL of active tab of front window) & tab & (title of active tab of front window)']]) {
    if (!await run('pgrep', ['-x', proc])) continue;
    const [url, title] = (await run('osascript', ['-e', script])).split('\t');
    const m = fromTab(url, title); if (m) return m;
  }
  return null;
}

const WIN_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$m = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $m.GetCurrentSession()
if (-not $s) { exit }
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
Add-Type @"
using System; using System.Runtime.InteropServices;
public class KW { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
public struct R { public int L, T, Rt, B; } }
"@
Add-Type -AssemblyName System.Windows.Forms
$h = [KW]::GetForegroundWindow(); $r = New-Object KW+R; [KW]::GetWindowRect($h, [ref]$r) | Out-Null
$pid0 = 0; [KW]::GetWindowThreadProcessId($h, [ref]$pid0) | Out-Null
$fg = (Get-Process -Id $pid0).ProcessName
$b = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
$full = ($r.L -le $b.Left -and $r.T -le $b.Top -and $r.Rt -ge $b.Right -and $r.B -ge $b.Bottom)
$browserTitle = ''
if ($s.SourceAppUserModelId -match 'chrome|msedge|firefox|brave|opera') { $browserTitle = (Get-Process -Name ($s.SourceAppUserModelId -replace '\.exe$','') | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle }
@{ id = $s.SourceAppUserModelId; title = $p.Title; status = [string]$s.GetPlaybackInfo().PlaybackStatus; full = $full; fg = $fg; rect = @($r.L, $r.T, $r.Rt, $r.B); tab = $browserTitle } | ConvertTo-Json -Compress
`;
const WIN_APPS = [[/spotify/i, 'Spotify'], [/AppleInc\.AppleMusic|AppleMusic/i, 'Apple Music'], [/AppleInc\.AppleTV|AppleTV/i, 'Apple TV'], [/netflix/i, 'Netflix'],
  [/disney/i, 'Disney+'], [/primevideo|amazon/i, 'Prime Video'], [/vlc/i, 'VLC'], [/hulu/i, 'Hulu']];
const BROWSER_SITES = [[/ - YouTube Music/, 'YouTube Music'], [/ - YouTube/, 'YouTube'], [/Netflix/, 'Netflix'], [/Prime Video/, 'Prime Video'], [/Disney\+/, 'Disney+'], [/\| Max/, 'Max'], [/Hulu/, 'Hulu'], [/Apple TV/, 'Apple TV']];
async function win() {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_PS], 8000);
  let j; try { j = JSON.parse(out); } catch { return null; }
  if (!j.title) return null;
  let app = (WIN_APPS.find(([re]) => re.test(j.id)) || [])[1];
  if (!app && j.tab) app = (BROWSER_SITES.find(([re]) => re.test(j.tab)) || [])[1]; // a browser counts only on a media site
  if (!app) return null;
  const mediaFg = new RegExp(app.split(' ')[0], 'i').test(j.fg) || /chrome|msedge|firefox|brave|opera/i.test(j.fg);
  return { app, title: j.title, playing: j.status === 'Playing', fullscreen: !!j.full && mediaFg, rect: mediaFg ? j.rect : null };
}

// KEVIN_MOCK_MEDIA (tests only): a JSON object, or an array that advances one entry per poll.
let mockI = 0;
async function nowPlaying() {
  if (process.env.KEVIN_MOCK_MEDIA) { const m = JSON.parse(process.env.KEVIN_MOCK_MEDIA); return Array.isArray(m) ? m[Math.min(mockI++, m.length - 1)] : m; }
  if (process.platform === 'darwin') return mac();
  if (process.platform === 'win32') return win();
  return null;
}
module.exports = { nowPlaying, fromTab };
