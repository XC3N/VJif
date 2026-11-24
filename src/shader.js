// ---------- shader sources: a Shadertoy-style fragment shader played like a GIF (0.100) ----------
// The file is a small JSON description (the code, the render size), like a text is. A pad holding one draws it live every
// frame into its own small canvas, which the rest of VJif then treats as a one-frame GIF: transform, blend, colour,
// mask, effects and transitions all work on it. `iTime` follows the BPM clock, so Timing / Loop / Ping-pong apply.
const SHADER_MIME = 'application/vnd.vjif.shader+json';
const isShaderBlob = (blob, name) => blob.type === SHADER_MIME || /\.vjshader$/i.test(name || '');
const shaderName = sp => (sp.name || 'shader').replace(/[|\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) + '.vjshader';
const SHADER_DEF = { v: 1, name: 'Shader', code: '', res: 0.5 };   // res: the share of the canvas size it is drawn at (½ by default: a quarter of the pixels)
const SHADER_RES = [1, 0.5, 0.25];
// What the code is wrapped in. A shader written for shadertoy.com (single pass, mainImage) runs as it is.
const SH_HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec3 iResolution; uniform float iTime, iTimeDelta, iBeat, iBar, iSampleRate; uniform int iFrame; uniform vec4 iMouse, iDate;
uniform sampler2D iChannel0, iChannel1, iChannel2, iChannel3; uniform vec3 iChannelResolution[4]; uniform float iChannelTime[4];
out vec4 vjOut;
`;
const SH_HEAD_LINES = SH_HEAD.split('\n').length - 1;
const SH_TAIL = `
void main(){ vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); vjOut = vec4(c.rgb, 1.0); }
`;
const SH_VERT = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// ---- the GL side: one context for every shader pad; a program per distinct code (a few kept, the oldest let go) ----
const SH = { cv: null, gl: null, ext: null, progs: new Map(), noise: null, off: false, max: 8 };
function shGL(){
  if (SH.gl && !SH.gl.isContextLost()) return SH.gl;
  if (SH.off) return null;
  SH.cv = SH.cv || new OffscreenCanvas(16, 16);
  const gl = SH.cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl){ SH.off = true; return null; }
  SH.gl = gl; SH.progs.clear(); SH.noise = null; SH.ext = gl.getExtension('KHR_parallel_shader_compile');
  SH.cv.addEventListener && SH.cv.addEventListener('webglcontextlost', e => { e.preventDefault(); SH.progs.clear(); SH.noise = null; });
  return gl;
}
function shNoiseTex(gl){
  if (SH.noise) return SH.noise;
  const n = 256, d = new Uint8Array(n * n * 4); let s = 1234567;
  for (let i = 0; i < d.length; i++){ s = (s * 1664525 + 1013904223) >>> 0; d[i] = s >>> 24; }
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return SH.noise = t;
}
// the program for some code: started now (it may link in parallel), looked at when first drawn. Returns the entry: { p, state: 'wait' | 'ok' | 'err', err }
function shProgram(code){
  const gl = shGL(); if (!gl) return { state: 'err', err: 'This browser has no WebGL 2' };
  let e = SH.progs.get(code);
  if (e){ SH.progs.delete(code); SH.progs.set(code, e); return e; }   // (kept as the newest)
  if (SH.progs.size >= SH.max){ const [k, o] = SH.progs.entries().next().value; SH.progs.delete(k); if (o.p) gl.deleteProgram(o.p); }
  e = { p: null, state: 'wait', err: '' }; SH.progs.set(code, e);
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = mk(gl.VERTEX_SHADER, SH_VERT), fs = mk(gl.FRAGMENT_SHADER, SH_HEAD + code + SH_TAIL), p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); e.p = p; e.vs = vs; e.fs = fs;
  return e;
}
// settles a program that has been started: false while it is still linking (parallel compile)
function shSettle(e){
  if (e.state !== 'wait') return true;
  const gl = SH.gl; if (SH.ext && !gl.getProgramParameter(e.p, SH.ext.COMPLETION_STATUS_KHR)) return false;
  if (gl.getProgramParameter(e.p, gl.LINK_STATUS)){ e.state = 'ok'; e.u = {}; for (const n of ['iResolution', 'iTime', 'iTimeDelta', 'iBeat', 'iBar', 'iFrame', 'iMouse', 'iDate', 'iSampleRate', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'iChannelResolution[0]', 'iChannelTime[0]']) e.u[n] = gl.getUniformLocation(e.p, n); }
  else {
    const log = (gl.getShaderInfoLog(e.fs) || '') + (gl.getShaderInfoLog(e.vs) || '') + (gl.getProgramInfoLog(e.p) || '');
    // the lines count from the user's own code, not from the header VJif puts in front of it
    e.err = (log.match(/ERROR:[^\n]*/g) || [log || 'The shader did not compile']).slice(0, 3).map(l => l.replace(/ERROR: (\d+):(\d+)/, (_, a, n) => `line ${Math.max(1, +n - SH_HEAD_LINES)}`)).join('\n');
    e.state = 'err';
  }
  gl.deleteShader(e.vs); gl.deleteShader(e.fs); e.vs = e.fs = null;
  return true;
}
// draw into the shared GL canvas: the canvas is returned (copy it before the next call), null if there is nothing to draw (still linking, or broken)
function shDraw(code, w, h, t, beat, bar, frame, dt){
  const e = shProgram(code); if (!shSettle(e) || e.state !== 'ok') return null;
  const gl = SH.gl, cv = SH.cv; if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h); gl.useProgram(e.p);
  const u = e.u, d = new Date();
  gl.uniform3f(u.iResolution, w, h, 1); gl.uniform1f(u.iTime, t); gl.uniform1f(u.iTimeDelta, dt); gl.uniform1f(u.iBeat, beat); gl.uniform1f(u.iBar, bar); gl.uniform1i(u.iFrame, frame);
  gl.uniform4f(u.iMouse, 0, 0, 0, 0); gl.uniform4f(u.iDate, d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()); gl.uniform1f(u.iSampleRate, 44100);
  const tex = shNoiseTex(gl);
  for (let i = 0; i < 4; i++){ gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u['iChannel' + i], i); }
  gl.uniform3fv(u['iChannelResolution[0]'], new Float32Array([256, 256, 1, 256, 256, 1, 256, 256, 1, 256, 256, 1])); gl.uniform1fv(u['iChannelTime[0]'], new Float32Array(4));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return cv;
}
// compile now and draw one tiny frame: false-y when it is fine, else the message. (A new pad has to pass this before it is shown.)
function shCheck(code){
  if (!String(code).trim()) return 'The shader has no code';
  if (!/\bmainImage\s*\(/.test(code)) return 'The code needs a function  void mainImage(out vec4 fragColor, in vec2 fragCoord)';
  const e = shProgram(code); if (e.state === 'wait'){ const gl = SH.gl; gl.getProgramParameter(e.p, gl.LINK_STATUS); shSettle(e); if (e.state === 'wait'){ while (!shSettle(e)); } }   // (asking for the link status waits for it)
  if (e.state === 'err') return e.err;
  return shDraw(code, 16, 9, 1, 0, 0, 0, 0) ? '' : 'The shader could not be drawn';
}

// ---- time: iTime from the BPM clock ----
// Free: seconds since the hit × Speed. Fit: one cycle = Loop length in beats (Loop wraps it, Ping-pong turns round, Reverse runs back).
// Step: beats counted in whole steps. iBeat: beats since the hit, wrapped like the time; iBar: the position in the bar, 0..1.
function shTimes(c, g, now){
  let b = clock.beat - c.startBeat; if (g.restart) b = mod(b, g.restart);
  let t, S = g.sync;
  if (S === 'free'){ t = (g.restart ? b * 60 / clock.bpm : (now - c.startTime) / 1000) * g.speed; }
  else {
    if (S === 'step') b = Math.floor(b * g.subdiv + 1e-6) / g.subdiv;
    const P = g.beats;
    if (S === 'stretch'){
      if (g.loop === 'pingpong'){ const q = mod(b, 2 * P); b = q > P ? 2 * P - q : q; }
      else if (g.loop === 'reverse') b = P - mod(b, P);
      else b = mod(b, P);
    }
    t = b * 60 / clock.bpm * (S === 'step' ? g.speed : 1);
  }
  return { t: Math.max(0, t), beat: b, bar: mod(clock.beat / 4, 1) };
}

// ---- an instance: its own small canvas, drawn into before the picture is made ----
const shSize = m => [Math.max(8, Math.round(W * m.gen.res)), Math.max(8, Math.round(H * m.gen.res))];
function genInit(g){
  const m = g.media, [w, h] = shSize(m), cv = new OffscreenCanvas(w, h);
  g.gen = m.gen; g.genCx = cv.getContext('2d'); g.genT = -1; g.genF = 0; g.genAt = 0;
  g.src = g.frames = [cv]; g.durs = [1000]; g.w = W; g.h = H; g.srcBytes = g.bytes = 0;
  genDrawInst(g, 2, 0, 0);
}
function genDrawInst(g, t, beat, bar){
  const cv = g.src[0], [w, h] = shSize(g.media);
  if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; g.w = W; g.h = H; }
  const now = performance.now(), dt = g.genAt ? Math.min(0.25, (now - g.genAt) / 1000) : 0; g.genAt = now;
  const r = shDraw(g.gen.code, w, h, t, beat, bar, g.genF++, dt);
  if (r) g.genCx.drawImage(r, 0, 0);
}
// every frame, for each visible shader clip (render.js frameList): redraw when the time moved
function genUpdate(c, g, now){
  const T = shTimes(c, g, now); if (T.t === g.genT && g.src[0].width === shSize(g.media)[0]) return;
  g.genT = T.t; genDrawInst(g, T.t, T.beat, T.bar);
}

// ---- media: a decoded shader file ----
async function decodeShader(blob, name){
  const spec = { ...SHADER_DEF, ...JSON.parse(await blob.text()) };
  if (!SHADER_RES.includes(spec.res)) spec.res = 0.5;
  const err = shCheck(spec.code); if (err) throw new Error(err);
  const [w, h] = shSize({ gen: spec }), cv = new OffscreenCanvas(w, h), x = cv.getContext('2d'), r = shDraw(spec.code, w, h, 2, 0, 0, 0, 0);
  if (r) x.drawImage(r, 0, 0);
  const bmp = await createImageBitmap(cv);   // the still the pool and pad tiles show
  return { name: name || shaderName(spec), blob, type: SHADER_MIME, gen: spec, src: [bmp], durs: [1000], w: W, h: H, srcBytes: w * h * 4 };
}
// the canvas format changed: the pool's stills are drawn again, the instances follow on their next frame
async function reshadeAll(){
  for (const m of pool.filter(m => m.gen)){
    const [w, h] = shSize(m), cv = new OffscreenCanvas(w, h), r = shDraw(m.gen.code, w, h, 2, 0, 0, 0, 0); if (r) cv.getContext('2d').drawImage(r, 0, 0);
    const old = m.src; m.src = [await createImageBitmap(cv)]; m.w = W; m.h = H; old.forEach(f => f.close());
    insts.forEach(g => { if (g.media === m){ g.w = W; g.h = H; g.genT = -1; } });
  }
  pads.forEach(p => p.gif && p.gif.media && p.gif.media.gen && renderPad(p.i)); renderPool(); redraw.all = true;
}

// ---- bundled shaders (Shadertoy form; iBeat / iBar are VJif's own extras) ----
const SH_PRESETS = [
  ['Noise clouds', `// fractal noise drifting in a palette; the beat breathes the contrast
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.02 + 17.0; a *= 0.5; } return s; }
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.15;
  float n = fbm(uv * 2.5 + vec2(t, -t * 0.7) + fbm(uv * 3.0 - t));
  n = smoothstep(0.25, 0.8, n) * (0.85 + 0.15 * exp(-3.0 * fract(iBeat)));
  vec3 col = 0.5 + 0.5 * cos(6.2831 * (n * 0.8 + vec3(0.0, 0.33, 0.67)));
  fragColor = vec4(col * n, 1.0);
}`],
  ['Beat shapes', `// a ring and a square that pulse on every beat
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float k = exp(-4.0 * fract(iBeat));
  float ring = abs(length(uv) - (0.18 + 0.12 * k)) - 0.012;
  float a = iTime * 0.5; mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  float box = abs(sdBox(R * uv, vec2(0.3 + 0.05 * k))) - 0.008;
  float e = 1.5 / iResolution.y;
  vec3 col = vec3(0.04, 0.03, 0.08);
  col = mix(col, vec3(1.0, 0.35, 0.65), 1.0 - smoothstep(0.0, e, ring));
  col = mix(col, vec3(0.2, 0.9, 1.0), 1.0 - smoothstep(0.0, e, box));
  fragColor = vec4(col, 1.0);
}`],
  ['Plasma', `// classic sine plasma
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime * 0.6;
  float v = sin(7.0 * uv.x + t) + sin(8.0 * uv.y - t * 1.3) + sin(9.0 * (uv.x + uv.y) + t) + sin(11.0 * length(uv) - t * 2.0);
  vec3 col = 0.5 + 0.5 * cos(6.2831 * (v * 0.12 + vec3(0.0, 0.33, 0.67)));
  fragColor = vec4(col, 1.0);
}`],
  ['Tunnel', `// a tunnel with rings and spokes, flying forward with the beat
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(uv), a = atan(uv.y, uv.x);
  float z = 0.25 / max(r, 0.001) + iBeat * 0.5;
  float rings = smoothstep(0.35, 0.5, abs(fract(z) - 0.5));
  float spokes = smoothstep(0.4, 0.5, abs(fract(a * 8.0 / 6.2831 + z * 0.15) - 0.5));
  vec3 col = mix(vec3(0.05, 0.0, 0.15), vec3(0.2, 0.9, 1.0), rings) + vec3(1.0, 0.3, 0.6) * spokes * 0.6;
  fragColor = vec4(col * smoothstep(0.0, 0.25, r), 1.0);
}`],
];

// ---- the window ----
let shEdit = -1, shSpec = { ...SHADER_DEF }, shT = 0, shRaf = 0, shLast = '', shDeb = 0;
function openShader(edit = -1){
  shEdit = edit;
  const g = edit >= 0 && pads[edit].gif;
  shSpec = { ...SHADER_DEF, code: SH_PRESETS[0][1], name: SH_PRESETS[0][0], ...(g && g.media.gen ? g.media.gen : {}) };
  $('#shName').value = shSpec.name; $('#shCode').value = shSpec.code; $('#shPreset').value = g ? '' : '0';
  const d = edit >= 0 ? edit : nextEmpty(selPad);
  $('#shTo').textContent = edit >= 0 ? `pad ${pads[edit].label}` : d >= 0 ? `→ pad ${pads[d].label}` : 'all pads full: pool only';
  $('#shOk').textContent = edit >= 0 ? 'Update' : 'Add to pool'; $('#shOk').hidden = edit < 0 && d >= 0; $('#shDrag').hidden = edit >= 0;
  $('#shaderPanel').hidden = false; shUI(); shLoop();
}
function closeShader(){ $('#shaderPanel').hidden = true; cancelAnimationFrame(shRaf); }
function shRead(){ shSpec.code = $('#shCode').value; shSpec.name = $('#shName').value.trim() || 'Shader'; }
function shUI(){
  segSet('#shRes', String(shSpec.res));
  $('#shRes').title = `Drawn at ${shSize({ gen: shSpec }).join('×')} and scaled up`;
  clearTimeout(shDeb); shDeb = setTimeout(shCompile, 250);
}
function shCompile(){
  shRead(); const err = shCheck(shSpec.code); shLast = shSpec.code;
  $('#shErr').textContent = err || 'Compiles'; $('#shErr').classList.toggle('bad', !!err); $('#shOk').disabled = !!err; $('#shDrag').classList.toggle('dimmed', !!err);
}
function shLoop(){   // the window's preview: the shader at its own render size, on the wall clock and the tempo
  cancelAnimationFrame(shRaf);
  if ($('#shaderPanel').hidden) return;
  const c = $('#shPrev'), [w, h] = shSize({ gen: shSpec }), t = performance.now() / 1000;
  if (shLast === shSpec.code && !$('#shErr').classList.contains('bad')){
    const r = shDraw(shSpec.code, w, h, t, clock.beat, mod(clock.beat / 4, 1), Math.floor(t * 60), 1 / 60);
    if (r){ const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(r, 0, 0, c.width, c.height); }
  }
  shRaf = requestAnimationFrame(shLoop);
}
async function shaderOk(target = -1){
  shRead(); const err = shCheck(shSpec.code); if (err) return toast('The shader has an error: ' + err.split('\n')[0]);
  const spec = { ...shSpec, v: 1 }, blob = new Blob([JSON.stringify(spec)], { type: SHADER_MIME }), name = shaderName(spec), edit = shEdit;
  closeShader();
  try {
    const m = await mediaFor(blob, name);
    if (edit >= 0 && pads[edit].gif){                // keep the pad's settings, with the new shader
      const old = pads[edit].gif, keep = gifSettings(old), g = putMedia(m, edit);
      if (g){ applyGifSettings(g, keep); syncGifUI(); }
    } else { const d = target >= 0 ? target : nextEmpty(selPad); if (d >= 0){ putMedia(m, d); pads[d].el.classList.remove('hit'); void pads[d].el.offsetWidth; pads[d].el.classList.add('hit'); } else toast('All pads are full: the shader is in the pool'); }
  } catch (err) { toast("Couldn't make the shader: " + err.message); }
}
$('#shaderBtn').addEventListener('click', () => openShader(-1));
$('#gShader').addEventListener('click', () => openShader(selPad));
$('#shClose').addEventListener('click', closeShader);
$('#shOk').addEventListener('click', () => shaderOk());
$('#shPreset').innerHTML = '<option value="">Choose a shader…</option>' + SH_PRESETS.map(([n], i) => `<option value="${i}">${n}</option>`).join('');
$('#shPreset').addEventListener('change', e => { const p = SH_PRESETS[+e.target.value]; if (!p) return; $('#shCode').value = p[1]; $('#shName').value = p[0]; shRead(); shUI(); });
$('#shCode').addEventListener('input', () => { $('#shPreset').value = ''; shRead(); shUI(); });
$('#shName').addEventListener('input', shRead);
onSeg($('#shRes'), b => { shSpec.res = +b.dataset.v; shUI(); });
{ const chip = $('#shDrag'); let d = null;   // a new shader: drag the chip onto a pad (a click: the next empty one)
  chip.addEventListener('pointerdown', e => { if (e.button) return; chip.setPointerCapture(e.pointerId); d = { x: e.clientX, y: e.clientY, moved: false }; });
  chip.addEventListener('pointermove', e => { if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5){ d.moved = true; $('#shaderPanel').classList.add('dragging'); const g = document.createElement('span'); g.className = 'chip'; g.innerHTML = `<span>${esc(($('#shName').value || 'Shader').slice(0, 10))}</span>`; ghost.show(g); }
    if (d.moved){ ghost.move(e.clientX, e.clientY); const t = document.elementFromPoint(e.clientX, e.clientY), p = t && t.closest('.pad'); pads.forEach(q => q.el.classList.toggle('drop', q.el === p)); } });
  const end = e => { if (!d) return; const was = d; d = null;
    const t = was.moved && e && document.elementFromPoint(e.clientX, e.clientY), p = t && t.closest('.pad');
    ghost.hide(); pads.forEach(q => q.el.classList.remove('drop')); $('#shaderPanel').classList.remove('dragging');
    if (!was.moved) shaderOk(); else if (p) shaderOk(+p.dataset.i); };
  chip.addEventListener('pointerup', end); chip.addEventListener('pointercancel', () => end(null)); }
$('#shaderPanel').addEventListener('pointerdown', e => { if (e.target.id === 'shaderPanel') closeShader(); });
