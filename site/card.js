// Renders the roast card (1080x1350, made for posting): Kevin's face, the NPC dialogue box, the meme line,
// the roast, the chain path when the players allowed names, and the link. Returns a PNG blob.
const C = { sleeve: '#F5B323', deep: '#E89A0C', ink: '#1F1206', soft: '#4A2E0E', pink: '#D81B60', cream: '#FFF4DA' };

function faceImage(kev) {
  const svg = kev.cloneNode(true);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('data-s', 'laughing');
  svg.querySelector('.quest')?.remove();
  const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  st.textContent = '.eyes-open,.grin{opacity:0}.laugh-eyes,.open{opacity:1}.cheek{opacity:.9}';
  svg.prepend(st);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  return new Promise((ok, no) => { const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = url; });
}

function wrap(ctx, text, maxW) {
  const lines = []; let cur = '';
  for (const w of String(text).split(/\s+/)) {
    const next = cur ? cur + ' ' + w : w;
    if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Largest font size (from max down) at which the text fits in maxLines.
function fitText(ctx, text, font, max, min, maxW, maxLines) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = font(size);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = font(min);
  return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

export async function drawCard({ kev, title, line, roast, path = [], code = null, gap = null, badge = 'Roasted by Kevin' }) {
  await Promise.all([document.fonts.load('400 80px Shrikhand'), document.fonts.load('800 40px Archivo'), document.fonts.load('600 40px Archivo')]);
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.sleeve; ctx.fillRect(0, 0, W, H);

  // title strip, e.g. "Same noise #4,212"
  ctx.save(); ctx.translate(72, 150); ctx.rotate(-0.06);
  ctx.font = '400 92px Shrikhand'; ctx.fillStyle = C.deep; ctx.fillText(title, 5, 5); ctx.fillStyle = C.ink; ctx.fillText(title, 0, 0);
  ctx.restore();

  // Kevin, with the quest marker cut (he is mid-laugh)
  try { const img = await faceImage(kev); ctx.drawImage(img, W - 470, 190, 400, 400); } catch {}

  // the NPC dialogue box
  const bx = 60, by = 630, bw = W - 120, bh = 560;
  ctx.fillStyle = 'rgba(110,60,0,0.25)'; roundRect(ctx, bx, by + 12, bw, bh, 36); ctx.fill();
  ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 8; roundRect(ctx, bx, by, bw, bh, 36); ctx.fill(); ctx.stroke();
  ctx.font = '800 30px Archivo'; const tag = 'KEVIN · NPC', tw = ctx.measureText(tag).width + 44;
  ctx.fillStyle = C.pink; roundRect(ctx, bx + 36, by - 26, tw, 52, 12); ctx.fill(); ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(tag, bx + 58, by + 11);

  const head = fitText(ctx, line, s => `800 ${s}px Archivo`, 66, 40, bw - 96, 3);
  ctx.fillStyle = C.ink; ctx.font = `800 ${head.size}px Archivo`;
  let y = by + 70 + head.size;
  for (const l of head.lines) { ctx.fillText(l, bx + 48, y); y += head.size * 1.18; }
  if (roast) {
    const r = fitText(ctx, `"${roast}"`, s => `600 ${s}px Archivo`, 38, 26, bw - 96, Math.max(2, Math.floor((by + bh - 50 - y) / 48)));
    ctx.fillStyle = C.soft; ctx.font = `600 ${r.size}px Archivo`; y += 18;
    for (const l of r.lines) { ctx.fillText(l, bx + 48, y + r.size); y += r.size * 1.3; }
  }

  // the shared badge, the stamp and its code, lineage and the one home
  ctx.fillStyle = C.ink; ctx.font = '800 34px Archivo';
  ctx.fillText(badge + (gap ? ' · Generation gap bridged' : ''), 72, 1236);
  if (path.length) { ctx.font = '700 28px Archivo'; ctx.fillText(('passed ' + path.join(' → ')).slice(0, 60), 72, 1272); }
  ctx.font = '600 28px Archivo'; ctx.fillStyle = C.soft;
  ctx.fillText('roastedbykevin.com', 72, 1310);
  stamp(ctx, W - 300, 1206, code);
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// "Original Kevin ✓" seal with the card's code; /verify looks the code up.
function stamp(ctx, x, y, code) {
  ctx.save(); ctx.translate(x + 110, y + 54); ctx.rotate(-0.08);
  ctx.strokeStyle = C.pink; ctx.lineWidth = 6; roundRect(ctx, -110, -50, 220, code ? 112 : 92, 18); ctx.stroke();
  ctx.fillStyle = C.pink; ctx.textAlign = 'center';
  ctx.font = '800 26px Archivo'; ctx.fillText('ORIGINAL KEVIN ✓', 0, -8);
  ctx.font = '700 20px Archivo'; ctx.fillText('roastedbykevin.com/verify', 0, 22);
  if (code) { ctx.font = '800 22px Archivo'; ctx.fillText('code ' + String(code).slice(0, 8), 0, 50); }
  ctx.restore();
}
