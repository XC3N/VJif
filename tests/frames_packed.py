# 0.99.44: frames are kept packed (frames.js) and unpacked while in use: same pixels as a plain decode, less memory,
# pictures let go when not used, a list dropped cleanly
import asyncio
from _env import DIST, FIX, ARGS
from playwright.async_api import async_playwright
SAME = """async i => { const m = pads[i].gif.media, P = m.src.packed, w = P[0].w, h = P[0].h;
  const dec = new ImageDecoder({ data: await m.blob.arrayBuffer(), type: m.type }); await dec.completed;
  const x = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }); x.globalCompositeOperation = 'copy'; let bad = 0;
  for (let k = 0; k < P.length; k++){ const { image } = await dec.decode({ frameIndex: k }), bm = await createImageBitmap(image, m.px ? { resizeWidth: w, resizeHeight: h, resizeQuality: 'pixelated' } : {}); image.close();
    x.drawImage(bm, 0, 0); bm.close(); const a = x.getImageData(0, 0, w, h).data; x.drawImage(m.src[k], 0, 0); const b = x.getImageData(0, 0, w, h).data;
    for (let q = 0; q < a.length; q++) if (a[q] !== b[q] && (a[q | 3] || b[q | 3])){ bad++; break; } }
  dec.close(); return [m.name, P.length, bad, m.srcBytes, m.rawBytes, P.some(f => f.keep)]; }"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS); pg = await b.new_page(viewport={'width':1600,'height':960})
    await pg.goto(DIST); await pg.wait_for_function("store.ready"); await pg.evaluate("$('#aboutPanel').hidden || closeAbout()")
    names = ['bat.gif', 'busy.gif', 'grad.gif', 'ring.gif', 'key-regions.gif', 'red.gif']
    for i, f in enumerate(names):
      await pg.evaluate(f"fileTarget = {i}"); await pg.set_input_files('#fileIn', [str(FIX/f)]); await pg.wait_for_function(f"pads[{i}].gif")
    for i in range(len(names)):
      r = await pg.evaluate(SAME, i); print('same pixels (name, frames, different frames, packed, as pictures, kept as picture)', r)
      assert r[2] == 0 and r[3] <= r[4], r
    tot = await pg.evaluate("[pool.reduce((a, m) => a + m.srcBytes, 0), pool.reduce((a, m) => a + m.rawBytes, 0)]")
    print('pool packed / as pictures', tot); assert tot[0] * 3 < tot[1], tot
    # the pixel helpers: runs, plain indexes, two bytes, too many colours, a see-through pixel's colour doesn't count
    r = await pg.evaluate("""(() => { const mk = (w, h, fn) => { const u = new Uint32Array(w * h); for (let i = 0; i < u.length; i++) u[i] = fn(i); return u; };
      const back = (f, u) => { const bm = frameBitmap(f), x = new OffscreenCanvas(f.w, f.h).getContext('2d'); x.drawImage(bm, 0, 0); const d = new Uint32Array(x.getImageData(0, 0, f.w, f.h).data.buffer); frameCool(f);
        for (let i = 0; i < d.length; i++) if (d[i] !== (u[i] >>> 24 ? u[i] : 0)) return false; return true; };
      const A = mk(300, 300, i => i < 70000 ? 0xff0000ff : 0x00123456), a = packPixels(A, 300, 300);
      const B = mk(64, 64, i => 0xff000000 | (i * 7919 % 200)), bb = packPixels(B, 64, 64);
      const C = mk(256, 256, i => 0xff000000 | (i % 3000) * 5), c = packPixels(C, 256, 256);
      const D = mk(64, 64, i => 0xff000000 | i * 977), d = packPixels(D, 64, 64);
      return [!!a.v, a.n, back(a, A), !!bb.d, bb.d instanceof Uint8Array, back(bb, B), c.n, (c.d || c.v) instanceof Uint16Array, back(c, C), d, sameFrame(a, packPixels(A, 300, 300)), sameFrame(a, bb), frameHotBytes]; })()""")
    print('helpers', r); assert r == [True, 2, True, True, True, True, 3000, True, True, None, True, False, r[12]], r
    # in use: a playing GIF holds its frames; nothing else does once the time is up
    await pg.evaluate("frameHot.forEach(frameCool); trigger(1)"); await pg.wait_for_function("(P => P.filter(f => f.bm).length === new Set(P).size)(pads[1].gif.media.src.packed)", timeout=30000)
    hot = await pg.evaluate("[frameHot.size, frameHotBytes, pads[1].gif.media.src.packed.filter(f => f.bm).length, new Set(pads[1].gif.media.src.packed).size]")
    print('playing (pictures held, bytes, of the playing GIF, its frames)', hot); assert hot[2] == hot[3] and hot[1] > 0, hot
    await pg.evaluate("frameHot.forEach(f => { if (!pads[1].gif.media.src.packed.includes(f)) f.t -= 60000; }); frameSweep()")
    hot2 = await pg.evaluate("[frameHot.size, [...frameHot].every(f => pads[1].gif.media.src.packed.includes(f)), [...frameHot].reduce((a, f) => a + f.raw, 0) === frameHotBytes]")
    print('after the sweep (held, all of the playing GIF, bytes add up)', hot2); assert hot2[0] == hot[3] and hot2[1] and hot2[2], hot2
    # a GIF removed from the pool lets everything go
    r = await pg.evaluate("(() => { const m = pads[1].gif.media, P = m.src.packed; clearPad(1); freeMedia(m); return [P.some(f => f.bm), [...frameHot].some(f => P.includes(f)), frameHotBytes >= 0]; })()")
    print('dropped (a picture left, still listed, bytes ok)', r); assert r == [False, False, True], r
    mem = await pg.evaluate("(() => { updateMem(true); return $('#mem').textContent; })()"); print('MEM', mem)
    await b.close(); print('ok')
asyncio.run(main())
