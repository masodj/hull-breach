// ---------- params / math / map / distance fields ----------
const Q = new URLSearchParams(location.search), qn = (k, d) => Q.has(k) ? +Q.get(k) : d;
const BENCH = Q.has('bench'), FLY = BENCH || Q.has('fly'), POSE = qn('pose', -1), CAP = Q.has('cap'),
  FIXDT = qn('dt', 0), FW = qn('w', 0), FH = qn('h', 0), DUR = qn('dur', 60), AUTO = FLY || POSE >= 0;
const { sin, cos, sqrt, min, max, abs, floor, ceil, PI, atan2, hypot, exp } = Math;
let seed = 9001;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const hashi = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// '#' hull  'w' window  '.' corridor  ':' hall  ',' infested corridor  ';' infested hall
// B barrels  S start  c crawler pack  s spitter  b brute  h health  a ammo  P pillar  X cargo  C holo table  T tank  R reactor
const MAP = [
  '######wwwwwwwwwwwwwwwwwwwwwwwwwwww######',
  '######:B:::::::::::::::s::::B:::::######',
  '######::P:::P:::P:::P:::P:::P:::P:######',
  '######:::::s::::::h:::::::c::::a::######',
  '######.############..############.######',
  '#......#..........#..#..........#......#',
  '#.####.#.########.#..#.########.#.####.#',
  '#.#a.#.#.#::::::#.#..#.#::::::#.#.#h.#.#',
  '#.#..#.#.#:XB:X:#.#..#.#:C::C:#.#.#..#.#',
  '#.##.#.#.#::::::..#..#..::::::#.#.#.##.#',
  '#....#.#.#:b::::#.#..#.#::::s:#.#.#....#',
  '######.#.########......########.#.######',
  '#.................####.................#',
  '#.####.####.####.#:::B#.####.####.####.#',
  '#.#..#.#,,,,,,,#..S:::#.#......##.#..#.#',
  '#.#h.#.#,,c,,,,#.#::::..#..X...##.#a.#.#',
  '#.##.#.#,,,,,b,#.#::::#.#....c.##.#.##.#',
  '#....#.#,,,,,,,#.######.#....B.##.#....#',
  '######.#,,,,,,,#........#......##.######',
  '#......####,####.######.###..###......##',
  '#.#;;;;;;B;;;;;#.#:B::::::::::#.#:::::B#',
  '#.#;;P;;;;;;P;;#.#:::X::R:::X:#.#::T:::#',
  '#..;;;;;b;;;;;;...::::::::::::...::::s:#',
  '#.#;;;s;;;;c;;;#.#::b:::::c:::#.#:::::a#',
  '#.#;;P;;h;;;P;;#.#:::X::::a:X:#.#::T::B#',
  '###wwwwwwwwwwww#########################'];
const MW = 40, MH = 26, CS = 4, TPM = 4, SW = MW * CS * TPM, SH = MH * CS * TPM, NC = MW * MH;
const solid = new Uint8Array(NC), cellH = new Float32Array(NC), zone = new Uint8Array(NC), blocked = new Uint8Array(NC), ent = new Uint8Array(NC);
const ch = (x, z) => x < 0 || z < 0 || x >= MW || z >= MH ? '#' : MAP[z][x];
const isSolid = (x, z) => x < 0 || z < 0 || x >= MW || z >= MH || solid[z * MW + x] === 1;
let startX = 0, startZ = 0, winC0 = 99, winC1 = 0;
for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
  const c = ch(x, z), i = z * MW + x;
  if (c === '#' || c === 'w') { solid[i] = 1; blocked[i] = 1; if (c === 'w' && z === 0) { winC0 = min(winC0, x); winC1 = max(winC1, x); } continue; }
  let tall = c === ':' || c === ';', inf = c === ',' || c === ';';
  if (!'.:,;'.includes(c)) {
    ent[i] = c.charCodeAt(0);
    for (let k = 0; k < 4; k++) { const n = ch(x + [1, -1, 0, 0][k], z + [0, 0, 1, -1][k]); if (n === ':' || n === ';') tall = true; if (n === ',' || n === ';') inf = true; }
    if ('PXCTRB'.includes(c)) blocked[i] = 1;
    if (c === 'S') { startX = x; startZ = z; }
  }
  cellH[i] = tall ? 8 : 4; zone[i] = inf ? 1 : 0;
}

// ---------- 2D signed distance fields (walls for shadows/LOS, walls+props for collision) ----------
const occS = new Uint8Array(SW * SH), occC = new Uint8Array(SW * SH);
const stampB = (o, x0, z0, x1, z1) => { for (let tz = floor(z0 * TPM); tz < ceil(z1 * TPM); tz++) for (let tx = floor(x0 * TPM); tx < ceil(x1 * TPM); tx++) o[tz * SW + tx] = 1; };
const stampC = (o, cx, cz, r) => { for (let tz = floor((cz - r) * TPM); tz <= ceil((cz + r) * TPM); tz++) for (let tx = floor((cx - r) * TPM); tx <= ceil((cx + r) * TPM); tx++) if (hypot((tx + .5) / TPM - cx, (tz + .5) / TPM - cz) < r) o[tz * SW + tx] = 1; };
for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
  const i = z * MW + x, e = String.fromCharCode(ent[i]), cx = x * CS + 2, cz = z * CS + 2;
  if (solid[i]) { stampB(occS, x * CS, z * CS, x * CS + CS, z * CS + CS); stampB(occC, x * CS, z * CS, x * CS + CS, z * CS + CS); }
  else if (e === 'P') { stampB(occS, cx - .5, cz - .5, cx + .5, cz + .5); stampB(occC, cx - .75, cz - .75, cx + .75, cz + .75); }
  else if (e === 'R') { stampC(occS, cx, cz, 1.5); stampC(occC, cx, cz, 1.6); }
  else if (e === 'T') { stampC(occS, cx, cz, .9); stampC(occC, cx, cz, 1); }
  else if (e === 'X') stampB(occC, cx - 1, cz - 1, cx + 1, cz + 1);
  else if (e === 'C') stampC(occC, cx, cz, 1.05);
  else if (e === 'B') stampC(occC, cx, cz, 1.05);
}
function edt(occ, want) {
  const INF = 1e20, n = max(SW, SH), g = new Float64Array(SW * SH), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  const dt = (len) => {
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= zz[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < SW; x++) { for (let y = 0; y < SH; y++) f[y] = occ[y * SW + x] === want ? 0 : INF; dt(SH); for (let y = 0; y < SH; y++) g[y * SW + x] = d[y]; }
  for (let y = 0; y < SH; y++) { for (let x = 0; x < SW; x++) f[x] = g[y * SW + x]; dt(SW); for (let x = 0; x < SW; x++) g[y * SW + x] = d[x]; }
  return g;
}
function makeSdf(occ) {
  const a = edt(occ, 1), b = edt(occ, 0), o = new Float32Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) o[i] = occ[i] ? -(sqrt(b[i]) - .5) / TPM : (sqrt(a[i]) - .5) / TPM;
  return o;
}
const sdS = makeSdf(occS), sdC = makeSdf(occC);
function sdfAt(a, x, z) {
  let u = x * TPM - .5, v = z * TPM - .5;
  u = u < 0 ? 0 : u > SW - 1.001 ? SW - 1.001 : u; v = v < 0 ? 0 : v > SH - 1.001 ? SH - 1.001 : v;
  const iu = u | 0, iv = v | 0, fu = u - iu, fv = v - iv, o = iv * SW + iu;
  return (a[o] * (1 - fu) + a[o + 1] * fu) * (1 - fv) + (a[o + SW] * (1 - fu) + a[o + SW + 1] * fu) * fv;
}
// clear line of sight in the wall field
function los(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l = hypot(dx, dz); if (l < .01) return 1;
  const ux = dx / l, uz = dz / l; let t = 0;
  for (let i = 0; i < 96 && t < l; i++) { const d = sdfAt(sdS, x0 + ux * t, z0 + uz * t); if (d < .04) return 0; t += d > .12 ? d : .12; }
  return 1;
}
// collision: push (cX,cZ) out of the prop field
let cX = 0, cZ = 0;
function collide(r) {
  for (let k = 0; k < 3; k++) {
    const d = sdfAt(sdC, cX, cZ);
    if (d < r) {
      const gx = sdfAt(sdC, cX + .12, cZ) - sdfAt(sdC, cX - .12, cZ), gz = sdfAt(sdC, cX, cZ + .12) - sdfAt(sdC, cX, cZ - .12), l = hypot(gx, gz) || 1;
      cX += gx / l * (r - d); cZ += gz / l * (r - d);
    }
  }
}
// BFS distance field over cells (enemy path finding + fly-through route)
const flow = new Int16Array(NC), bfsQ = new Int16Array(NC);
function bfs(sx, sz) {
  flow.fill(-1); let h = 0, t = 0; const s = sz * MW + sx; flow[s] = 0; bfsQ[t++] = s;
  while (h < t) {
    const c = bfsQ[h++], d = flow[c] + 1, x = c % MW;
    if (x > 0 && !blocked[c - 1] && flow[c - 1] < 0) { flow[c - 1] = d; bfsQ[t++] = c - 1; }
    if (x < MW - 1 && !blocked[c + 1] && flow[c + 1] < 0) { flow[c + 1] = d; bfsQ[t++] = c + 1; }
    if (c >= MW && !blocked[c - MW] && flow[c - MW] < 0) { flow[c - MW] = d; bfsQ[t++] = c - MW; }
    if (c < NC - MW && !blocked[c + MW] && flow[c + MW] < 0) { flow[c + MW] = d; bfsQ[t++] = c + MW; }
  }
}
bfs(startX, startZ);
for (let i = 0; i < NC; i++) if (!blocked[i] && flow[i] < 0) console.warn('unreachable cell', i % MW, (i / MW) | 0);
for (let z = 0; z < MH; z++) if (MAP[z].length !== MW) console.warn('bad row', z, MAP[z].length);
