# 0.99.40: a transition interrupted by another scene change keeps both scenes playing (it used to freeze the one being left)
import asyncio
from playwright.async_api import async_playwright
from _env import DIST, FIX as S, ARGS
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960})
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    await pg.evaluate("fileTarget=0"); await pg.set_input_files('#fileIn', [str(S/'busy.gif')]); await pg.wait_for_function("pads[0].gif")
    await pg.keyboard.press('KeyQ'); await pg.wait_for_timeout(200)
    r = await pg.evaluate("""() => {
      transCfg = normTrans({ type: 'fade', style: 'cross', len: 16, dir: 'left', px: 12 });
      gotoScene(1, clock.beat); const t1 = trans; clock.beat += 8;           // halfway
      gotoScene(0, clock.beat); const t2 = trans;                            // back, mid-transition
      const sums = [];
      for (const dt of [0, 400, 800, 1200, 1600, 2000]){
        clock.beat += 0.37; paintLeaving(t2, performance.now() + dt, [], 0);
        const d = trA.getImageData(0, 0, W, H).data; let s = 0; for (let i = 0; i < d.length; i += 97) s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; sums.push(s); }
      return { chained: t2.prev === t1, frozen: t1.frozen, varies: new Set(sums).size, sums }; }""")
    print('interrupt', r); assert r['chained'] and abs(r['frozen'] - 0.5) < 1e-6 and r['varies'] > 1, r
    d = await pg.evaluate("""() => { let n = 0; for (let k = 0; k < 8; k++){ clock.beat += 1; gotoScene(k % 2 ? 0 : 1, clock.beat); } let T = trans; while (T.prev){ n++; T = T.prev; } endTrans(); return [n, trans]; }""")
    print('depth', d); assert d[0] <= 4 and d[1] is None, d
    await b.close()
asyncio.run(main())
