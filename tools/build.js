// Concatenates src/*.js into one async IIFE, minifies WGSL + JS, writes a single self-contained index.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), T = process.env.TOOLS || path.join(root, 'node_modules');
const { minify } = require(path.join(T, 'terser'));
const files = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort();
let src = files.map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const wgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,=+*\/<>:&|!%-]) ?/g, '$1').trim();
const page = (js) => `<!doctype html><html lang=en><meta charset=utf-8><title>HULL BREACH</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font:15px/1.7 system-ui,sans-serif;color:#bfe9ff}#c{width:100%;height:100%;display:block}#o{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;background:radial-gradient(#0008,#000d);cursor:pointer}#m{max-width:90vw;letter-spacing:.06em}#m b{font-size:34px;letter-spacing:.3em;color:#fff;font-weight:600}#d a{display:inline-block;border:1px solid #4a7a90;border-radius:4px;padding:2px 16px;margin:0 5px;letter-spacing:.2em}#d a:hover{border-color:#fff}#d a.s{background:#bfe9ff;color:#012;border-color:#bfe9ff}#m table{margin:6px auto 0;border-spacing:16px 0;font-variant-numeric:tabular-nums;opacity:.85}#m tr.s{color:#fff;font-weight:700}#n{background:#0006;border:1px solid #4a7a90;border-radius:4px;color:#fff;font:inherit;letter-spacing:.15em;text-align:center;padding:3px 8px;width:11em;outline:0}kbd{border:1px solid #4a7a90;border-radius:4px;padding:1px 7px;margin:0 2px;color:#fff}</style>
<canvas id=c></canvas><div id=o><div id=m><b>HULL BREACH</b><br>The ship is overrun. Kill every alien aboard.<br><br><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> sprint &nbsp; <kbd>Mouse</kbd> look &nbsp; <kbd>LMB</kbd> fire &nbsp; <kbd>R</kbd> reload<br><kbd>1</kbd> shotgun &nbsp; <kbd>2</kbd> minigun (find it aboard) &nbsp; <kbd>Q</kbd> / wheel swap &nbsp; <kbd>M</kbd> music<br><br><span id=d><a>EASY</a><a>MEDIUM</a><a>HARD</a></span><br><br><input id=n maxlength=12 placeholder=\"YOUR NAME\" autocomplete=off spellcheck=false><br><br>BEST TIMES<div id=l></div><br>Click to board<br><br><small style=opacity:.6>v1.4 &nbsp;&middot;&nbsp; <span id=sd></span> &nbsp;&middot;&nbsp; &copy; 2026 masodj@centrum.cz</small></div></div>
<script>${js}</script></html>`;
(async () => {
  const dev = `(async()=>{\n${src}\n})();`;
  if (process.env.DEVOUT) fs.writeFileSync(process.env.DEVOUT, page(dev));
  const small = dev.replace(/\/\*wgsl\*\/`([\s\S]*?)`/g, (m, s) => '`' + wgsl(s) + '`');
  const r = await minify(small, { compress: { passes: 3, unsafe_math: true, ecma: 2020 }, mangle: { toplevel: true }, format: { ecma: 2020 } });
  const html = page(r.code);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  console.log('index.html', Buffer.byteLength(html), 'bytes');
})();
