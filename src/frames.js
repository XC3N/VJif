// ---------- packed frames (0.99.44): a GIF's frames kept small, and unpacked while they are in use ----------
// A decoded frame as the browser draws it costs 4 bytes a pixel, and a set's memory was every frame of every GIF at that
// price whether it was playing or not (1 GB for 35 GIFs on FYR's set). But a GIF frame has at most 256 colours, so it is
// kept here the way the file has it: one byte a pixel plus its colour table (a quarter), and where the frame has long
// runs of one colour (flat art, transparent surroundings), as those runs (often a tenth or less). Nothing is lost: the
// unpacked frame has exactly the same pixels.
// Drawing needs the 4-bytes-a-pixel picture, so a frame is unpacked the first time it is asked for (about 1 ms for a
// 500 × 500 frame) and that picture is kept while the frame keeps being used: a GIF that is playing has its frames
// ready, as before, and one that hasn't been shown for FRAME_HOT_MS lets them go. So the memory is the packed set plus
// the frames of what is on screen.
// A frame with more colours (a photo WebP, a GIF made smaller with smoothing) is kept with two bytes a pixel when that is
// still worth it, else as the picture it was (no gain, no loss).
// The frame list of a media (`m.src`) still reads like an array of pictures: `src[i]` gives the ImageBitmap, unpacking it
// when needed. Never close what it gives (the list owns them): `dropFrames(src)` lets a whole list go.
const FRAME_HOT_MS = 10000;                           // a frame not asked for in this long lets its picture go…
const FRAME_HOT_BYTES = 512 * 1048576;                // …and past this much, the ones used longest ago go first
const frameHot = new Set(); let frameHotBytes = 0;   // the packed frames that hold a picture now
const framePackSt = { tab: new Int32Array(1 << 18), gen: new Uint32Array(1 << 18), g: 0, pal: new Uint32Array(65536), idx: new Uint16Array(0),
  rd: null, cv: null, cx: null, im: new Map() };

// one frame's pixels (RGBA as 32-bit words, w × h) → { w, h, n, pal, d (one entry a pixel) or v + l (runs), bytes }; null when it has too many colours
function packPixels(u, w, h){
  const S = framePackSt, N = w * h, tab = S.tab, gen = S.gen, pal = S.pal, g = ++S.g;
  if (S.idx.length < N) S.idx = new Uint16Array(N);
  const idx = S.idx; let n = 0, last = u[0] >>> 24 ? u[0] : 0, li = -1, runs = 0, run = 0;
  const lim = Math.max(256, Math.min(65536, N >> 3));   // more colours than this: two bytes a pixel plus the table wouldn't save enough
  for (let i = 0; i < N; i++){
    let c = u[i]; if (!(c >>> 24)) c = 0;            // every fully see-through pixel is the same colour
    if (c !== last || li < 0){
      let k = Math.imul(c, 0x9E3779B1) >>> 14;
      for (;;){ if (gen[k] !== g){ if (n >= lim) return null; gen[k] = g; tab[k] = n; pal[n] = c; li = n++; break; }
        if (pal[tab[k]] === c){ li = tab[k]; break; } k = (k + 1) & 0x3FFFF; }
      last = c; runs++; run = 1;
    } else if (run === 65535){ runs++; run = 1; } else run++;
    idx[i] = li;
  }
  const wide = n > 256, per = wide ? 2 : 1, P = pal.slice(0, n), f = { w, h, n, pal: P, bm: null, t: 0, raw: N * 4 };
  if (runs * (per + 2) < N * per * 0.75){            // runs of one colour: the colour and how many
    const v = wide ? new Uint16Array(runs) : new Uint8Array(runs), l = new Uint16Array(runs); let r = -1, p = -1, len = 0;
    for (let i = 0; i < N; i++){ const x = idx[i]; if (x !== p || len === 65535){ if (r >= 0) l[r] = len; v[++r] = x; p = x; len = 1; } else len++; }
    l[r] = len; f.v = v; f.l = l; f.bytes = runs * (per + 2) + n * 4;
  } else { f.d = wide ? idx.slice(0, N) : Uint8Array.from(idx.subarray(0, N)); f.bytes = N * per + n * 4; }
  return f;
}
// the same frame as the one before (a held picture saved as several frames): they share one
function sameFrame(a, b){
  if (!a || !b || a.keep || b.keep || a.w !== b.w || a.h !== b.h || a.n !== b.n || !a.d !== !b.d) return false;
  const eq = (x, y) => { if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
  return eq(a.pal, b.pal) && (a.d ? eq(a.d, b.d) : eq(a.v, b.v) && eq(a.l, b.l));
}
// a decoded picture → a packed frame (the picture is closed), or a frame that keeps the picture when it can't be packed
function packBitmap(bm, prev){
  const S = framePackSt, w = bm.width, h = bm.height;
  if (!S.rd){ S.rd = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true }); S.rd.globalCompositeOperation = 'copy'; }
  const x = S.rd; if (x.canvas.width !== w || x.canvas.height !== h){ x.canvas.width = w; x.canvas.height = h; x.globalCompositeOperation = 'copy'; }
  x.drawImage(bm, 0, 0);
  const f = packPixels(new Uint32Array(x.getImageData(0, 0, w, h).data.buffer), w, h);
  if (!f) return { w, h, keep: true, bm, bytes: w * h * 4, raw: w * h * 4 };
  bm.close(); return sameFrame(f, prev) ? prev : f;
}
// a frame straight from the decoder, when it is kept at its own size: its pixels are copied out without making a picture
// first (about a third less work than the picture and reading it back; the same pixels). Null if the browser can't.
async function packVideoFrame(image, prev){
  const S = framePackSt, w = image.displayWidth, h = image.displayHeight;
  if (!S.buf || S.buf.length < w * h * 4) S.buf = new Uint8Array(w * h * 4);
  try { await image.copyTo(S.buf, { format: 'RGBA', rect: { x: 0, y: 0, width: w, height: h } }); } catch (e) { return null; }
  const f = packPixels(new Uint32Array(S.buf.buffer, 0, w * h), w, h);
  if (!f) return null;
  return sameFrame(f, prev) ? prev : f;
}
// the picture of a packed frame, unpacked now if it isn't held
function frameBitmap(f){
  f.t = performance.now();
  if (f.bm) return f.bm;
  const S = framePackSt, { w, h } = f, key = w + 'x' + h; let im = S.im.get(key);
  if (im){ S.im.delete(key); S.im.set(key, im); }
  else { im = new ImageData(w, h); im.u = new Uint32Array(im.data.buffer); S.im.set(key, im); if (S.im.size > 4) S.im.delete(S.im.keys().next().value); }
  const u = im.u, pal = f.pal;
  if (f.d){ const d = f.d; for (let i = 0, N = d.length; i < N; i++) u[i] = pal[d[i]]; }
  else { const v = f.v, l = f.l; for (let r = 0, p = 0, R = v.length; r < R; r++){ const e = p + l[r]; u.fill(pal[v[r]], p, e); p = e; } }
  if (!S.cv){ S.cv = new OffscreenCanvas(w, h); S.cx = S.cv.getContext('2d', { willReadFrequently: true }); }   // (kept off the GPU, as a decoded frame is: thumbnails and pixel reads take it without a read-back)
  if (S.cv.width !== w || S.cv.height !== h){ S.cv.width = w; S.cv.height = h; }
  S.cx.putImageData(im, 0, 0);
  f.bm = S.cv.transferToImageBitmap(); frameHot.add(f); frameHotBytes += f.raw;
  if (frameHotBytes > FRAME_HOT_BYTES) frameSweep(f);
  return f.bm;
}
function frameCool(f){ if (f.bm && !f.keep){ f.bm.close(); f.bm = null; frameHotBytes -= f.raw; } frameHot.delete(f); }
// let go of the pictures not used lately; over the limit, the ones used longest ago (never `keepF`, the one being handed out)
function frameSweep(keepF){
  const now = performance.now();
  for (const f of frameHot) if (now - f.t > FRAME_HOT_MS && f !== keepF) frameCool(f);
  if (frameHotBytes <= FRAME_HOT_BYTES) return;
  for (const f of [...frameHot].sort((a, b) => a.t - b.t)){ if (frameHotBytes <= FRAME_HOT_BYTES * 0.9) break; if (f !== keepF) frameCool(f); }
}
setInterval(frameSweep, 2000);
// the list a media keeps: reads like an array of pictures (see the top of this file)
const FRAME_LIST = { get(t, k){ if (typeof k === 'string'){ const c = k.charCodeAt(0); if (c >= 48 && c <= 57){ const f = t[k]; return f && frameBitmap(f); } if (k === 'packed') return t; } return t[k]; } };
const packedList = packed => new Proxy(packed, FRAME_LIST);
// a frame list is done with: packed (its pictures are let go) or a plain array of pictures (each is closed)
function dropFrames(src){
  if (!src) return;
  const P = src.packed;
  if (P) for (const f of P){ if (f.keep){ if (f.bm) f.bm.close(); f.bm = null; frameHot.delete(f); } else frameCool(f); }
  else src.forEach(f => f.close());
}
// its size without unpacking anything
const frameW = src => (src.packed ? src.packed[0].w : src[0].width), frameH = src => (src.packed ? src.packed[0].h : src[0].height);
