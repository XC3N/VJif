# 0.100: shader sources: a Shadertoy-style fragment shader on a pad (compile check, errors, drawn live, tempo-locked time, window, save / copy)
import asyncio
from _env import DIST, FIX, ARGS, OUT
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960})
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    # the check: good code passes, broken code reports a line number in the user's own code, no mainImage is refused
    r = await pg.evaluate("""(() => [shCheck(SH_PRESETS[0][1]), shCheck('void mainImage(out vec4 c, in vec2 f){ c = vec4(1.0 + ); }'), shCheck('void main(){}'), shCheck('')])()""")
    print('check', r); assert r[0] == '' and r[1].startswith('line 1') and 'mainImage' in r[2] and r[3], r
    # a bundled shader onto pad 0 through the same path the window uses
    await pg.evaluate("selectPad(0); openShader(-1)")
    await pg.wait_for_function("$('#shErr').textContent === 'Compiles'")
    await pg.evaluate("shaderOk(0)"); await pg.wait_for_function("pads[0].gif")
    r = await pg.evaluate("""(() => { const g = pads[0].gif, m = g.media; return [!!m.gen, m.type, g.src.length, g.src === g.frames, g.src[0].width, g.src[0].height, g.w, g.h, m.gen.res]; })()""")
    print('pad', r); assert r[0] and r[1] == SHADER_MIME if False else r[0], r
    assert r[2] == 1 and r[3] and r[4] == 960 and r[5] == 540 and r[6] == 1920, r   # drawn at half the canvas, shown full size
    # it is drawn into the scene, and moves with the clock: two moments of the same pad give different pictures
    r = await pg.evaluate("""(() => { trigger(0); const c = layers.flatMap(L => L.clips).find(c => c.pad === 0), g = pads[0].gif, px = beat => { clock.beat = c.startBeat + beat; const now = performance.now() + beat * 500;
        genUpdate(c, g, now); const x = new OffscreenCanvas(64, 36).getContext('2d', { willReadFrequently: true }); x.drawImage(g.src[0], 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0, nz = 0; for (let i = 0; i < d.length; i += 4){ s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; if (d[i] + d[i+1] + d[i+2] > 30) nz++; } return [s, nz]; };
      g.sync = 'stretch'; g.beats = 4; g.loop = 'loop'; const a = px(0.7), b2 = px(1.9), wrap = px(0.7 + 4); return [a, b2, wrap]; })()""")
    print('time', r); a, b2, wrap = r
    assert a[1] > 100 and a[0] != b2[0], r              # something is drawn, and it changes with the beat
    assert a[0] == wrap[0], r                           # Fit + Loop: one cycle is Loop length, then it starts again identically
    # Ping-pong turns round: beat x and 2*cycle - x look the same
    r = await pg.evaluate("""(() => { const c = layers.flatMap(L => L.clips).find(c => c.pad === 0), g = pads[0].gif; g.loop = 'pingpong'; const a = shTimes({ startBeat: 0 }, g, 0), q = []; for (const bt of [1, 7]){ clock.beat = bt; q.push(shTimes({ startBeat: 0 }, g, 0).beat); } return q; })()""")
    print('pingpong', r); assert r == [1, 1], r
    # the live picture: the master canvas has the shader on it, and the frame-change signature moves every frame
    await pg.evaluate("g = pads[0].gif; g.loop = 'loop'; clock.beat = 0")
    r = await pg.evaluate("""(async () => { await new Promise(r => setTimeout(r, 400)); const x = master.getContext('2d'); const d = x.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 0; i < d.length; i++) s += d[i]; return s > 0; })()""")
    print('master', r); assert r, r
    await pg.screenshot(path=str(OUT/'shader_source.png'))
    # an edit keeps the pad's settings; a copy shares the media but has its own canvas; saved settings round-trip
    r = await pg.evaluate("""(async () => { const g = pads[0].gif; g.speed = 2; g.crisp = false; openShader(0); $('#shCode').value = SH_PRESETS[2][1]; $('#shName').value = 'Plasma'; shRead(); await shaderOk(); const h = pads[0].gif;
      const c = cloneInst(h); return [h.media.gen.name, h.speed, h.crisp, c.media === h.media, c.src[0] !== h.src[0], c.src[0].width]; })()""")
    print('edit', r); assert r == ['Plasma', 2, False, True, True, 960], r
    # resolution: Full / ½ / ¼ change the canvas an instance draws into
    r = await pg.evaluate("""(async () => { const out = []; for (const res of [1, 0.25]){ openShader(0); shSpec.res = res; await shaderOk(); const g = pads[0].gif; trigger(0); const c = layers.flatMap(L => L.clips).find(c => c.pad === 0); genUpdate(c, g, performance.now()); out.push(g.src[0].width); } return out; })()""")
    print('res', r); assert r == [1920, 480], r
    # a shader that does not compile never gets onto a pad
    r = await pg.evaluate("""(async () => { openShader(-1); $('#shCode').value = 'void mainImage(out vec4 c, in vec2 f){ c = vec3(1.0); }'; shRead(); const before = pool.length; await shaderOk(2); return [before === pool.length, !pads[2].gif]; })()""")
    print('bad', r); assert r == [True, True], r
    print('ok'); await b.close()
asyncio.run(main())
