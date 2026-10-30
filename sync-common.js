#!/usr/bin/env node
// Refreshes common/ (the pinned copy of XC3N/webtools' shared code) from a local clone of webtools.
//   node sync-common.js ../webtools          copy every common/ file this repo includes, at that clone's HEAD
//   node sync-common.js ../webtools --check  only list what would change
// Which files: every `@include common/…` found in this repo's sources, followed through the included files.
// common/PINNED.json records the webtools commit the copy came from. Review `git diff common/`, build, test, commit.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = __dirname, args = process.argv.slice(2), check = args.includes('--check');
const src = args.find(a => !a.startsWith('--'));
if (!src || !fs.existsSync(path.join(src, 'common'))) { console.error('usage: node sync-common.js <path to a webtools clone> [--check]'); process.exit(1); }
const MARK = /@include\s+(common\/[^\s*]+?)\s*(?:-->|\*\/)/g;

// sources of this repo (not common/, dist/, tests/, .git)
const walk = (dir, list = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })){
  if (e.name.startsWith('.') || ['dist', 'common', 'tests', 'node_modules'].includes(e.name)) continue;
  const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, list); else if (/\.(html|js|css)$/.test(e.name)) list.push(p); } return list; };
const need = new Set(), todo = [];
const scan = text => { for (const m of text.matchAll(MARK)) if (!need.has(m[1])){ need.add(m[1]); todo.push(m[1]); } };
for (const f of walk(root)) if (path.basename(f) !== 'sync-common.js') scan(fs.readFileSync(f, 'utf8'));
while (todo.length){ const f = todo.pop(), p = path.join(src, f); if (!fs.existsSync(p)) { console.error(`webtools has no ${f}`); process.exit(1); } scan(fs.readFileSync(p, 'utf8')); }
const files = [...need].sort();
if (fs.existsSync(path.join(src, 'common/README.md'))) files.push('common/README.md');

let changed = 0;
for (const f of files){
  const a = fs.readFileSync(path.join(src, f)), dst = path.join(root, f), b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
  if (b && a.equals(b)) continue;
  changed++; console.log(`${b ? 'changed' : 'new    '}  ${f}`);
  if (!check){ fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, a); }
}
// files in common/ that nothing includes any more
const walkAll = (dir, list = []) => { if (!fs.existsSync(dir)) return list; for (const e of fs.readdirSync(dir, { withFileTypes: true })){ const p = path.join(dir, e.name); if (e.isDirectory()) walkAll(p, list); else list.push(path.relative(root, p).split(path.sep).join('/')); } return list; };
for (const f of walkAll(path.join(root, 'common'))) if (!files.includes(f) && !['common/PINNED.json', 'common/LICENSE.md'].includes(f)) console.log(`unused   ${f} (delete it if nothing needs it)`);

const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8' }).trim();
const pin = { repo: 'https://github.com/XC3N/webtools', commit: git('rev-parse', 'HEAD'), date: git('log', '-1', '--format=%cs'), files };
if (git('status', '--porcelain', '--', 'common')) console.log('note: the webtools clone has uncommitted changes in common/; the pin names its HEAD commit');
if (check) console.log(changed ? `${changed} file(s) would change (webtools ${pin.commit.slice(0, 7)})` : 'common/ is up to date');
else { fs.writeFileSync(path.join(root, 'common/PINNED.json'), JSON.stringify(pin, null, 2) + '\n');
  console.log(`${changed} file(s) updated; common/PINNED.json → webtools ${pin.commit.slice(0, 7)} (${pin.date})`); }
