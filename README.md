# Kevin, the riff comic (front end)

Keep circulating Kevin. This is the front end of https://roastedbykevin.com and the style-pack format (PACKS.md).
Hack anything in the "Hack this" column of https://roastedbykevin.com/hack: the look, language, humor style,
catchphrases, references and the meme wording.

Kevin's brain and safety layer run only at roastedbykevin.com; this repo does not include them. To use the name
"Kevin", the look or the stamp, keep the charter (CHARTER.md) whole: see LICENSE-KEVIN. Anyone can build their own
bot; only one that keeps the charter whole may be called Kevin.

## Desktop Kevin

`desktop/` is a tiny Electron app that floats the live https://roastedbykevin.com/sprite on your screen (frameless, always on top, tray menu, no permissions). Builds come from `.github/workflows/desktop.yml` on a `desktop-v*` tag and land in Releases. Smoke test: `cd desktop && npm ci && npm run smoke` (hidden window).
