# Kaleido + Codec compose: the extra reads those make must follow Mirror's fold (before 0.99.45 Codec wiped Kaleido out)
import asyncio, sys
from playwright.async_api import async_playwright
from _env import DIST, ARGS
JS = r"""
() => {
  const W = 320, H = 180;
  const src = new OffscreenCanvas(W, H), sx = src.getContext('2d'), dst = new OffscreenCanvas(W, H).getContext('2d');
  const g = sx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#f80'); g.addColorStop(0.5, '#2a2'); g.addColorStop(1, '#08f');
  sx.fillStyle = g; sx.fillRect(0, 0, W, H); sx.fillStyle = '#ff0'; for (let i = 0; i < 9; i++){ sx.beginPath(); sx.arc((i * 97) % W, (i * 53) % H, 14 + i * 3, 0, 7); sx.fill(); }
  const blank = () => ({ lv: FX_DEFS.map(() => 0), env: FX_DEFS.map(() => 0), amt: FX_DEFS.map(() => 0.8), rate: FX_DEFS.map(() => 0.5), style: FX_DEFS.map(d => d.styles[0][0]), size: FX_DEFS.map(d => 16) });
  let slot = 40;
  const run = (fx, kal) => { const M = blank();
    if (kal){ const i = FXI.mirror; M.lv[i] = 1; M.env[i] = 1; M.style[i] = 'kal'; }
    for (const [id, st] of fx){ const i = FXI[id]; M.lv[i] = 1; M.env[i] = 1; M.style[i] = st; }
    const U = fxU(3.3, M); U.time = 12.3; post.run(U, src, dst, slot++); return dst.getImageData(0, 0, W, H).data; };
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4 * 3); };
  const kal = run([], true), out = {};
  for (const [id, st] of [['codec', 'crunch'], ['codec', 'mblock'], ['codec', 'chroma'], ['codec', 'ring']]){
    out[id + ':' + st] = [dist(run([[id, st]], true), kal), dist(run([[id, st]], false), kal)]; }
  return out;
}
"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(DIST); await pg.wait_for_function("typeof post !== 'undefined' && post")
    r = await pg.evaluate(JS); bad = bool(errs)
    for k, (withK, without) in r.items():
      ok = withK < 25   # with Kaleido on, the result stays close to Kaleido alone (before the fix: 70 to 115)
      print(('ok  ' if ok else 'FAIL'), k, 'kal+fx vs kal: %.1f, fx alone vs kal: %.1f' % (withK, without)); bad |= not ok
    print(errs); await b.close(); sys.exit(1 if bad else 0)
asyncio.run(main())
