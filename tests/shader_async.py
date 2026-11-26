# the shader window never stops the page while a shader compiles: a slow link is faked (6 s), nothing asks for the program until it says it is done
import asyncio
from _env import DIST, ARGS
from playwright.async_api import async_playwright
SLOW = """(() => { window.__early = []; const T = 6000, born = new WeakMap();
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]){ const P = C.prototype, ge = P.getExtension, gp = P.getProgramParameter, lk = P.linkProgram;
    const done = pr => performance.now() - (born.get(pr) || 0) >= T, early = (cx, pr, what) => { if (typeof SH !== 'undefined' && cx === SH.gl && born.has(pr) && !done(pr)) window.__early.push(what); };   // (only the shader window's own context: the effects programs have their own checks)
    P.getExtension = function(n){ return n === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: 0x91B1 } : ge.call(this, n); };
    P.linkProgram = function(pr){ born.set(pr, performance.now()); return lk.call(this, pr); };
    P.getProgramParameter = function(pr, k){ if (k === 0x91B1) return done(pr); early(this, pr, 'getProgramParameter'); return gp.call(this, pr, k); };
    for (const m of ['useProgram', 'getUniformLocation', 'getAttribLocation', 'getProgramInfoLog']){ const o = P[m]; P[m] = function(pr, ...a){ if (pr) early(this, pr, m); return o.call(this, pr, ...a); }; } } })();"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960}); await pg.add_init_script(SLOW)
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    # opening the window starts the compile and returns at once; the page keeps drawing frames while it waits
    r = await pg.evaluate("""(async () => { let ticks = 0; const t0 = performance.now(), raf = () => { ticks++; if (performance.now() - t0 < 2500) requestAnimationFrame(raf); }; raf();
      openShader(-1); await new Promise(r => setTimeout(r, 2500)); return [ticks, $('#shErr').textContent, $('#shOk').disabled, $('#shDrag').classList.contains('dimmed')]; })()""")
    print('while compiling', r); assert r[0] > 20 and r[1] == 'Compiling…' and r[2] and r[3], r
    await pg.wait_for_function("$('#shErr').textContent === 'Compiles'", timeout=30000)
    # editing again: the older check is dropped, the newest answers
    r = await pg.evaluate("""(async () => { $('#shCode').value = SH_PRESETS[2][1] + '\\n// 1'; shRead(); shUI(); await new Promise(r => setTimeout(r, 800));
      $('#shCode').value = SH_PRESETS[2][1] + '\\n// 2'; shRead(); shUI(); await new Promise(r => setTimeout(r, 400)); return $('#shErr').textContent; })()""")
    print('edits', r); assert r == 'Compiling…', r
    await pg.wait_for_function("$('#shErr').textContent === 'Compiles'", timeout=30000)
    # Add waits for the compile without stopping the page, then puts the shader on the pad
    await pg.evaluate("shaderOk(0)"); await pg.wait_for_function("pads[0].gif", timeout=30000)
    early = await pg.evaluate("__early"); print('asked too early', early); assert not early, early
    print('ok'); await b.close()
asyncio.run(main())
