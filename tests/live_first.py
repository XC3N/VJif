# 0.99.42: opening VJif shows the live scene as soon as its own GIFs are decoded; the other scenes load after it,
# can't be opened or changed until they are in, and the set comes back whole (same content, same pool order)
import asyncio
from _env import DIST, FIX, ARGS
from playwright.async_api import async_playwright
SLOW = "{ const o = window.createImageBitmap; window.createImageBitmap = async (...a) => { if (window.__slow) await new Promise(r => setTimeout(r, 60)); return o(...a); }; window.__slow = !!sessionStorage.getItem('slow'); }"
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(SLOW)
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    async def put(pad, f):
      await pg.evaluate(f"fileTarget = {pad}"); await pg.set_input_files('#fileIn', [str(FIX/f)]); await pg.wait_for_function(f"pads[{pad}].gif")
    await put(0, 'bat.gif'); await pg.evaluate("trigger(0)")
    await pg.evaluate("gotoScene(1, clock.beat, true)"); await put(0, 'busy.gif'); await put(1, 'grad.gif'); await pg.evaluate("trigger(0); setSceneName(1, 'two')")
    await pg.evaluate("gotoScene(5, clock.beat, true)"); await put(2, 'ring.gif'); await pg.evaluate("trigger(2)")
    await pg.evaluate("gotoScene(0, clock.beat, true); touched.save = true"); await pg.wait_for_timeout(2500)
    before = await pg.evaluate("[contentSig(snapshot()), pool.map(m => m.hash)]")
    assert len(before[1]) == 4, before[1]
    # reload with slow decoding: the live scene is on while the others still load
    await pg.evaluate("sessionStorage.setItem('slow', '1')"); await pg.reload()
    await pg.wait_for_function("typeof pads !== 'undefined' && pads[0] && pads[0].gif && layers.some(L => L.clips.length)")
    r = await pg.evaluate("""(() => { const was = sceneIdx; gotoScene(1, clock.beat, true); setSceneName(5, 'x'); sceneDrop(0, 1, false);
      return [!!store.ready, [...sceneLoading.keys()], was, sceneIdx, [...document.querySelectorAll('#scenes .scene.loading')].map(x => +x.dataset.i), pool.length, document.querySelector('#scenes .scene[data-i="1"] .nm').textContent]; })()""")
    print('while loading (ready, loading, scene before / after a refused change, loading tiles, pool, tile name)', r)
    assert r[0] is False and r[1] == [1, 5] and r[2] == 0 and r[3] == 0 and r[4] == [1, 5] and r[5] == 1 and r[6] == 'two', r
    await pg.wait_for_function("store.ready", timeout=60000)
    after = await pg.evaluate("[contentSig(snapshot()), pool.map(m => m.hash), sceneLoading.size, document.querySelectorAll('#scenes .scene.loading').length, scenes[1] && scenes[1].pads.filter(Boolean).length, scenes[5] && scenes[5].layers.reduce((a, l) => a + l.clips.length, 0)]")
    print('after (same content, same pool order, loading left, loading tiles, scene 2 pads, scene 6 clips)', after[0] == before[0], after[1] == before[1], after[2:])
    assert after[0] == before[0] and after[1] == before[1] and after[2:] == [0, 0, 2, 1], after[2:]
    r = await pg.evaluate("(() => { gotoScene(1, clock.beat, true); return [sceneIdx, pads[0].gif && pads[0].gif.name, layers.reduce((a, L) => a + L.clips.length, 0)]; })()")
    print('scene 2 opens', r); assert r[0] == 1 and r[1] and r[2] >= 1, r
    assert not errs, errs; await b.close(); print('ok')
asyncio.run(main())
