// ---------- procedural mesh builder (32 byte vertex: pos f32x3, nrm f32x3, color u8x4, mat u8x4) ----------
const MAXV = 1 << 20;
let vbuf = new ArrayBuffer(MAXV * 32), vf = new Float32Array(vbuf), vu = new Uint8Array(vbuf), ibuf = new Uint32Array(MAXV * 3 / 2), nv = 0, ni = 0;
let mM = 0, mR = 255, mG = 255, mB = 255, mA = 0;
const setM = (m, r, g, b, e) => { mM = m; mR = min(255, r * 255) | 0; mG = min(255, g * 255) | 0; mB = min(255, b * 255) | 0; mA = min(255, (e || 0) * 255 / 32) | 0; };
function vert(x, y, z, nx, ny, nz) {
  const o = nv * 8, b = nv * 32 + 24;
  vf[o] = x; vf[o + 1] = y; vf[o + 2] = z; vf[o + 3] = nx; vf[o + 4] = ny; vf[o + 5] = nz;
  vu[b] = mR; vu[b + 1] = mG; vu[b + 2] = mB; vu[b + 3] = mA; vu[b + 4] = mM;
  return nv++;
}
const tri4 = (a, b, c, d) => { ibuf[ni++] = a; ibuf[ni++] = b; ibuf[ni++] = c; ibuf[ni++] = a; ibuf[ni++] = c; ibuf[ni++] = d; };
// quad from corner a with edges u, v; normal = u x v
function quad(ax, ay, az, ux, uy, uz, vx, vy, vz) {
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  tri4(vert(ax, ay, az, nx, ny, nz), vert(ax + ux, ay + uy, az + uz, nx, ny, nz), vert(ax + ux + vx, ay + uy + vy, az + uz + vz, nx, ny, nz), vert(ax + vx, ay + vy, az + vz, nx, ny, nz));
}
function box(x0, y0, z0, x1, y1, z1, mask = 63) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  if (mask & 1) quad(x1, y0, z0, 0, dy, 0, 0, 0, dz);
  if (mask & 2) quad(x0, y0, z0, 0, 0, dz, 0, dy, 0);
  if (mask & 4) quad(x0, y1, z0, 0, 0, dz, dx, 0, 0);
  if (mask & 8) quad(x0, y0, z0, dx, 0, 0, 0, 0, dz);
  if (mask & 16) quad(x0, y0, z1, dx, 0, 0, 0, dy, 0);
  if (mask & 32) quad(x0, y0, z0, 0, dy, 0, dx, 0, 0);
}
const P3 = [0, 0, 0], N3 = [0, 0, 0];
// cylinder along axis ax (0 x, 1 y, 2 z); caps bit 1 = +end, 2 = -end
function cyl(ax, cx, cy, cz, r, hl, seg, caps = 0) {
  const b = (ax + 1) % 3, c = (ax + 2) % 3, C = [cx, cy, cz];
  const pt = (th, s, n) => { const ct = cos(th), st = sin(th); P3[ax] = C[ax] + s * hl; P3[b] = C[b] + ct * r; P3[c] = C[c] + st * r; if (n) { N3[ax] = n; N3[b] = 0; N3[c] = 0; } else { N3[ax] = 0; N3[b] = ct; N3[c] = st; } return vert(P3[0], P3[1], P3[2], N3[0], N3[1], N3[2]); };
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg * 2 * PI, t1 = (i + 1) / seg * 2 * PI;
    tri4(pt(t0, -1), pt(t1, -1), pt(t1, 1), pt(t0, 1));
    if (caps & 1) { P3[ax] = C[ax] + hl; P3[b] = C[b]; P3[c] = C[c]; N3[ax] = 1; N3[b] = 0; N3[c] = 0; const m = vert(P3[0], P3[1], P3[2], N3[0], N3[1], N3[2]), p = pt(t0, 1, 1), q = pt(t1, 1, 1); ibuf[ni++] = m; ibuf[ni++] = p; ibuf[ni++] = q; }
    if (caps & 2) { P3[ax] = C[ax] - hl; P3[b] = C[b]; P3[c] = C[c]; N3[ax] = -1; N3[b] = 0; N3[c] = 0; const m = vert(P3[0], P3[1], P3[2], N3[0], N3[1], N3[2]), p = pt(t1, -1, -1), q = pt(t0, -1, -1); ibuf[ni++] = m; ibuf[ni++] = p; ibuf[ni++] = q; }
  }
}
function ell(cx, cy, cz, rx, ry, rz, seg = 12, rings = 7) {
  const pt = (i, j) => { const th = i / rings * PI, ph = j / seg * 2 * PI, x = sin(th) * cos(ph), y = cos(th), z = sin(th) * sin(ph); let nx = x / rx, ny = y / ry, nz = z / rz; const l = hypot(nx, ny, nz); return vert(cx + x * rx, cy + y * ry, cz + z * rz, nx / l, ny / l, nz / l); };
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) tri4(pt(i, j), pt(i, j + 1), pt(i + 1, j + 1), pt(i + 1, j));
}

// ---------- unit cube mesh (morphed per instance into box / sphere / cylinder in the vertex shader) ----------
const UN = 6;
{
  const F = [[1, 0, 0, 0, 1, 0, 0, 0, 1], [-1, 0, 0, 0, 0, 1, 0, 1, 0], [0, 1, 0, 0, 0, 1, 1, 0, 0], [0, -1, 0, 1, 0, 0, 0, 0, 1], [0, 0, 1, 1, 0, 0, 0, 1, 0], [0, 0, -1, 0, 1, 0, 1, 0, 0]];
  setM(0, 1, 1, 1, 1.004);
  for (const [nx, ny, nz, ux, uy, uz, wx, wy, wz] of F) {
    const b = nv;
    for (let j = 0; j <= UN; j++) for (let i = 0; i <= UN; i++) { const s = i / UN * 2 - 1, t = j / UN * 2 - 1; vert(nx + ux * s + wx * t, ny + uy * s + wy * t, nz + uz * s + wz * t, nx, ny, nz); }
    for (let j = 0; j < UN; j++) for (let i = 0; i < UN; i++) { const a = b + j * (UN + 1) + i; tri4(a, a + 1, a + UN + 2, a + UN + 1); }
  }
}
const unitV = new Uint8Array(vbuf.slice(0, nv * 32)), unitI = ibuf.slice(0, ni), unitNI = ni;
nv = 0; ni = 0;

// ---------- lights ----------
const MAXL = 640, lightD = new Float32Array(MAXL * 8); let nL = 0;
const addLight = (x, y, z, r, g, b, I, rad, src = .3) => { const o = nL++ * 8; lightD[o] = x; lightD[o + 1] = y; lightD[o + 2] = z; lightD[o + 3] = rad; lightD[o + 4] = r * I; lightD[o + 5] = g * I; lightD[o + 6] = b * I; lightD[o + 7] = src; };

// ---------- the ship ----------
const barrels = []; // explosive barrels: x, z pairs (drawn and simulated by the game)
const spawns = []; // [type char, x, z]
{
  let ox = 0, oz = 0, tx = 0, tz = 0, inx = 0, inz = 0;
  // box / quad / cylinder in wall-local frame: s along wall, y up, d into the room
  const wb = (s0, y0, d0, s1, y1, d1) => { const xa = ox + tx * s0 + inx * d0, xb = ox + tx * s1 + inx * d1, za = oz + tz * s0 + inz * d0, zb = oz + tz * s1 + inz * d1; box(min(xa, xb), y0, min(za, zb), max(xa, xb), y1, max(za, zb)); };
  const wq = (s0, y0, s1, y1) => quad(ox + tx * s0, y0, oz + tz * s0, tx * (s1 - s0), 0, tz * (s1 - s0), 0, y1 - y0, 0);
  const wc = (s0, s1, y, d, r, seg = 8) => cyl(tx ? 0 : 2, ox + tx * (s0 + s1) / 2 + inx * d, y, oz + tz * (s0 + s1) / 2 + inz * d, r, (s1 - s0) / 2, seg);
  const wcy = (s, d, y0, y1, r) => cyl(1, ox + tx * s + inx * d, (y0 + y1) / 2, oz + tz * s + inz * d, r, (y1 - y0) / 2, 8);
  const DX = [0, 0, -1, 1], DZ = [-1, 1, 0, 0];
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
    const i = z * MW + x; if (solid[i]) continue;
    const H = cellH[i], zn = zone[i], hall = H > 4, x0 = x * CS, z0 = z * CS, cx = x0 + 2, cz = z0 + 2, e = String.fromCharCode(ent[i]), hh = hashi(x, z);
    const deck = z <= 3, amber = !zn && !hall && hashi(x >> 1, (z >> 1) + 77) < .16;
    const ac = zn ? [1, .14, .1] : amber ? [1, .55, .12] : [.12, .7, 1];           // accent
    const wt = zn ? [.2, .16, .17] : hall ? [.21, .23, .27] : [.23, .26, .31];       // wall tint
    const lc = zn ? (hall ? [.95, .22, .5] : [1, .2, .13]) : hall ? [1, .88, .72] : amber ? [1, .62, .28] : [.72, .86, 1];
    // floor + ceiling
    setM(1, ac[0], ac[1], ac[2]); quad(x0, 0, z0, 0, 0, CS, CS, 0, 0);
    setM(3, .5, .5, .5); quad(x0, H, z0, CS, 0, 0, 0, 0, CS);
    setM(4, .2, .21, .24);
    const bh = hall ? .5 : .28;
    box(x0 - .16, H - bh, z0, x0 + .16, H, z0 + CS, 11); box(x0, H - bh, z0 - .16, x0 + CS, H, z0 + .16, 56);
    const ew = !isSolid(x - 1, z) || !isSolid(x + 1, z), ns = !isSolid(x, z - 1) || !isSolid(x, z + 1), alongX = ew && !ns ? 1 : ns && !ew ? 0 : (x & 1);
    // ceiling light
    const lit = e !== 'P' && e !== 'R' && (hall ? (x % 2 === 0 && z % 2 === 1) : ((x + z) & 1) === 0);
    if (lit) {
      const lw = hall ? .7 : alongX ? .9 : .16, ld = hall ? .7 : alongX ? .16 : .9;
      setM(4, .12, .13, .15); box(cx - lw - .1, H - .1, cz - ld - .1, cx + lw + .1, H, cz + ld + .1);
      setM(6, lc[0], lc[1], lc[2], deck ? 6 : hall ? 9 : 10); box(cx - lw, H - .13, cz - ld, cx + lw, H - .1, cz + ld, 8 | 1 | 2 | 16 | 32);
      addLight(cx, H - (hall ? 1.2 : .7), cz, lc[0], lc[1], lc[2], deck ? 6 : hall ? (zn ? 20 : 17) : zn ? 8 : 11, hall ? 15 : 10.5);
    }
    // ceiling duct in corridors
    if (!hall && ew !== ns) {
      setM(4, .16, .17, .19);
      if (alongX) box(x0, 3.5, z0 + 2.75, x0 + CS, 3.86, z0 + 3.25, 56); else box(x0 + 2.75, 3.5, z0, x0 + 3.25, 3.86, z0 + CS, 11);
    }
    // walls
    for (let d = 0; d < 4; d++) {
      const ax = x + DX[d], az = z + DZ[d], nb = ch(ax, az);
      inx = -DX[d]; inz = -DZ[d]; tx = inz; tz = -inx; ox = cx - inx * 2 - tx * 2; oz = cz - inz * 2 - tz * 2;
      const eh = hashi(x * 4 + d, z * 7 + 3), eh2 = hashi(x * 4 + d + 91, z * 7);
      if (nb === 'w') {
        const y1 = H - .9;
        setM(4, .2, .215, .24);
        wb(0, 0, -.6, 4, .9, 0); wb(0, y1, -.6, 4, H, 0); wb(0, .9, -.6, .3, y1, 0); wb(3.7, .9, -.6, 4, y1, 0);
        if (hall) wb(.3, 3.97, -.36, 3.7, 4.09, -.24);
        setM(6, ac[0], ac[1], ac[2], 5); wb(.4, .9, -.07, 3.6, .95, -.02);
        setM(4, .13, .14, .16); wb(0, 0, 0, 4, .25, .12);
      } else if (nb === '#') {
        const hive = zn && eh2 < .55;
        setM(hive ? 13 : 2, hive ? 1 : wt[0], hive ? .25 : wt[1], hive ? .1 : wt[2], hive ? 3 : 0); wq(0, 0, 4, H);
        setM(4, .13, .14, .16); wb(0, 0, 0, 4, .25, .12);
        setM(4, .2, .215, .24); wb(0, 0, 0, .16, H, .22); wb(3.84, 0, 0, 4, H, .22);
        if (eh2 > .3) { setM(6, ac[0], ac[1], ac[2], zn ? 2.5 : 3.5); wb(.3, .25, .02, 3.7, .3, .07); }
        if (!hall) {
          setM(4, wt[0] * .55, wt[1] * .55, wt[2] * .55);
          quad(ox, 3.05, oz, tx * 4, 0, tz * 4, inx * .95, .95, inz * .95);
          setM(7, .55, .3, .16); wc(0, 4, 2.9, .13, .055);
          setM(7, .3, .32, .35); wc(0, 4, 2.76, .1, .035); wc(0, 4, 2.68, .09, .025, 6);
          setM(4, .16, .17, .19); wb(1.9, 2.6, 0, 2.1, 2.98, .2);
        } else {
          setM(4, .2, .215, .24); wb(0, 3.85, 0, 4, 4.2, .3);
          setM(6, lc[0], lc[1], lc[2], 4.5); wb(.3, 3.79, .1, 3.7, 3.85, .24);
          setM(7, .3, .32, .35); wc(0, 4, 7.3, .2, .12); wc(0, 4, 6.95, .14, .06);
          setM(4, .16, .17, .19); wb(1.8, 4.2, 0, 2.2, H, .12);
        }
        if (hive) {
          setM(13, 1, .25, .1, 3);
          for (let k = 0; k < 3; k++) { const s = .6 + hashi(x * 9 + k, z * 5 + d) * 2.8, r = .25 + hashi(x + k * 7, z + d * 3) * .35; ell(ox + tx * s + inx * r * .5, r * .7, oz + tz * s + inz * r * .5, r, r * 1.1, r, 10, 6); }
          setM(6, 1, .5, .1, 5); ell(ox + tx * 2 + inx * .3, .18, oz + tz * 2 + inz * .3, .16, .2, .16, 8, 5);
          setM(13, 1, .25, .1, 3);
          for (let k = 0; k < 4; k++) { const s = .5 + hashi(x * 3 + k * 5, z * 9 + d) * 3, hgt = 1 + hashi(x + k, z * 4 + d) * (H - 1.6), r = .1 + hashi(x * 7 + k, z + d) * .1; ell(ox + tx * s + inx * r * .4, hgt * .5, oz + tz * s + inz * r * .4, r * (1 + .5 * tx * tx), hgt * .5, r * (1 + .5 * tz * tz), 8, 6); ell(ox + tx * (s + .2) + inx * .05, hgt, oz + tz * (s + .2) + inz * .05, .22, .3, .22, 8, 5); }
        } else if (eh < .3) {
          setM(4, .12, .13, .15); wb(.4, 1.86, 0, 3.6, 2.04, .04);
          setM(6, ac[0], ac[1], ac[2], 7); wb(.5, 1.92, .03, 3.5, 1.98, .06);
        } else if (eh < .42) {
          // cable tray with junction boxes
          setM(4, .12, .13, .15); wb(0, 1.5, 0, 4, 1.54, .16);
          setM(7, .08, .08, .09); wc(0, 4, 1.585, .05, .04); wc(0, 4, 1.575, .115, .03); setM(7, .45, .12, .08); wc(0, 4, 1.57, .16, .022, 6);
          setM(4, .17, .18, .2); wb(.7, 1.25, 0, 1.2, 1.5, .13); wb(2.7, 1.62, 0, 3.3, 2.0, .11);
          setM(6, .2, 1, .4, 5); wb(.78, 1.42, .13, .83, 1.46, .135); setM(6, 1, .3, .1, 5); wb(.9, 1.42, .13, .95, 1.46, .135);
          setM(8, ac[0], ac[1], ac[2], 2.5); wb(2.76, 1.68, .11, 3.24, 1.94, .115);
        } else if (eh < .5) {
          // breaker cabinet
          setM(4, .15, .16, .185); wb(1.2, .25, 0, 2.8, 2.3, .2);
          setM(4, .09, .095, .11); wb(1.26, .35, .2, 1.98, 2.2, .215); wb(2.02, .35, .2, 2.74, 2.2, .215);
          setM(4, .3, .31, .33); wb(1.9, 1.15, .215, 1.94, 1.4, .25); wb(2.06, 1.15, .215, 2.1, 1.4, .25);
          for (let k = 0; k < 5; k++) { setM(6, k % 2 ? .2 : 1, k % 2 ? 1 : .5, k % 2 ? .4 : .1, 4); wb(1.36 + k * .11, 1.95, .215, 1.41 + k * .11, 2.0, .22); }
          setM(5, 1, 1, 1); wb(1.2, 2.3, 0, 2.8, 2.38, .21);
        } else if (eh < .58) {
          setM(4, .14, .15, .17); wb(.9, .5, 0, 3.1, 1.7, .05);
          setM(9, .3, .32, .35); wb(1, .6, .04, 3, 1.6, .07);
        } else if (eh < .7) {
          setM(4, .15, .16, .18); wb(1.1, .8, 0, 2.9, 2, .16); wb(1.1, .8, .16, 2.9, 1.0, .5);
          setM(8, ac[0], ac[1], ac[2], 3); wb(1.2, 1.12, .16, 2.8, 1.9, .175);
          setM(6, ac[0], ac[1], ac[2], 4); wb(1.3, 1.0, .3, 2.7, 1.012, .46);
        } else if (eh < .84) {
          setM(7, .32, .34, .37); wcy(.9, .09, .25, hall ? 3.85 : 3.1, .06); wcy(1.08, .09, .25, hall ? 3.85 : 3.1, .045);
          setM(7, .5, .28, .15); wcy(1.24, .08, .25, hall ? 3.85 : 3.1, .035);
          setM(4, .15, .16, .18); wb(.78, 1.3, 0, 1.36, 1.7, .2);
          setM(6, 1, .5, .12, 6); wb(1.0, 1.56, .2, 1.06, 1.62, .21);
          setM(6, .2, 1, .4, 6); wb(1.12, 1.56, .2, 1.18, 1.62, .21);
        } else {
          setM(5, 1, 1, 1); wb(.6, .25, 0, 3.4, .5, .14);
          setM(4, .15, .16, .18); wb(2.6, 1.2, 0, 3.2, 2.2, .1);
          setM(6, ac[0], ac[1], ac[2], 5); wb(2.7, 2.02, .1, 3.1, 2.1, .11);
        }
      } else {
        const Hn = cellH[az * MW + ax];
        if (Hn < H) {
          setM(2, wt[0], wt[1], wt[2]); wq(0, Hn, 4, H);
          setM(5, 1, 1, 1); wb(0, Hn, 0, 4, Hn + .3, .3);
          setM(4, .2, .215, .24); wb(0, 0, 0, .3, Hn, .3); wb(3.7, 0, 0, 4, Hn, .3);
          setM(6, ac[0], ac[1], ac[2], 5); wb(.3, Hn - .06, .12, 3.7, Hn, .2);
        }
      }
    }
    // props
    if (e === 'P') {
      setM(2, .17, .19, .23); box(cx - .5, 0, cz - .5, cx + .5, H, cz + .5, 51);
      setM(4, .1, .11, .13); box(cx - .09, .4, cz - .53, cx + .09, H - .5, cz + .53, 51); box(cx - .53, .4, cz - .09, cx + .53, H - .5, cz + .09, 51);
      setM(4, .14, .15, .17); box(cx - .68, 0, cz - .68, cx + .68, .4, cz + .68); box(cx - .68, H - .5, cz - .68, cx + .68, H, cz + .68);
      setM(6, ac[0], ac[1], ac[2], 6);
      box(cx - .05, .5, cz + .53, cx + .05, H - .6, cz + .545); box(cx - .05, .5, cz - .545, cx + .05, H - .6, cz - .53); box(cx + .53, .5, cz - .05, cx + .545, H - .6, cz + .05); box(cx - .545, .5, cz - .05, cx - .53, H - .6, cz + .05);
    } else if (e === 'X') {
      const k = hh < .33 ? [.6, .26, .1] : hh < .66 ? [.12, .36, .4] : [.34, .35, .37];
      const crate = (x0, y0, z0, x1, y1, z1, c) => {
        setM(12, c[0], c[1], c[2]); box(x0, y0, z0, x1, y1, z1);
        setM(4, .1, .11, .13);
        for (let q = 0; q < 4; q++) { const px = q & 1 ? x1 : x0, pz = q & 2 ? z1 : z0; box(px - .05, y0, pz - .05, px + .05, y1 + .02, pz + .05); }
        box(x0 - .03, y0, z0 - .03, x1 + .03, y0 + .09, z1 + .03, 51); box(x0 - .03, y1 - .07, z0 - .03, x1 + .03, y1 + .02, z1 + .03, 55);
        setM(4, .3, .31, .33); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
        box(mx - .07, my - .1, z1, mx + .07, my + .1, z1 + .035); box(mx - .07, my - .1, z0 - .035, mx + .07, my + .1, z0); box(x1, my - .1, mz - .07, x1 + .035, my + .1, mz + .07); box(x0 - .035, my - .1, mz - .07, x0, my + .1, mz + .07);
      };
      crate(cx - 1, 0, cz - 1, cx + 1, 1.3, cz + 1, k);
      const k2 = hh > .5 ? [.6, .26, .1] : [.12, .36, .4], o = hh * .5 - .25;
      crate(cx - .6 + o, 1.32, cz - .55, cx + .6 + o, 2.25, cz + .55, k2);
    } else if (e === 'B') {
      for (let q = 0; q < 3; q++) {
        const a = q * 2.1 + hh * 6, bx = cx + cos(a) * .55, bz = cz + sin(a) * .55, c = q === 0 ? [.55, .4, .06] : q === 1 ? [.2, .22, .25] : [.1, .3, .34], hgt = q === 2 ? .5 : .62;
        if (!q) { barrels.push(bx, bz); continue; }
        setM(7, c[0], c[1], c[2]); cyl(1, bx, hgt, bz, .42, hgt, 18, 1);
        setM(4, .1, .11, .13); cyl(1, bx, hgt * .66, bz, .44, .03, 18); cyl(1, bx, hgt * 1.33, bz, .44, .03, 18); cyl(1, bx, hgt * 2 - .02, bz, .44, .03, 18, 1); cyl(1, bx + .2, hgt * 2 + .02, bz, .06, .03, 8, 1);
      }
    } else if (e === 'C') {
      setM(4, .16, .17, .2); cyl(1, cx, .43, cz, 1, .43, 24, 1); cyl(1, cx, .1, cz, 1.06, .1, 24, 1);
      setM(8, .2, .85, 1, 4); cyl(1, cx, .875, cz, .86, .012, 24, 1);
      setM(6, .2, .85, 1, 6); cyl(1, cx, .7, cz, 1.012, .015, 24);
      addLight(cx, 1.7, cz, .25, .85, 1, 9, 7);
    } else if (e === 'T') {
      setM(7, .2, .36, .36); cyl(1, cx, 1.6, cz, .9, 1.6, 24, 1);
      setM(4, .14, .15, .17); cyl(1, cx, .15, cz, .98, .15, 24, 1); cyl(1, cx, 3.25, cz, .5, .12, 16, 1);
      setM(6, .25, 1, .55, 7); cyl(1, cx, .9, cz, .915, .035, 24); cyl(1, cx, 2.3, cz, .915, .035, 24);
      addLight(cx, 1.6, cz, .25, 1, .55, 12, 8, 1.2);
    } else if (e === 'R') {
      setM(18, .35, .85, 1, 7); cyl(1, cx, 4, cz, .8, 4, 28);
      setM(4, .17, .18, .21);
      for (const y of [.25, 2.6, 5.4, 7.75]) cyl(1, cx, y, cz, 1.4, .25, 28, 3);
      for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; box(cx + cos(a) * 1.25 - .1, 0, cz + sin(a) * 1.25 - .1, cx + cos(a) * 1.25 + .1, 8, cz + sin(a) * 1.25 + .1, 51); }
      addLight(cx, 1.5, cz, .3, .8, 1, 40, 18, 1.75); addLight(cx, 4.1, cz, .3, .8, 1, 40, 18, 1.75); addLight(cx, 6.6, cz, .3, .8, 1, 30, 18, 1.75);
    } else if (ent[i] && e !== 'S') spawns.push([e, cx, cz]);
    // hive floor growth
    if (zn && hh < .45 && !ent[i]) {
      setM(13, 1, .25, .1, 3);
      for (let k = 0; k < 2; k++) { const a = hashi(x + k * 3, z * 11) * 6.28, r = .3 + hashi(x * 5, z + k) * .4, q = .5 + hashi(x * 13 + k, z) * 1; ell(cx + cos(a) * q, r * .25, cz + sin(a) * q, r, r * .5, r, 10, 5); }
    }
  }
}
const worldV = new Uint8Array(vbuf, 0, nv * 32), worldI = ibuf.subarray(0, ni), worldNI = ni;
// per-cell light lists (15 strongest lights reaching each cell)
const cellL = new Uint32Array(NC * 16);
{
  const w = new Float32Array(MAXL);
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
    const c = z * MW + x; if (solid[c]) continue;
    const cx = x * CS + 2, cz = z * CS + 2; let n = 0;
    for (let l = 0; l < nL; l++) {
      const o = l * 8, dx = max(abs(lightD[o] - cx) - 2, 0), dz = max(abs(lightD[o + 2] - cz) - 2, 0), d2 = dx * dx + dz * dz, r = lightD[o + 3];
      w[l] = 0; if (d2 >= r * r) continue;
      // reachable: any corner / center of the cell sees the light
      let vis = 0;
      for (let k = 0; k < 9 && !vis; k++) {
        const sx = cx + (k % 3 - 1) * 1.7, sz = cz + ((k / 3 | 0) - 1) * 1.7, lx = lightD[o] - sx, lz = lightD[o + 2] - sz, ll = hypot(lx, lz), f = max(0, 1 - (lightD[o + 7] + .1) / (ll + 1e-6));
        vis = ll < 2.9 || los(sx, sz, sx + lx * f, sz + lz * f);
      }
      if (!vis) continue;
      const a = 1 - d2 * d2 / (r * r * r * r); w[l] = (lightD[o + 4] + lightD[o + 5] + lightD[o + 6]) * a * a / (d2 + 1);
    }
    for (; n < 9; n++) { let b = -1, bw = 1e-4; for (let l = 0; l < nL; l++) if (w[l] > bw) { bw = w[l]; b = l; } if (b < 0) break; w[b] = 0; cellL[c * 16 + 1 + n] = b; }
    cellL[c * 16] = n;
  }
}
