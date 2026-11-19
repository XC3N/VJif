# 0.99.49: Mirror › Kaleido shows Slices, Zoom and Angle, and a Centre row (X / Y) that only Kaleido has; the centre reaches the shader and is saved
import asyncio
from _env import DIST, ARGS
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    r = await pg.evaluate("(() => { selectFx(FXI.mirror); fxEd().style = 'kal'; syncFxUI(); const vis = s => { const b = $(s).getBoundingClientRect(); return b.width > 20 && b.height > 8; }; return [vis('#fxAmt'), vis('#fxRate'), $('#fxRateRow label').textContent, vis('#fxSize'), vis('#fxCx'), vis('#fxCy')]; })()")
    print('rows', r); assert r == [True, True, 'Zoom', True, True, True], r
    r = await pg.evaluate("(() => { const e = $('#fxCx'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); const y = $('#fxCy'); y.value = -20; y.dispatchEvent(new Event('input', { bubbles: true })); const C = fxEd(); return [C.kcx, C.kcy, $('#fxCx').nextElementSibling.textContent, $('#fxCy').nextElementSibling.textContent]; })()")
    print('set', r); assert r == [0.3, -0.2, '+30%', '-20%'], r
    r = await pg.evaluate("""(() => { const n = FX_DEFS.length, z = v => Array(n).fill(v), lv = z(0); lv[FXI.mirror] = 1; const st = FX_DEFS.map(d => d.styles[0][0]); st[FXI.mirror] = 'kal';
      const u = fxU(0, { lv, env: z(1), amt: z(0.5), rate: z(1), style: st, size: z(64), kcx: Object.assign(z(0), {[FXI.mirror]: 0.3}), kcy: Object.assign(z(0), {[FXI.mirror]: -0.2}) }); return [u.mirX, u.mirY]; })()""")
    print('uniform', r); assert r == [0.3, -0.2], r
    r = await pg.evaluate("(() => { const E = fxEntry(FXI.mirror); return [E.kcx, E.kcy]; })()"); print('entry', r)
    r = await pg.evaluate("(() => { fxEd().style = 'quad'; syncFxUI(); return $('#fxCenRow').hidden; })()"); assert r is True, r
    assert not errs, errs
    await b.close()
asyncio.run(main())
