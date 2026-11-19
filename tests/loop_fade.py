# 0.99.47: Loop fade: the end of a forward loop dissolves into its start (frame pairs, loop length, UI, saved with the GIF, drawn)
import asyncio
from _env import DIST, FIX, ARGS, OUT
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960})
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    await pg.evaluate("fileTarget=0"); await pg.set_input_files('#fileIn', [str(FIX/'busy.gif')]); await pg.wait_for_function("pads[0].gif")
    await pg.evaluate("selectPad(0); $('#gTabs [data-v=play]').click()")
    # Step: a 20% fade = at least 1 frame: the cycle is that many steps shorter, the first carry a frame from the end under them
    r = await pg.evaluate("""(() => { const g = curGif(); g.trimOff = true; g.inF = 0; g.outF = g.src.length - 1; g.startF = 0; g.restart = 0; g.loop = 'loop'; g.sync = 'step'; rebuildSeq(g);
      const F = g.seq.length; g.lfade = 0.2; const n = fadeFrames(g), rows = [];
      for (const s of [0, 1, 2, F - n - 1, F - n, F - n + 1]){ const o = {}, k = stepToIdx(g, s, o); rows.push([k, o.u, o.w === undefined ? null : +o.w.toFixed(3)]); }
      g.lfade = 0; const o0 = {}; stepToIdx(g, 0, o0); return [F >= 4, n, rows, o0.u === undefined, cycleBeats({ ...g, lfade: 0.2 }) * g.subdiv === F - n]; })()""")
    print('step', r); n = r[1]; F_ok = r[0]
    assert r[0] and r[3] and r[4], r
    # Free / Fit: the cycle is shorter by the fade, the dissolve covers the first stretch
    r = await pg.evaluate("""(() => { const g = curGif(); g.sync = 'free'; g.lfade = 0.25; const D = g.total, L = loopLen(g), o = {};
      const a = []; for (const t of [0, L * 0.01, D * 0.125, D * 0.25 + 1, L - 1, L + 1]){ const q = {}; const k = timeToIdx(g, t, q); a.push([k, q.u === undefined ? null : q.u, q.w === undefined ? null : +q.w.toFixed(2)]); }
      g.loop = 'pingpong'; const pp = {}; timeToIdx(g, 5, pp); g.loop = 'loop'; return [Math.abs(L - D * 0.75) < 1e-6, a, pp.u === undefined]; })()""")
    print('time', r); assert r[0] and r[2], r
    a = r[1]
    assert a[0][2] == 0 and a[2][2] == 0.5 and a[3][1] is None and a[4][1] is None, a   # w climbs 0 → 1 over the first quarter, nothing under the rest
    # the end of the cycle (last frame before the wrap) and its first (the frame the dissolve starts under) are neighbours: no jump
    r = await pg.evaluate("""(() => { const g = curGif(), L = loopLen(g), D = g.total, e = idxAt(g, L - 1e-3), q = {}; timeToIdx(g, L + 1e-3, q); return [e, q.u, idxAt(g, L)]; })()""")
    print('wrap', r); assert r[1] == r[2] and r[0] <= r[1], r
    # UI: the slider, its readout, dimmed away from Forward; saved and copied with the GIF; undo word
    r = await pg.evaluate("""(() => { const g = curGif(); g.lfade = 0; g.loop = 'loop'; syncGifUI(); const S = $('#gLFade'); S.value = 4; S.dispatchEvent(new Event('input', { bubbles: true }));
      const a = [g.lfade, S.nextElementSibling.textContent, $('#gLFadeRow').classList.contains('dimmed')];
      g.loop = 'pingpong'; syncGifUI(); a.push($('#gLFadeRow').classList.contains('dimmed')); g.loop = 'loop'; syncGifUI();
      const c = cloneInst(g); a.push(c.lfade, gifSettings(g).lfade); const h = makeInst(g.media, { loop: 'loop' }); a.push(h.lfade); return a; })()""")
    print('ui', r); assert r == [0.2, '20%', False, True, 0.2, 0.2, 0], r
    # drawn: the dissolve picture sits between its two frames (a fade at w = 0.5 is not either frame alone)
    r = await pg.evaluate("""(() => { const g = curGif(); trigger(0); const c = layers.flatMap(L => L.clips).find(c => c.pad === 0), n = g.seq.length, px = it => { const cv = new OffscreenCanvas(CW, CH), x = cv.getContext('2d'); x.setTransform(RS, 0, 0, RS, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); drawClipFrames(x, c, g, it);
        const d = x.getImageData(0, 0, CW, CH).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) * ((i >> 2) % 997 + 1); return s; };
      const P = Array.from({ length: n }, (_, i) => px({ fi: i })); let q = 1; for (let i = 1; i < n; i++) if (Math.abs(P[i] - P[0]) > Math.abs(P[q] - P[0])) q = i;
      const a = P[0], b = P[q], m = px({ fi: 0, u: q, w: 0.5 }), top = px({ fi: 0, u: q, w: 1 }), none = px({ fi: 0, u: q, w: 0 });
      return [P, a !== b, Math.min(a, b) <= m && m <= Math.max(a, b), top === a, Math.abs(none - b) < 0.02 * b + 4]; })()""")
    print('drawn', r); assert r[1:] == [True, True, True, True], r
    await pg.screenshot(path=str(OUT/'loop_fade.png'))
    print('ok'); await b.close()
asyncio.run(main())
