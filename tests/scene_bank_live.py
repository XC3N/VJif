# 0.99.45: the scene bank button holding the live scene lights up while another bank is on show
import asyncio
from playwright.async_api import async_playwright
from _env import DIST, ARGS
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960})
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    q = "[...document.querySelectorAll('#scBankSeg button.live')].map(b => +b.dataset.v)"
    assert await pg.evaluate(q) == [], 'lit on the live bank'
    await pg.evaluate("setScBank(2)"); assert await pg.evaluate(q) == [0], await pg.evaluate(q)
    await pg.screenshot(path='out/bank_live.png', clip={'x':0,'y':0,'width':1600,'height':400})
    await pg.evaluate("setScBank(0)"); assert await pg.evaluate(q) == []
    await pg.evaluate("gotoScene(10, clock.beat, true)"); assert await pg.evaluate(q) == [], 'strip follows'
    await pg.evaluate("setScBank(3)"); assert await pg.evaluate(q) == [1]
    # Prep: the live scene stays the one on the output
    await pg.evaluate("startPrep(); gotoScene(20, clock.beat, true); setScBank(2); renderScenes()")
    r = await pg.evaluate(q); print(r); assert r == [1], r
    print('ok'); await b.close()
asyncio.run(main())
