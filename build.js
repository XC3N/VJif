#!/usr/bin/env node
// Builds the tool into one standalone HTML file: dist/<output> (+ dist/index.html, a copy, for GitHub Pages).
//
// tool.json: { name, entry, output, description, licence? }.
// Source files pull in other files with include markers, inlined recursively:
//   <!-- @include common/theme.css -->      in HTML
//   /* @include src/core.js */              inside <style> or <script>
//   <!-- @markdown CHANGELOG.md -->         a Markdown file turned into HTML (headings, lists, paragraphs, `code`, **bold**, links)
// Paths are relative to the repo root. common/ is a pinned copy of XC3N/webtools' shared code (see common/PINNED.json,
// refresh with `node sync-common.js <webtools clone>`). No dependencies: `node build.js`.
'use strict';
const fs = require('fs'), path = require('path');
const root = __dirname, out = path.join(root, 'dist');
const MARK = /<!--\s*@include\s+(\S+?)\s*-->|\/\*\s*@include\s+(\S+?)\s*\*\//g, MD = /<!--\s*@markdown\s+(\S+?)\s*-->/g;

function inline(file, stack = []){
  if (stack.includes(file)) throw new Error('include cycle: ' + [...stack, file].map(f => path.relative(root, f)).join(' → '));
  if (!fs.existsSync(file)) throw new Error(`missing include ${path.relative(root, file)} (from ${path.relative(root, stack.at(-1) || file)})`);
  return fs.readFileSync(file, 'utf8').replace(MD, (_, f) => markdown(path.join(root, f), file))
    .replace(MARK, (_, a, b) => inline(path.join(root, a || b), [...stack, file]));
}
// just enough Markdown for changelogs and notes
function markdown(file, from){
  if (!fs.existsSync(file)) throw new Error(`missing markdown ${path.relative(root, file)} (from ${path.relative(root, from)})`);
  const span = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const html = [], para = [];
  let list = false;
  const flush = () => { if (para.length){ html.push(`<p>${span(para.join(' '))}</p>`); para.length = 0; } if (list){ html.push('</ul>'); list = false; } };
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)){
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))){ flush(); const n = m[1].length; html.push(`<h${n + 2}>${span(m[2])}</h${n + 2}>`); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))){ if (para.length) flush(); if (!list){ html.push('<ul>'); list = true; } html.push(`<li>${span(m[1])}</li>`); }
    else if (!line.trim()) flush();
    else if (list && /^\s+/.test(line)) html[html.length - 1] = html.at(-1).replace(/<\/li>$/, ' ' + span(line.trim()) + '</li>');
    else { if (list) flush(); para.push(line.trim()); }
  }
  flush(); return html.join('\n');
}
// every inline <script> must at least parse: a syntax error would otherwise only show up in the browser, as a blank tool
function checkScripts(html, name){
  const vm = require('vm'), re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g; let m, n = 0;
  while ((m = re.exec(html))){ n++; if (/type="(?!text\/javascript|module)/.test(m[0].slice(0, 60))) continue;
    try { new vm.Script(m[1], { filename: `${name} script ${n}` }); }
    catch (e){ const ln = (e.stack.match(/:(\d+)\n/) || [])[1]; throw new Error(`${name}: script ${n} doesn't parse: ${e.message}${ln ? ` (line ${ln} of that script)` : ''}`); } }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const meta = JSON.parse(fs.readFileSync(path.join(root, 'tool.json'), 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
// every built file carries its licence notice, so a copy passed on keeps it:
// MIT → the copyright line and the licence URL; otherwise (PolyForm Shield) LICENSE.md's Required Notice lines
const header = meta.licence === 'MIT'
  ? `Copyright (c) 2026 XC3N (${meta.repo})\nLicence: MIT, ${meta.repo}/blob/main/LICENSE.md`
  : fs.readFileSync(path.join(root, 'LICENSE.md'), 'utf8').split('\n').filter(l => /^(Required Notice|Licensor Line of Business):/.test(l)).join('\n')
    + '\nLicence: PolyForm Shield 1.0.0, https://polyformproject.org/licenses/shield/1.0.0';
const html = inline(path.join(root, meta.entry));
checkScripts(html, meta.output);
const built = html.replace(/^(<!doctype html>\s*)/i, `$1<!--\n${header}\n-->\n`);
fs.writeFileSync(path.join(out, meta.output), built);
fs.writeFileSync(path.join(out, 'index.html'), built);   // the Pages site opens on the tool itself
console.log(`built dist/${meta.output}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB) + dist/index.html`);
