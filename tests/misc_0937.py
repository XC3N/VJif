# 0.99.37: a new install starts with its four layers on; an effect dragged onto a preset at GIF level keeps the style shown (CRT › Crypt, not Split);
# after a reload the GIF panel shows the GIF whose chip is lit on the edited layer (it showed the first filled pad's)
import asyncio
from _env import DIST, FIX, ARGS
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    # 1. fresh start: every layer on, and the cards say so
    r = await pg.evaluate("[layers.map(L => L.on), layers.map(L => L.row.classList.contains('on'))]")
    print('layers on (state, card)', r); assert r == [[True] * 4, [True] * 4], r
    # 3 (set up): a Background GIF and a Global pad GIF; Background is the edited layer
    await pg.evaluate("fileTarget = BG0"); await pg.set_input_files('#fileIn', [str(FIX/'bat.gif')]); await pg.wait_for_function("pads[BG0].gif")
    await pg.evaluate("fileTarget = 9"); await pg.set_input_files('#fileIn', [str(FIX/'busy.gif')]); await pg.wait_for_function("pads[9].gif")
    # 2. GIF level, CRT set to Crypt on the selected GIF, then dragged onto preset 7
    r = await pg.evaluate("""(() => { selectPad(9); fxLvl = 'gif'; const i = FXI.rgb, x = gfxEntry(i); x.style = 'crypt'; x.amt = 0.5; gfxTouch(); syncFxUI();
      const tile = $(`#fxPads .fxp[data-i="${i}"]`).querySelector('.s').textContent;
      addPreFx(6, i); const E = fxPre[6].fx[i]; return [tile, E.style, E.amt, fxCfg[i].style]; })()""")
    print('GIF level drag (tile, preset style, amt, output style)', r); assert r[0] == 'Crypt' and r[1] == 'crypt' and r[2] == 0.5 and r[3] == 'split', r
    r = await pg.evaluate("(() => { fxLvl = 'out'; const i = FXI.rgb; fxCfg[i].style = 'vhs'; addPreFx(7, i); return fxPre[7].fx[i].style; })()")
    print('Output level drag', r); assert r == 'vhs', r
    await pg.evaluate("Prefs.set('vjif-fxlvl', 'out')")
    # 3. reload with Background edited: the panel's GIF is the lit chip's
    await pg.evaluate("selectPad(9); setTarget(BG_LAYER); touched.save = true"); await pg.wait_for_timeout(2500)
    await pg.reload(); await pg.wait_for_function("store.ready"); await pg.wait_for_function("pads[BG0].gif && pads[9].gif"); await pg.wait_for_timeout(500)
    r = await pg.evaluate("""(() => { const c = selClip(target), lit = document.querySelector('.lrow.tgt .chip.sel, .layer.tgt .chip.sel') || [...document.querySelectorAll('.chip.sel')][0];
      return [target, c && c.pad, selPad, !!curGif() && curGif() === pads[c.pad].gif, lit && +lit.dataset.pad]; })()""")
    print('after reload (target, lit clip pad, selPad, panel = lit, lit chip)', r); assert r[0] == 0 and r[1] == r[2] == r[4] == 18 and r[3], r
    assert not errs, errs; await b.close(); print('ok')
asyncio.run(main())
