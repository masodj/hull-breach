// ---------- game state (all preallocated) ----------
const EYE = 1.7, NEMAX = 48, PARTS = 48, NPK = 32, NPJ = 24, IS = 36;
const EB = 1, PB = EB + NEMAX * PARTS, JB = PB + NPK * 2, WB = JB + NPJ, NBAR = 16, BB = WB + 64, MAXINST = BB + NBAR * 8, NDC = 256;
// explosive barrels: 0 intact, 1 fuse lit (chain reaction), 2 wreck
const nBar = min(NBAR, barrels.length >> 1), bSt = new Uint8Array(NBAR), bT = new Float32Array(NBAR);
// bullet marks: ring buffer of (x y z radius) (nx ny nz birth time), drawn as projected decals
const dcl = new Float32Array(NDC * 8); let dcI = 0;
const instA = new Float32Array(MAXINST * IS), instP = new Float32Array(MAXINST * IS), stamp = new Int32Array(MAXINST).fill(-9);
instA[0] = instA[5] = instA[10] = 1; instA[15] = 1; instA[16] = instA[21] = instA[26] = 1; instA[32] = instA[33] = instA[34] = 1;
let frameNo = 0, T = 0, state = AUTO ? 1 : 0; // 0 menu 1 play 2 dead 3 win
// player
let px = startX * CS + 2, pz = startZ * CS + 2, yaw = 2.2, pitch = 0, pvx = 0, pvz = 0, hp = 100, bob = 0, bobA = 0;
let weapon = 0, cool = 0, reloadT = 0, reloadD = 1, spin = 0, barrel = 0, kick = 0, switchT = 0, flashT = 0, hitMark = 0, dmgFlash = 0, pickFlash = 0;
const mag = [8, 150], res = [32, 300], WMAG = [8, 150];
let kW = 0, kA = 0, kS = 0, kD = 0, kShift = 0, fire = 0, wantReload = 0, mdx = 0, mdy = 0;
const cP = new Float32Array(3), cR = new Float32Array(3), cU = new Float32Array(3), cF = new Float32Array(3);
// enemies
const eType = new Uint8Array(NEMAX), eState = new Uint8Array(NEMAX), eSee = new Uint8Array(NEMAX);
const eX = new Float32Array(NEMAX), eY = new Float32Array(NEMAX), eZ = new Float32Array(NEMAX), eYaw = new Float32Array(NEMAX), eHp = new Float32Array(NEMAX),
  eT = new Float32Array(NEMAX), eAtk = new Float32Array(NEMAX), ePh = new Float32Array(NEMAX), eFlash = new Float32Array(NEMAX), eVx = new Float32Array(NEMAX), eVz = new Float32Array(NEMAX), eSd = new Float32Array(NEMAX);
let nE = 0, alive = 0;
const ERAD = [.55, .6, .95], ESEP = [1.25, .8, 1.3], EKEEP = [2.45, 1.8, 2.7], EHP = [45, 80, 380], ESPD = [5.6, 2.8, 2.9];
// pickups, projectiles, particles, beams
const kX = new Float32Array(NPK), kZ = new Float32Array(NPK), kType = new Uint8Array(NPK), kOn = new Uint8Array(NPK); let nK = 0;
const jX = new Float32Array(NPJ), jY = new Float32Array(NPJ), jZ = new Float32Array(NPJ), jVx = new Float32Array(NPJ), jVy = new Float32Array(NPJ), jVz = new Float32Array(NPJ), jL = new Float32Array(NPJ);
const NPT = 640, pt = new Float32Array(NPT * 12); let ptI = 0; // x y z vx vy vz life maxlife size r g b
const NBM = 48, bm = new Float32Array(NBM * 12); let bmI = 0;   // x0 y0 z0 x1 y1 z1 life w r g b _
const MAXS = NPT + NBM + NPJ + 8 + NBAR, sprA = new Float32Array(MAXS * 12); let nS = 0;
const dynL = new Float32Array(64), blobA = new Float32Array(64); let nDyn = 0, nBlob = 0;
let impX = 0, impY = 0, impZ = 0, impT = 0, flashL = 0;

// difficulty: 0 easy, 1 medium (+50% health, bigger groups), 2 hard (+75% health, bigger groups still)
let DIFF = 0;
function setDiff(d) {
  DIFF = d; nE = 0;
  for (const [c, x, z] of spawns) {
    if (c === 'h' || c === 'a') continue;
    const ty = c === 'c' ? 0 : c === 's' ? 1 : 2, n = ty === 0 ? 3 + d : ty === 1 ? (d ? 2 : 1) : d > 1 ? 2 : 1, r = ty === 2 ? 1.5 : 1.75;
    for (let k = 0; k < n && nE < NEMAX; k++) {
      const an = k * 6.2832 / max(n, 3) + x;
      cX = x + (n > 1 ? cos(an) * r : 0); cZ = z + (n > 1 ? sin(an) * r : 0); if (d) collide(ERAD[ty] + .25);
      eType[nE] = ty; eX[nE] = cX; eZ[nE] = cZ; eY[nE] = ty === 1 ? 1.7 : 0; eState[nE] = eSee[nE] = 0; eT[nE] = eAtk[nE] = eFlash[nE] = 0;
      eHp[nE] = EHP[ty] * [1, 1.5, 1.75][d]; eYaw[nE] = rnd() * 6.28; ePh[nE] = rnd() * 6; eSd[nE] = rnd(); nE++;
    }
  }
  alive = nE;
}
for (const [c, x, z] of spawns) if (c === 'h' || c === 'a') { kX[nK] = x; kZ[nK] = z; kType[nK] = c === 'a' ? 1 : 0; kOn[nK++] = 1; }
{ let d = 0; if (!AUTO) try { d = +localStorage.hbd || 0; } catch (e) { } setDiff(max(0, min(2, qn('d', d) | 0))); }

// ---------- effects ----------
function spark(x, y, z, vx, vy, vz, life, size, r, g, b) {
  const o = ptI * 12; ptI = (ptI + 1) % NPT;
  pt[o] = x; pt[o + 1] = y; pt[o + 2] = z; pt[o + 3] = vx; pt[o + 4] = vy; pt[o + 5] = vz; pt[o + 6] = life; pt[o + 7] = life; pt[o + 8] = size; pt[o + 9] = r; pt[o + 10] = g; pt[o + 11] = b;
}
function burst(x, y, z, n, sp, life, size, r, g, b) { for (let i = 0; i < n; i++) spark(x, y, z, (rnd() - .5) * sp, (rnd() - .2) * sp, (rnd() - .5) * sp, life * (.5 + rnd() * .5), size, r, g, b); }
function beam(x0, y0, z0, x1, y1, z1, life, w, r, g, b) {
  const o = bmI * 12; bmI = (bmI + 1) % NBM;
  bm[o] = x0; bm[o + 1] = y0; bm[o + 2] = z0; bm[o + 3] = x1; bm[o + 4] = y1; bm[o + 5] = z1; bm[o + 6] = life; bm[o + 7] = w; bm[o + 8] = r; bm[o + 9] = g; bm[o + 10] = b; bm[o + 11] = life;
}

// ---------- audio: one AudioWorklet does everything (sample synthesis, voice mixing, reverb, music) ----------
// Triggers are AudioParam counters, so the game thread allocates nothing per sound.
// AWK is stringified into the worklet: it must not reference anything outside itself.
function AWK() {
  const M = Math, sr = sampleRate, PI = M.PI, NT = 14, NV = 32;
  let sd = 4242;
  const rn = () => { sd = (M.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 2147483648 - 1; };
  const buf = (d) => new Float32Array((d * sr) | 0);
  // noise burst through a swept state-variable filter (ty 0 low, 1 band, 2 high), exponential decay
  const nz = (a, t0, dur, amp, dec, f0, f1, q, ty) => {
    let c1 = 0, c2 = 0; const o = (t0 * sr) | 0, n = M.min((dur * sr) | 0, a.length - o), k = 1 / q;
    for (let i = 0; i < n; i++) {
      const t = i / sr, g = M.tan(PI * M.min(f1 + (f0 - f1) * M.exp(-t / dec), sr * .45) / sr), a1 = 1 / (1 + g * (g + k)), x = rn(),
        v3 = x - c2, v1 = a1 * c1 + g * a1 * v3, v2 = c2 + g * a1 * c1 + g * g * a1 * v3;
      c1 = 2 * v1 - c1; c2 = 2 * v2 - c2;
      a[o + i] += (ty ? ty > 1 ? x - k * v1 - v2 : v1 : v2) * amp * M.exp(-t / dec) * M.min(1, i / (sr * .0004)) * M.min(1, (n - i) / (sr * .003));
    }
  };
  // sine with exponential pitch drop and decay
  const tn = (a, t0, dur, amp, dec, f0, f1, fd) => {
    let p = 0; const o = (t0 * sr) | 0, n = M.min((dur * sr) | 0, a.length - o);
    for (let i = 0; i < n; i++) { const t = i / sr; p += 2 * PI * (f1 + (f0 - f1) * M.exp(-t / fd)) / sr; a[o + i] += M.sin(p) * amp * M.exp(-t / dec) * M.min(1, i / (sr * .0005)) * M.min(1, (n - i) / (sr * .003)); }
  };
  const sat = (a, d) => { for (let i = 0; i < a.length; i++) a[i] = M.tanh(a[i] * d); };
  // metal-on-metal click with a short ring
  const clk = (a, t, v, f) => {
    nz(a, t, .08, v, .011, 2300 * f, 1700 * f, 2.5, 1); nz(a, t, .03, v * .6, .004, 6000, 5000, 1, 2);
    tn(a, t, .12, v * .14, .028, 1380 * f, 1380 * f, 1); tn(a, t, .12, v * .1, .022, 2470 * f, 2470 * f, 1); tn(a, t, .1, v * .07, .016, 3950 * f, 3950 * f, 1);
    tn(a, t, .08, v * .5, .02, 240 * f, 150 * f, .02);
  };
  const S = []; let a;
  // 0 shotgun: crack + body + boom + thump, saturated, then the pump
  a = S[0] = buf(.75);
  nz(a, 0, .04, 1.2, .004, 3000, 2500, .8, 2); nz(a, 0, .5, 1.3, .06, 6000, 350, .8, 0); nz(a, 0, .6, 1.1, .15, 800, 110, 1, 0); tn(a, 0, .5, 1.2, .13, 150, 42, .05);
  sat(a, 2.6); nz(a, .02, .7, .1, .3, 1800, 300, .7, 0);
  nz(a, .3, .1, .1, .05, 1200, 3000, 2, 1); clk(a, .34, .5, .85); nz(a, .42, .1, .1, .05, 3000, 1200, 2, 1); clk(a, .47, .6, 1);
  // 1 minigun round: tighter and brighter
  a = S[1] = buf(.3);
  nz(a, 0, .03, 1.1, .003, 3500, 3000, .8, 2); nz(a, 0, .2, 1.3, .028, 5000, 500, .9, 0); nz(a, 0, .2, .7, .05, 1000, 200, 1, 0); tn(a, 0, .2, 1, .045, 190, 65, .02);
  sat(a, 2.2); nz(a, .01, .28, .07, .1, 1500, 400, .7, 0);
  // 2 shotgun reload (1.5 s): three shells, then rack
  a = S[2] = buf(1.5);
  for (let i = 0; i < 3; i++) { nz(a, .1 + i * .3, .1, .12, .04, 900, 2500, 2, 1); clk(a, .19 + i * .3, .4, .7 + i * .06); }
  nz(a, 1.1, .1, .12, .05, 1200, 3000, 2, 1); clk(a, 1.15, .55, .85); nz(a, 1.25, .1, .12, .05, 3000, 1200, 2, 1); clk(a, 1.31, .65, 1);
  // 3 minigun reload (2.2 s): drum off, belt feed, latch, charge
  a = S[3] = buf(2.2);
  clk(a, .08, .6, .55); tn(a, .08, .2, .5, .06, 170, 80, .04);
  for (let i = 0; i < 11; i++) clk(a, .55 + i * .075 + rn() * .01, .16 + rn() * .06, 1.2 + rn() * .2);
  clk(a, 1.55, .6, .6); tn(a, 1.55, .2, .5, .05, 190, 90, .04); nz(a, 1.9, .12, .12, .05, 1500, 3500, 2, 1); clk(a, 1.98, .6, .95);
  // 4 dry fire  5 flesh hit  6 alien death  7 player hurt
  a = S[4] = buf(.12); clk(a, 0, .35, 1.25);
  a = S[5] = buf(.2); nz(a, 0, .18, .9, .045, 1000, 180, 1.2, 0); nz(a, 0, .12, .5, .03, 2200, 500, 4, 1);
  a = S[6] = buf(.8);
  { let p = 0; for (let i = 0; i < a.length; i++) { const t = i / sr, f = 70 + 300 * M.exp(-t / .22) + 14 * M.sin(t * 190); p += 2 * PI * f / sr; a[i] = M.tanh(3 * M.sin(p + 2.2 * M.sin(p * .503))) * .45 * M.min(1, t / .01) * M.exp(-t / .25); } }
  nz(a, 0, .7, .6, .2, 1600, 250, 5, 1); nz(a, 0, .2, .7, .05, 900, 150, 1, 0);
  a = S[7] = buf(.4); tn(a, 0, .35, 1.2, .1, 130, 45, .05); nz(a, 0, .3, .8, .06, 700, 150, 1, 0); sat(a, 1.8);
  // 8 health  9 ammo  10 footstep  11 alien spit  12 weapon swap
  a = S[8] = buf(.7); for (let i = 0; i < 3; i++) { const f = [523.25, 659.25, 783.99][i]; tn(a, i * .07, .5, .28, .18, f, f, 1); tn(a, i * .07, .4, .08, .1, f * 2, f * 2, 1); }
  a = S[9] = buf(.5); clk(a, 0, .45, .9); clk(a, .09, .5, 1.15); tn(a, .09, .35, .12, .12, 1975, 1975, 1); tn(a, .09, .3, .08, .09, 2960, 2960, 1);
  a = S[10] = buf(.2); tn(a, 0, .15, .55, .035, 115, 55, .03); nz(a, 0, .12, .45, .03, 700, 180, 1, 0); nz(a, 0, .05, .1, .008, 2600, 2600, 3, 1); tn(a, 0, .15, .05, .04, 730, 730, 1);
  a = S[11] = buf(.4); nz(a, 0, .35, .7, .09, 500, 2600, 6, 1); nz(a, 0, .2, .3, .05, 3000, 800, 1, 0); tn(a, 0, .3, .3, .08, 600, 160, .08);
  a = S[12] = buf(.3); nz(a, 0, .12, .1, .05, 900, 2200, 2, 1); clk(a, .1, .4, .8);
  // 18 barrel explosion: crack, long low boom, rumble
  a = S[18] = buf(2.2);
  nz(a, 0, .05, 1.3, .006, 2500, 2000, .8, 2); nz(a, 0, 1.2, 1.5, .16, 5000, 150, .8, 0); nz(a, 0, 2, 1.3, .45, 500, 50, 1, 0); tn(a, 0, 1.6, 1.5, .4, 95, 28, .12);
  sat(a, 2.8); nz(a, .05, 2.1, .16, .7, 900, 120, .7, 0);
  // drum kit + bell for the music
  a = S[13] = buf(.45); tn(a, 0, .44, 1.3, .2, 230, 47, .032); nz(a, 0, .02, .5, .002, 4000, 3000, 1, 2); sat(a, 1.7);
  a = S[14] = buf(.4); tn(a, 0, .3, .9, .08, 270, 186, .02); nz(a, 0, .38, 1, .1, 2100, 1700, .7, 1); nz(a, 0, .38, .55, .13, 6000, 5000, .8, 2); sat(a, 1.5);
  a = S[15] = buf(.1); nz(a, 0, .1, .7, .017, 8500, 8000, 1, 2);
  a = S[16] = buf(.4); nz(a, 0, .4, .6, .11, 7500, 6500, 1.5, 2);
  a = S[17] = buf(1.4); { let p = 0; for (let i = 0; i < a.length; i++) { const t = i / sr; p += 2 * PI * 1046.5 / sr; a[i] = M.sin(p + 1.5 * M.exp(-t / .1) * M.sin(p * 2.76)) * .3 * M.exp(-t / .35) * M.min(1, t / .002); } }
  // per-trigger mix: gain, reverb send, pitch spread
  const TG = [.95, .62, .8, .8, .6, .5, .55, .7, .5, .7, .4, .45, .6, 1.15], TS = [.22, .16, .12, .12, .1, .1, .4, .1, .2, .15, .12, .4, .1, .45], TR = [.03, .07, 0, 0, .05, .2, .2, .1, 0, .04, .15, .2, .05, .08];
  const PN = []; for (let i = 0; i < NT; i++) PN.push('t' + i);
  const PD = PN.map(name => ({ name, defaultValue: 0, automationRate: 'k-rate' }));
  PD.push({ name: 'spin', defaultValue: 0, automationRate: 'k-rate' }, { name: 'mus', defaultValue: 1, automationRate: 'k-rate' });
  // voices
  const vB = new Int8Array(NV).fill(-1), vP = new Float64Array(NV), vR = new Float32Array(NV), vL = new Float32Array(NV), vRt = new Float32Array(NV), vS = new Float32Array(NV), last = new Float32Array(NT);
  let vn = 0;
  const play = (b, g, r, pan, s) => {
    let v = -1; for (let i = 0; i < NV; i++) { const j = (vn + i) % NV; if (vB[j] < 0) { v = j; break; } } if (v < 0) v = vn; vn = (v + 1) % NV;
    vB[v] = b; vP[v] = 0; vR[v] = r; vL[v] = g * M.min(1, 1 - pan); vRt[v] = g * M.min(1, 1 + pan); vS[v] = g * s;
  };
  // reverb: 4 damped combs into 2 all-passes per side
  const k = sr / 44100, CL = [1116, 1277, 1422, 1557].map(n => (n * k) | 0), cb = CL.map(n => new Float32Array(n)), ci = [0, 0, 0, 0], cf = [0, 0, 0, 0];
  const AL = [556, 441, 579, 464].map(n => (n * k) | 0), ab = AL.map(n => new Float32Array(n)), ai = [0, 0, 0, 0];
  const ap = (j, x) => { const b = ab[j], i = ai[j], y = b[i] - x * .5; b[i] = x + y * .5; ai[j] = (i + 1) % AL[j]; return y; };
  // music state: 174 bpm, 16 steps per bar, 32-bar loop in F minor
  const sps = sr * 60 / 174 / 4, F1 = 43.654, ST = (n) => 2 ** (n / 12);
  const BN = [0, 0, 0, 3, 0, 0, -2, -4], PC = [[0, 3, 7, 14], [-4, 0, 3, 7]];
  let mc = sps, step = -1, bar = -1, bf = F1, bft = F1, bg = 0, bgt = 0, duck = 0, lfoR = 1, mt = 0, b1 = 0, b2 = 0, pl = 0, pr = 0, sm = 0, mp = 0, mvol = 0;
  const bp = new Float64Array(4), pp = new Float64Array(16), pf = new Float64Array(16);
  const chord = (c) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) pf[i * 4 + j] = F1 * 4 * ST(PC[c][i]) * (1 + (j - 1.5) * .0035) / sr; };
  chord(0);
  const tick = () => {
    step = (step + 1) & 15; if (!step) { bar = (bar + 1) & 31; chord((bar >> 3) & 1); }
    const s = step, br = bar, full = br > 3, fill = (br & 7) === 7, h = br & 1;
    if (full) {
      if (s === 0 || s === 10 || (h && s === 3) || (fill && s === 6)) { play(13, .62, 1, 0, .03); duck = 1; }
      if (s === 4 || s === 12 || (fill && s > 12)) play(14, fill && s > 12 ? .3 + (s - 12) * .06 : .5, 1, .05, .25);
      else if (s === 7 || s === 9 || (h && s === 15)) play(14, .12, 1.08, -.1, .3);
      play(s === 14 && h ? 16 : 15, s & 1 ? .07 : s & 2 ? .2 : .13, 1 + rn() * .03, .25, .1);
    } else {
      if (!(s & 3)) play(15, .1, 1, .25, .3);
      if (br === 3 && s > 7) play(14, .08 + (s - 8) * .04, 1, 0, .3);
      if (br === 0 && s === 0) { play(13, .6, 1, 0, .2); duck = 1; }
    }
    // bass line: held root with an octave stab late in odd bars
    bft = F1 * 2 * ST(BN[br & 7]) * (h && (s === 11 || s === 12) ? 2 : 1);
    bgt = full ? (s === 5 || s === 9 || (h && s === 13) ? .25 : 1) : .45;
    if (!s) lfoR = [.5, 1, .75, 2, .5, 1.5, 1, 3][br & 7];
    // bell motif
    if ((br & 3) === 2) { if (s === 0) play(17, .16, 1, -.4, .7); if (s === 6) play(17, .13, ST(-4), .4, .7); if (s === 12) play(17, .13, ST(-5), 0, .7); }
    if ((br & 7) === 5 && s === 8) play(17, .1, ST(3), .5, .8);
  };
  registerProcessor('a', class extends AudioWorkletProcessor {
    static get parameterDescriptors() { return PD; }
    process(_, out, par) {
      const L = out[0][0], R = out[0][1] || L, n = L.length, spin = par.spin[0], mus = par.mus[0];
      for (let i = 0; i < NT; i++) { const v = par[PN[i]][0]; if (v !== last[i]) { last[i] = v; play(i > 12 ? 18 : i, TG[i] * (1 + rn() * .08), 1 + rn() * TR[i], i === 10 ? rn() * .3 : 0, TS[i]); } }
      for (let i = 0; i < n; i++) {
        let l = 0, r = 0, s = 0;
        // ---- music ----
        if (++mc >= sps) { mc -= sps; tick(); }
        mt += 1 / sr; duck *= 1 - 9 / sr; bf += (bft - bf) * .004; bg += (bgt - bg) * .002; mvol += (mus * .6 - mvol) * .0005;
        const dk = 1 - .75 * duck;
        // reese: three detuned saws -> resonant low-pass -> drive, plus a sub sine
        let x = 0; for (let j = 0; j < 3; j++) { let p = bp[j] + bf * (1 + (j - 1) * .011) / sr; p -= p | 0; bp[j] = p; x += p * 2 - 1; }
        let p = bp[3] + bf * .5 / sr; p -= p | 0; bp[3] = p;
        const lf = .5 + .5 * M.sin(mt * 2 * PI * 174 / 60 * lfoR * .5), g = M.tan(PI * (130 + 900 * lf * lf) / sr), a1 = 1 / (1 + g * (g + .45)), v3 = x * .33 - b2, v1 = a1 * b1 + g * a1 * v3, v2 = b2 + g * a1 * b1 + g * g * a1 * v3;
        b1 = 2 * v1 - b1; b2 = 2 * v2 - b2;
        const bass = (M.tanh(v2 * 2.5) * .2 + M.sin(p * 2 * PI) * .3) * bg * dk;
        // pad: 16 saws, one-pole low-pass per side
        let xl = 0, xr = 0; for (let j = 0; j < 16; j++) { let q = pp[j] + pf[j]; q -= q | 0; pp[j] = q; if (j & 1) xr += q - .5; else xl += q - .5; }
        const pk = .035 + .03 * M.sin(mt * .35); pl += (xl - pl) * pk; pr += (xr - pr) * pk;
        l += (bass + pl * .13 * dk) * mvol; r += (bass + pr * .13 * dk) * mvol; s += (pl + pr) * .03 * mvol;
        // ---- sample voices ----
        for (let v = 0; v < NV; v++) {
          const b = vB[v]; if (b < 0) continue;
          const A = S[b], q = vP[v], qi = q | 0; if (qi >= A.length - 1) { vB[v] = -1; continue; }
          const y = (A[qi] + (A[qi + 1] - A[qi]) * (q - qi)) * (b > 12 && b < 18 ? mvol : 1); vP[v] = q + vR[v];
          l += y * vL[v]; r += y * vRt[v]; s += y * vS[v];
        }
        // ---- minigun motor ----
        sm += (spin - sm) * .001;
        if (sm > .002) { mp += (45 + 230 * sm) / sr; mp -= mp | 0; const w = mp * 2 * PI, y = (M.sin(w) * .5 + M.sin(w * 2 + M.sin(w * 6) * 1.2) * .35 + M.sin(w * 6) * .25 + M.sin(w * 13.02) * .08) * sm * sm * .1; l += y; r += y; s += y * .2; }
        // ---- reverb ----
        let wl = 0, wr = 0;
        for (let j = 0; j < 4; j++) { const b = cb[j], ix = ci[j], y = b[ix]; cf[j] = y * .75 + cf[j] * .25; b[ix] = s + cf[j] * .8; ci[j] = (ix + 1) % CL[j]; wl += y; wr += j & 1 ? -y : y; }
        l += ap(1, ap(0, wl)) * .28; r += ap(3, ap(2, wr)) * .28;
        L[i] = M.tanh(l * .9); if (R !== L) R[i] = M.tanh(r * .9);
      }
      return true;
    }
  });
}
let AC = null, AW = null, musOn = 1;
const sP = [], sN = new Float32Array(16);
function initAudio() {
  if (AC) return;
  try {
    AC = new AudioContext({ latencyHint: 'interactive' });
    AC.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(`(${AWK})()`)).then(() => {
      const w = new AudioWorkletNode(AC, 'a', { numberOfInputs: 0, outputChannelCount: [2] });
      for (let i = 0; i < 14; i++) sP[i] = w.parameters.get('t' + i);
      sP[14] = w.parameters.get('spin'); sP[15] = w.parameters.get('mus'); sP[15].value = musOn;
      w.connect(AC.destination); AW = w;
    }, (e) => console.warn('audio', e));
  } catch (e) { AC = null; }
}
// 0 shotgun 1 minigun 2 reload shotgun 3 reload minigun 4 dry 5 hit 6 kill 7 hurt 8 health 9 ammo 10 step 11 spit 12 swap 13 explosion
function snd(i) { if (AW) sP[i].value = ++sN[i]; }

// ---------- ray casting ----------
let hitNx = 0, hitNz = 0, hitNy = 0;
function castWorld(ox, oy, oz, dx, dy, dz, maxT) {
  const hl = hypot(dx, dz); let t = 0;
  for (let i = 0; i < 128; i++) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y <= 0) { hitNx = 0; hitNy = 1; hitNz = 0; return dy < 0 ? -oy / dy : t; }
    const cxi = floor(x / CS), czi = floor(z / CS), H = cxi < 0 || czi < 0 || cxi >= MW || czi >= MH ? 0 : cellH[czi * MW + cxi];
    const d = sdfAt(sdS, x, z);
    if (d < .03 || (H > 0 && y >= H)) {
      if (H > 0 && y >= H && d >= .03) { hitNx = 0; hitNy = -1; hitNz = 0; }
      else { const gx = sdfAt(sdS, x + .1, z) - sdfAt(sdS, x - .1, z), gz = sdfAt(sdS, x, z + .1) - sdfAt(sdS, x, z - .1), l = hypot(gx, gz) || 1; hitNx = gx / l; hitNy = 0; hitNz = gz / l; }
      return t;
    }
    let st = hl > .02 ? d / hl : 1e3;
    if (dy > 1e-4) st = min(st, (H - y) / dy + .01); else if (dy < -1e-4) st = min(st, -y / dy + .01);
    t += max(st, .03); if (t > maxT) return maxT;
  }
  return t;
}
function raySph(ox, oy, oz, dx, dy, dz, sx, sy, sz, r) {
  const mx = ox - sx, my = oy - sy, mz = oz - sz, b = mx * dx + my * dy + mz * dz, c = mx * mx + my * my + mz * mz - r * r, h = b * b - c;
  if (h < 0) return -1; const t = -b - sqrt(h); return t > 0 ? t : -1;
}
function hurt(i, d) {
  if (eState[i] >= 2) return;
  eHp[i] -= d; eFlash[i] = 1; snd(5); if (eState[i] === 0) eState[i] = 1; hitMark = 1;
  if (eHp[i] <= 0) {
    eState[i] = 2; eT[i] = 0; alive--; { const kx = eX[i] - px, kz = eZ[i] - pz, kl = hypot(kx, kz) || 1, ks = [4.5, 2.5, 1.2][eType[i]]; eKx[i] = kx / kl * ks; eKz[i] = kz / kl * ks; }
    const ty = eType[i]; burst(eX[i], eY[i] + (ty === 2 ? 1.4 : .6), eZ[i], ty === 2 ? 40 : 22, ty === 2 ? 7 : 5, .9, ty === 2 ? .1 : .07, ty === 1 ? .3 : .5, 1, ty === 1 ? 1 : .2);
    snd(6);
    if (alive === 0 && !AUTO) setState(3);
  }
}
function explode(k) {
  if (bSt[k] > 1) return; bSt[k] = 2; bT[k] = 0;
  const x = barrels[k * 2], z = barrels[k * 2 + 1];
  snd(13); burst(x, .8, z, 70, 17, 1.1, .09, 1, .55, .15); burst(x, .6, z, 30, 7, 1.7, .13, .3, .25, .2); kick = 1;
  for (let i = 0; i < nE; i++) if (eState[i] < 2) { const d = hypot(eX[i] - x, eZ[i] - z); if (d < 7 && los(x, z, eX[i], eZ[i])) hurt(i, 320 * (1 - d / 7) + 20); }
  for (let j = 0; j < nBar; j++) if (!bSt[j] && hypot(barrels[j * 2] - x, barrels[j * 2 + 1] - z) < 5.5) { bSt[j] = 1; bT[j] = .12 + rnd() * .18; }
  const pd = hypot(px - x, pz - z); if (pd < 7 && los(x, z, px, pz)) damage(95 * (1 - pd / 7));
  { const o = dcI * 8; dcI = (dcI + 1) % NDC; dcl[o] = x; dcl[o + 1] = 0; dcl[o + 2] = z; dcl[o + 3] = 1.7 + rnd() * .5; dcl[o + 4] = 0; dcl[o + 5] = 1; dcl[o + 6] = 0; dcl[o + 7] = T; }
  alert(34);
}
function fireRay(spread, dmg, mx, my, mz) {
  const sx = (rnd() + rnd() - 1) * spread, sy = (rnd() + rnd() - 1) * spread;
  let dx = cF[0] + cR[0] * sx + cU[0] * sy, dy = cF[1] + cR[1] * sx + cU[1] * sy, dz = cF[2] + cR[2] * sx + cU[2] * sy; const l = hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  let t = castWorld(cP[0], cP[1], cP[2], dx, dy, dz, 90), he = -1;
  for (let i = 0; i < nE; i++) {
    if (eState[i] >= 2) continue;
    const ty = eType[i]; let t2 = ty === 0 ? raySph(cP[0], cP[1], cP[2], dx, dy, dz, eX[i], .45, eZ[i], .7) : ty === 1 ? raySph(cP[0], cP[1], cP[2], dx, dy, dz, eX[i], eY[i], eZ[i], .65) : raySph(cP[0], cP[1], cP[2], dx, dy, dz, eX[i], 1.05, eZ[i], .9);
    if (ty === 2) { const t3 = raySph(cP[0], cP[1], cP[2], dx, dy, dz, eX[i], 2.05, eZ[i], .7); if (t3 > 0 && (t2 < 0 || t3 < t2)) t2 = t3; }
    if (t2 > 0 && t2 < t) { t = t2; he = i; }
  }
  let hb = -1;
  for (let k = 0; k < nBar; k++) if (!bSt[k]) { const t2 = raySph(cP[0], cP[1], cP[2], dx, dy, dz, barrels[k * 2], .62, barrels[k * 2 + 1], .6); if (t2 > 0 && t2 < t) { t = t2; hb = k; he = -1; } }
  const hx = cP[0] + dx * t, hy = cP[1] + dy * t, hz = cP[2] + dz * t;
  beam(mx, my, mz, hx, hy, hz, .05, .009, 1, .8, .45);
  if (hb >= 0) explode(hb);
  else if (he >= 0) { hurt(he, dmg); const ty = eType[he]; burst(hx, hy, hz, 3, 3, .35, .045, ty === 1 ? .3 : .5, 1, ty === 1 ? 1 : .2); }
  else {
    for (let k = 0; k < 4; k++) spark(hx, hy, hz, hitNx * 2 + (rnd() - .5) * 5, hitNy * 2 + rnd() * 3, hitNz * 2 + (rnd() - .5) * 5, .25 + rnd() * .3, .022, 1, .7, .3);
    { const o = dcI * 8, d = hitNy ? 0 : sdfAt(sdS, hx, hz); dcI = (dcI + 1) % NDC; dcl[o] = hx - hitNx * d; dcl[o + 1] = hy; dcl[o + 2] = hz - hitNz * d; dcl[o + 3] = .075 + rnd() * .04; dcl[o + 4] = hitNx; dcl[o + 5] = hitNy; dcl[o + 6] = hitNz; dcl[o + 7] = T; }
    impX = hx + hitNx * .15; impY = hy + hitNy * .15; impZ = hz + hitNz * .15; impT = .07;
  }
}

// ---------- simulation ----------
function simPlayer(dt) {
  yaw += mdx * .0022; pitch = max(-1.45, min(1.45, pitch - mdy * .0022)); mdx = mdy = 0;
  let f = kW - kS, s = kD - kA; const l = hypot(f, s) || 1; f /= l; s /= l;
  const sp = kShift ? 9.5 : 5.6, sy = sin(yaw), cy = cos(yaw), tvx = (sy * f + cy * s) * sp, tvz = (-cy * f + sy * s) * sp, a = min(1, dt * 11);
  pvx += (tvx - pvx) * a; pvz += (tvz - pvz) * a;
  cX = px + pvx * dt; cZ = pz + pvz * dt; collide(.45); px = cX; pz = cZ;
  const v = hypot(pvx, pvz), b0 = floor(bob / PI); bob += v * dt * 1.25; if (v > 1.5 && floor(bob / PI) !== b0) snd(10); bobA += ((v > .5 ? 1 : 0) - bobA) * min(1, dt * 8);
}
function simWeapon(dt) {
  cool -= dt; flashT -= dt; kick -= kick * min(1, dt * 9);
  if (switchT > 0) switchT -= dt;
  const w = weapon;
  if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { const n = min(WMAG[w] - mag[w], res[w]); mag[w] += n; res[w] -= n; } }
  else if (wantReload && mag[w] < WMAG[w] && res[w] > 0) { reloadD = reloadT = w ? 2.2 : 1.5; snd(2 + w); }
  wantReload = 0;
  const sT = fire && w === 1 && reloadT <= 0 && mag[1] > 0 ? 1 : 0; spin += (sT - spin) * min(1, dt * (sT ? 7 : 2.5)); barrel += spin * dt * 26;
  if (fire && reloadT <= 0 && switchT <= 0 && cool <= 0 && state === 1) {
    if (mag[w] > 0) {
      const mx = cP[0] + cR[0] * .16 - cU[0] * .12 + cF[0] * .7, my = cP[1] + cR[1] * .16 - cU[1] * .12 + cF[1] * .7, mz = cP[2] + cR[2] * .16 - cU[2] * .12 + cF[2] * .7;
      if (w === 0) { for (let k = 0; k < 10; k++) fireRay(.075, 14, mx, my, mz); cool = .8; kick = 1; mag[0]--; flashT = .06; snd(0); alert(26); }
      else if (spin > .85) { fireRay(.024, 16, mx, my, mz); cool += 1 / 18; if (cool < 0) cool = 0; kick = min(1, kick + .3); mag[1]--; flashT = .035; snd(1); alert(22); }
    } else if (res[w] > 0) { reloadD = reloadT = w ? 2.2 : 1.5; snd(2 + w); } else { cool = .3; snd(4); }
  }
  if (cool < -1) cool = -1;
}
function alert(r) { for (let i = 0; i < nE; i++) if (eState[i] === 0 && hypot(eX[i] - px, eZ[i] - pz) < r) eState[i] = 1; }
function damage(d) { if (AUTO || state !== 1) return; hp -= d; dmgFlash = 1; snd(7); if (hp <= 0) { hp = 0; setState(2); } }
let lastCell = -1;
function simEnemies(dt) {
  const pc = floor(pz / CS) * MW + floor(px / CS);
  if (pc !== lastCell && !blocked[pc]) { lastCell = pc; bfs(pc % MW, (pc / MW) | 0); }
  for (let i = 0; i < nE; i++) {
    const st = eState[i]; if (st === 3) continue;
    const ty = eType[i]; eFlash[i] -= eFlash[i] * min(1, dt * 10);
    if (st === 2) {
      const D = EDT[ty], k0 = eT[i] / D; eT[i] += dt; const k = eT[i] / D, sl = max(0, 1 - k * 1.6) * dt;
      cX = eX[i] + eKx[i] * sl; cZ = eZ[i] + eKz[i] * sl; collide(ERAD[ty]); eX[i] = cX; eZ[i] = cZ;
      if (ty === 1 && k0 < .5 && k >= .5) burst(eX[i], .2, eZ[i], 18, 5, .7, .06, .3, 1, 1);
      if (ty === 2 && k0 < .85 && k >= .85) burst(eX[i], .2, eZ[i], 14, 4, .5, .05, .5, .5, .45);
      if (k >= 1) { eT[i] = D; eState[i] = 3; }
      continue;
    }
    const dx = px - eX[i], dz = pz - eZ[i], dist = hypot(dx, dz) || 1e-3;
    if (((i + frameNo) & 7) === 0) eSee[i] = dist < 40 ? los(eX[i], eZ[i], px, pz) : 0;
    ePh[i] += dt * (st ? 1 : .25);
    if (st === 0) { const md0 = EKEEP[ty]; if (dist < md0) { eX[i] = px - dx / dist * md0; eZ[i] = pz - dz / dist * md0; } if (eSee[i] && dist < 26 && POSE < 0) eState[i] = 1; if (ty === 1) eY[i] = 1.7 + sin(ePh[i] * 3) * .15; continue; }
    // steering
    let tx = dx / dist, tz = dz / dist;
    if (!eSee[i]) {
      const cx = floor(eX[i] / CS), cz = floor(eZ[i] / CS), c = cz * MW + cx; let b = flow[c] < 0 ? 9999 : flow[c], bx = cx, bz = cz;
      if (flow[c - 1] >= 0 && flow[c - 1] < b) { b = flow[c - 1]; bx = cx - 1; bz = cz; }
      if (flow[c + 1] >= 0 && flow[c + 1] < b) { b = flow[c + 1]; bx = cx + 1; bz = cz; }
      if (flow[c - MW] >= 0 && flow[c - MW] < b) { b = flow[c - MW]; bx = cx; bz = cz - 1; }
      if (flow[c + MW] >= 0 && flow[c + MW] < b) { b = flow[c + MW]; bx = cx; bz = cz + 1; }
      const gx = bx * CS + 2 - eX[i], gz = bz * CS + 2 - eZ[i], gl = hypot(gx, gz) || 1; tx = gx / gl; tz = gz / gl;
    }
    let sp = ESPD[ty];
    eAtk[i] -= dt;
    if (ty === 0) { if (dist < 2.7) { sp = 0; if (eAtk[i] <= 0) { damage(5); eAtk[i] = .7; } } }
    else if (ty === 1) {
      eY[i] = 1.7 + sin(ePh[i] * 3) * .15;
      if (eSee[i]) {
        const sd = sin(ePh[i] * .7 + eSd[i] * 6) > 0 ? 1 : -1, back = dist < 7 ? -1 : dist > 12 ? 1 : 0, ox = tx, oz = tz;
        tx = ox * back - oz * sd * .8; tz = oz * back + ox * sd * .8;
        if (eAtk[i] <= 0 && dist < 34) {
          eAtk[i] = 1.5 + eSd[i];
          for (let k = 0; k < NPJ; k++) if (jL[k] <= 0) {
            const vy = (EYE - .25 - eY[i]) / dist, l = hypot(dx / dist, vy, dz / dist);
            jX[k] = eX[i] + dx / dist * .6; jY[k] = eY[i]; jZ[k] = eZ[i] + dz / dist * .6; jVx[k] = dx / dist / l * 15; jVy[k] = vy / l * 15; jVz[k] = dz / dist / l * 15; jL[k] = 4; if (dist < 30) snd(11); break;
          }
        }
      }
    } else {
      if (eT[i] > 0) { sp = 0; eT[i] -= dt; if (eT[i] <= 0 && dist < 3.9) damage(22); }
      else if (dist < 3.3 && eAtk[i] <= 0) { eT[i] = .45; eAtk[i] = 1.5; }
    }
    const a = min(1, dt * 6); eVx[i] += (tx * sp - eVx[i]) * a; eVz[i] += (tz * sp - eVz[i]) * a;
    // separation
    for (let j = 0; j < nE; j++) if (j !== i && eState[j] < 2) { const sx = eX[i] - eX[j], sz = eZ[i] - eZ[j], sl = sx * sx + sz * sz, rr = ESEP[ty] + ESEP[eType[j]]; if (sl < rr * rr && sl > 1e-4) { const q = sqrt(sl), p = (rr - q) / q * 4 * dt; eX[i] += sx * p; eZ[i] += sz * p; } }
    cX = eX[i] + eVx[i] * dt; cZ = eZ[i] + eVz[i] * dt;
    { const qx = cX - px, qz = cZ - pz, ql = hypot(qx, qz) || 1e-3, md = EKEEP[ty]; if (ql < md) { cX = px + qx / ql * md; cZ = pz + qz / ql * md; } }
    collide(ERAD[ty]); eX[i] = cX; eZ[i] = cZ;
    ePh[i] += hypot(eVx[i], eVz[i]) * dt * (ty === 0 ? 2.2 : .9);
    let da = atan2(eSee[i] || ty === 1 ? dx : eVx[i], eSee[i] || ty === 1 ? dz : eVz[i]) - eYaw[i]; da -= floor(da / (2 * PI) + .5) * 2 * PI; eYaw[i] += da * min(1, dt * 7);
  }
}
function simStuff(dt) {
  for (let k = 0; k < nBar; k++) { if (bSt[k] === 1) { bT[k] -= dt; if (bT[k] <= 0) explode(k); } else if (bSt[k] === 2) bT[k] += dt; }
  for (let k = 0; k < NPJ; k++) if (jL[k] > 0) {
    jL[k] -= dt; jX[k] += jVx[k] * dt; jY[k] += jVy[k] * dt; jZ[k] += jVz[k] * dt;
    const hitP = hypot(jX[k] - px, jY[k] - (EYE - .4), jZ[k] - pz) < .7;
    if (hitP || jY[k] < .1 || sdfAt(sdS, jX[k], jZ[k]) < .12 || jL[k] <= 0) { jL[k] = 0; burst(jX[k], jY[k], jZ[k], 10, 4, .4, .05, .3, 1, 1); if (hitP) damage(11); }
  }
  for (let o = 0; o < NPT * 12; o += 12) if (pt[o + 6] > 0) {
    pt[o + 6] -= dt; pt[o + 4] -= 9 * dt; pt[o] += pt[o + 3] * dt; pt[o + 1] += pt[o + 4] * dt; pt[o + 2] += pt[o + 5] * dt;
    if (pt[o + 1] < .03) { pt[o + 1] = .03; pt[o + 4] *= -.35; pt[o + 3] *= .6; pt[o + 5] *= .6; }
  }
  for (let o = 0; o < NBM * 12; o += 12) if (bm[o + 6] > 0) bm[o + 6] -= dt;
  for (let k = 0; k < nK; k++) if (kOn[k] && hypot(kX[k] - px, kZ[k] - pz) < 1.3 && state === 1 && !AUTO) {
    if (kType[k]) { res[0] = min(64, res[0] + 12); res[1] = min(600, res[1] + 150); } else { if (hp >= 100) continue; hp = min(100, hp + 40); }
    kOn[k] = 0; pickFlash = 1; snd(kType[k] ? 9 : 8);
  }
  flashL += ((flashT > 0 ? 1 : 0) - flashL) * min(1, dt * (flashT > 0 ? 40 : 14));
  impT -= dt; hitMark -= hitMark * min(1, dt * 7); dmgFlash -= dmgFlash * min(1, dt * 2.5); pickFlash -= pickFlash * min(1, dt * 4);
}

// ---------- instance emission ----------
const E = new Float32Array(12), ES = new Float32Array(48); let ic = 0, esp = 0;
let sShape = 1, sTaper = 1, sMat = 14, sEm = 1, sR = 1, sG = 1, sB = 1, sFl = 0, gR = 0, gG = 0, gB = 0;
const eSet = (x, y, z, a, s) => { const sn = sin(a) * s, c = cos(a) * s; E[0] = c; E[1] = 0; E[2] = -sn; E[3] = 0; E[4] = s; E[5] = 0; E[6] = sn; E[7] = 0; E[8] = c; E[9] = x; E[10] = y; E[11] = z; };
const eMove = (x, y, z) => { E[9] += E[0] * x + E[3] * y + E[6] * z; E[10] += E[1] * x + E[4] * y + E[7] * z; E[11] += E[2] * x + E[5] * y + E[8] * z; };
const eRotX = (a) => { const s = sin(a), c = cos(a); for (let k = 0; k < 3; k++) { const y = E[3 + k], z = E[6 + k]; E[3 + k] = c * y + s * z; E[6 + k] = c * z - s * y; } };
const eRotZ = (a) => { const s = sin(a), c = cos(a); for (let k = 0; k < 3; k++) { const x = E[k], y = E[3 + k]; E[k] = c * x + s * y; E[3 + k] = c * y - s * x; } };
const eRotY = (a) => { const s = sin(a), c = cos(a); for (let k = 0; k < 3; k++) { const x = E[k], z = E[6 + k]; E[k] = c * x - s * z; E[6 + k] = s * x + c * z; } };
const ePush = () => { for (let k = 0; k < 12; k++) ES[esp + k] = E[k]; esp += 12; }, ePop = () => { esp -= 12; for (let k = 0; k < 12; k++) E[k] = ES[esp + k]; };
function put(x0, x1, x2, y0, y1, y2, z0, z1, z2, t0, t1, t2) {
  const o = ic * IS, a = instA;
  a[o] = E[0] * x0 + E[3] * x1 + E[6] * x2; a[o + 1] = E[1] * x0 + E[4] * x1 + E[7] * x2; a[o + 2] = E[2] * x0 + E[5] * x1 + E[8] * x2; a[o + 3] = sShape;
  a[o + 4] = E[0] * y0 + E[3] * y1 + E[6] * y2; a[o + 5] = E[1] * y0 + E[4] * y1 + E[7] * y2; a[o + 6] = E[2] * y0 + E[5] * y1 + E[8] * y2; a[o + 7] = sTaper;
  a[o + 8] = E[0] * z0 + E[3] * z1 + E[6] * z2; a[o + 9] = E[1] * z0 + E[4] * z1 + E[7] * z2; a[o + 10] = E[2] * z0 + E[5] * z1 + E[8] * z2; a[o + 11] = sMat;
  a[o + 12] = E[0] * t0 + E[3] * t1 + E[6] * t2 + E[9]; a[o + 13] = E[1] * t0 + E[4] * t1 + E[7] * t2 + E[10]; a[o + 14] = E[2] * t0 + E[5] * t1 + E[8] * t2 + E[11]; a[o + 15] = sEm;
  const src = stamp[ic] === frameNo - 1 ? instP : a;
  for (let k = 0; k < 16; k += 4) { a[o + 16 + k] = src[o + k]; a[o + 17 + k] = src[o + k + 1]; a[o + 18 + k] = src[o + k + 2]; }
  a[o + 19] = gR; a[o + 23] = gG; a[o + 27] = gB; a[o + 31] = 0;
  a[o + 32] = sR; a[o + 33] = sG; a[o + 34] = sB; a[o + 35] = sFl;
  stamp[ic] = frameNo; ic++;
}
const prim = (shape, x, y, z, sx, sy, sz, taper = 1) => { sShape = shape; sTaper = taper; put(sx, 0, 0, 0, sy, 0, 0, 0, sz, x, y, z); };
function seg(ax, ay, az, bx, by, bz, r, taper = 1, shape = 3) {
  const hx = (bx - ax) * .5, hy = (by - ay) * .5, hz = (bz - az) * .5, l = hypot(hx, hy, hz) || 1e-6, ux = hx / l, uy = hy / l, uz = hz / l;
  let qx, qy, qz; if (abs(uy) < .9) { qx = -uz; qy = 0; qz = ux; } else { qx = 0; qy = uz; qz = -uy; }
  const ql = hypot(qx, qy, qz); qx /= ql; qy /= ql; qz /= ql;
  const wx = qy * uz - qz * uy, wy = qz * ux - qx * uz, wz = qx * uy - qy * ux;
  sShape = shape; sTaper = taper; put(qx * r, qy * r, qz * r, hx, hy, hz, wx * r, wy * r, wz * r, (ax + bx) * .5, (ay + by) * .5, (az + bz) * .5);
}
const sty = (mat, em, r, g, b) => { sMat = mat; sEm = em; sR = r; sG = g; sB = b; };

const EDT = [.9, 1.1, 1.5], eKx = new Float32Array(NEMAX), eKz = new Float32Array(NEMAX), sm = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
function drawEnemy(i) {
  const ty = eType[i], st = eState[i], ph = ePh[i]; ic = EB + i * PARTS;
  // dk: death progress 0..1 (1 = corpse at rest)
  const dk = st >= 2 ? min(1, eT[i] / EDT[ty]) : 0, fl = st < 3 && eFlash[i] > .05 ? eFlash[i] : 0, ag = st === 1 ? 1 : st ? .45 - dk * .33 : .45, eg = st === 1 ? 1 : .45 * (1 - dk), gf = 1 - dk * .85; sFl = fl;
  if (ty === 0) {
    // crawler: segmented insectoid
    // death: hop, roll onto the back, legs twitch and curl
    const c = sm((dk - .4) / .6), tw = st === 2 ? sin(eT[i] * 45) * .5 * dk * (1 - dk) : 0;
    eSet(eX[i], sin(min(1, dk / .6) * PI) * .45 - c * .05, eZ[i], eYaw[i], 1); gR = 1; gG = .42; gB = .08; gR *= gf; gG *= gf; gB *= gf;
    if (dk > 0) { eMove(0, .5, 0); eRotZ(sm(dk / .6) * PI * (i & 1 ? 1 : -1)); eMove(0, -.5, 0); }
    const bb = sin(ph * 2) * .03;
    sty(14, 1.6 * ag, .1, .14, .13);
    prim(2, 0, .46 + bb, 0, .3, .19, .4); prim(2, 0, .43 + bb, .48, .2, .15, .23);
    sty(14, 1.2 * ag, .07, .1, .1);
    prim(2, 0, .58 + bb, -.44, .36, .29, .33); prim(2, 0, .6 + bb, -.76, .27, .2, .25); prim(2, 0, .55 + bb, -1.0, .16, .13, .2);
    seg(0, .62 + bb, -1.1, 0, .82 + bb, -1.42, .07, .05, 2);
    for (let k = 0; k < 3; k++) seg(0, .6 + bb, .12 - k * .3, 0, .9 + bb - k * .04, .0 - k * .34, .055, .05, 2);
    for (let sd = -1; sd <= 1; sd += 2) { seg(sd * .1, .38 + bb, .62, sd * .22, .33 + bb, .84, .05, .7); seg(sd * .22, .33 + bb, .84, sd * .05, .28 + bb, 1.02, .035, .05, 2); }
    sty(14, 1.6 * ag, .1, .14, .13);
    for (let k = 0; k < 6; k++) {
      const sd = k < 3 ? 1 : -1, j = k % 3, p = ph + (j + (k < 3 ? 0 : 1)) * PI, sw = sin(p) * .2 * (1 - c) + (k & 1 ? tw : -tw), lf = max(0, cos(p)) * .16 * (1 - c), z = .3 - j * .3;
      const kx = sd * (.74 - .19 * c), ky = .82 + lf - .77 * c, kz = z + sw * .6;
      prim(2, sd * .27, .45 + bb, z, .09, .08, .09); seg(sd * .27, .45 + bb, z, kx, ky, kz, .075, .45);
      prim(2, kx, ky, kz, .05, .05, .05); seg(kx, ky, kz, sd * (1.02 - .82 * c), lf + .3 * c, z * (1 - .2 * c) + sw, .05, .05, 2); seg(kx, ky, kz, kx + sd * .16, ky + .2, kz, .03, .05, 2);
    }
    sty(6, 9 * eg, 1, .45, .08); sFl = 0;
    prim(2, .09, .5 + bb, .69, .035, .035, .035); prim(2, -.09, .5 + bb, .69, .035, .035, .035); prim(2, .16, .47 + bb, .6, .025, .025, .025); prim(2, -.16, .47 + bb, .6, .025, .025, .025);
  } else if (ty === 1) {
    // spitter: floating hooded polyp
    // death: loses lift, drops, bell deflates and the tentacles splay on the floor
    const fa = min(1, dk / .5), q = sm((dk - .42) / .4);
    eSet(eX[i], eY[i] + (.27 - eY[i]) * fa * fa, eZ[i], eYaw[i] + dk * 1.2, 1); gR = .15; gG = .85; gB = 1; gR *= gf; gG *= gf; gB *= gf;
    if (dk > 0) { eRotX(.5 * sm(fa) * (1 - q * .7)); for (let k = 0; k < 3; k++) { E[k] *= 1 + .2 * q; E[6 + k] *= 1 + .2 * q; E[3 + k] *= 1 - .55 * q; } }
    const pu = 1 + sin(ph * 4) * .05, chg = st < 2 ? max(0, 1 - eAtk[i] * 2.5) : 0, q1 = 1 - q;
    sty(14, 1.8 * ag + chg * 3, .16, .08, .22);
    prim(2, 0, 0, 0, .42 * pu, .5, .42 * pu);
    sty(14, 1.2 * ag, .09, .05, .13);
    prim(2, 0, .34, -.05, .5, .26, .52);
    for (let k = 0; k < 6; k++) { const a = k * PI / 3 + .5; prim(2, cos(a) * .47, .18, sin(a) * .47 - .04, .2, .1, .2); }
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.57; seg(cos(a) * .2, .5, sin(a) * .2 - .05, cos(a) * .42, .95, sin(a) * .42 - .2, .07, .05, 2); }
    sty(14, 1.8 * ag, .16, .08, .22);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + .6, bx = cos(a) * .25, bz = sin(a) * .25, s1 = sin(ph * 2.2 + k) * .12 * q1, s2 = sin(ph * 2.2 + k + 1) * .2 * q1, s3 = sin(ph * 2.2 + k + 2) * .3 * q1;
      const r1 = 1.2 + 1.8 * q, r2 = 1.3 + 3.3 * q, r3 = 1.2 + 4.8 * q, y1 = -.72 + .32 * q, y2 = -1.08 + .66 * q, y3 = -1.45 + 1.01 * q;
      seg(bx, -.36, bz, bx * r1 + s1, y1, bz * r1, .075, .7); seg(bx * r1 + s1, y1, bz * r1, bx * r2 + s2, y2, bz * r2, .053, .65); seg(bx * r2 + s2, y2, bz * r2, bx * r3 + s3, y3, bz * r3, .034, .05, 2);
    }
    sty(6, (5 + chg * 14) * eg, .2, .9, 1); sFl = 0;
    prim(2, 0, .03, .38, .15, .15, .1); prim(2, .2, .13, .31, .06, .06, .05); prim(2, -.2, .13, .31, .06, .06, .05);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1; prim(2, cos(a) * .38, -.22, sin(a) * .38, .1 * pu, .13 * pu, .1 * pu); }
  } else {
    // brute: hunched armoured biped, visor head sunk between plated shoulders
    // death: staggers back with arms flung up, topples onto its back, bounces once, arms drop to the floor
    const a1 = sm(dk / .3), a2 = max(0, min(1, (dk - .25) / .6)), fall = a2 * a2, bo = dk > .85 ? sin((dk - .85) / .15 * PI) * .07 : 0;
    const wind = eT[i] > 0 && st === 1 ? 1 - eT[i] / .45 : 0, w = sin(ph * 2.4) * (1 - a1), lean = (.2 + wind * .25) * (1 - a1 * .8);
    eSet(eX[i], fall * .42 + bo * .5, eZ[i], eYaw[i], 1.08); gR = .4; gG = .95; gB = .1; gR *= gf; gG *= gf; gB *= gf;
    if (dk > 0) eRotX(-(a1 * .2 + fall * 1.32 - bo));
    const SK = () => sty(14, 1.5 * ag, .1, .1, .085), AR = () => sty(14, .25 * ag, .05, .055, .055);
    SK(); prim(2, 0, 1.02, 0, .4, .3, .3);
    for (let sd = -1; sd <= 1; sd += 2) {
      const s = w * sd * .35, kx = sd * (.32 + fall * .08), kz = .14 + s * .5 - fall * .22, ax = sd * (.3 + fall * .2), az = s - .05 - fall * .2;
      SK(); seg(sd * .24, .98, 0, kx, .55, kz, .2, .7); seg(kx, .55, kz, ax, .14, az, .13, .85);
      AR(); prim(4, kx, .56, kz + .08, .13, .15, .1); prim(4, ax, .09, az + .12, .17, .09, .27);
      seg(ax + .08, .08, az + .3, ax + .11, .02, az + .55, .05, .05, 2); seg(ax - .08, .08, az + .3, ax - .11, .02, az + .55, .05, .05, 2);
    }
    ePush(); eMove(0, 1.2, 0); eRotX(lean);
    SK(); prim(2, 0, .3, .03, .48, .4, .36); prim(2, 0, .68, .08, .62, .48, .44);
    AR();
    prim(4, 0, .78, .36, .42, .2, .16); prim(4, 0, .45, .33, .3, .14, .12);
    prim(4, 0, .98, .3, .2, .15, .2); seg(.1, .9, .46, .2, .72, .62, .045, .05, 2); seg(-.1, .9, .46, -.2, .72, .62, .045, .05, 2);
    for (let k = 0; k < 3; k++) { prim(4, 0, .98 - k * .27, -.24 - min(k, 1) * .12, .5 - k * .07, .13, .25 - k * .03); seg(0, 1.04 - k * .27, -.42, 0, 1.3 - k * .27, -.82, .085, .05, 2); }
    for (let sd = -1; sd <= 1; sd += 2) {
      const s = -w * sd * .3 - wind * 1.6 * (sd > 0 ? 1 : .6) - .9 * a1 * (1 - fall) + .3 * fall, ex = sd * (.92 + fall * .2), ey = .32 + max(0, -s) * .25, ez = .1 + s * .4 - fall * .45, hx = sd * (.8 + fall * .55), hy = -.25 - s * .5, hz = .5 - s * .35 - fall * .6;
      AR();
      prim(4, sd * .74, .9, .0, .3, .2, .32); prim(4, sd * .86, .76, .0, .2, .16, .26);
      seg(sd * .7, 1.02, .1, sd * .82, 1.42, .0, .08, .05, 2); seg(sd * .86, 1.0, -.12, sd * 1.12, 1.3, -.22, .07, .05, 2);
      prim(4, (ex + hx) * .5 + sd * .06, (ey + hy) * .5, (ez + hz) * .5, .1, .2, .12);
      for (let k = -1; k <= 1; k++) seg(hx + k * .1, hy - .08, hz + .12, hx + k * .16, hy - .38, hz + .36, .055, .05, 2);
      SK(); seg(sd * .72, .8, 0, ex, ey, ez, .18, .8); seg(ex, ey, ez, hx, hy, hz, .15, 1.25); prim(2, hx, hy, hz, .19, .15, .19);
    }
    sty(6, 9 * eg, .5, 1, .15); sFl = 0;
    prim(4, 0, 1.0, .5, .15, .022, .02); prim(2, .0, .9, .5, .02, .02, .02);
    ePop();
  }
  sFl = 0;
}
function drawWeapon() {
  ic = WB; if (state === 2) return;
  const K = .3, sw = switchT > 0 ? sin(switchT / .3 * PI) : 0, rl = reloadT > 0 ? sin((1 - reloadT / reloadD) * PI) : 0;
  E[0] = -cR[0] * K; E[1] = -cR[1] * K; E[2] = -cR[2] * K; E[3] = cU[0] * K; E[4] = cU[1] * K; E[5] = cU[2] * K; E[6] = cF[0] * K; E[7] = cF[1] * K; E[8] = cF[2] * K; E[9] = cP[0]; E[10] = cP[1]; E[11] = cP[2];
  eMove(-.23 + cos(bob) * .012 * bobA, -.235 - abs(sin(bob)) * .014 * bobA - sw * .3 - rl * .2, (weapon ? .7 : .54) - (weapon ? .03 : 0) * 0 - kick * (weapon ? .025 : .1));
  eRotX(kick * (weapon ? .015 : .14) - rl * .55 - sw * .7); eRotY(-.06); eRotZ(rl * .4);
  gR = gG = gB = 0; sFl = 0;
  const MET = () => { gR = 0; sty(16, 1, .2, .21, .235); }, DRK = () => { gR = 0; sty(16, 1, .085, .09, .1); }, POLY = (r, g, b) => { gR = 1; sty(16, 1, r, g, b); };
  // arms: glove + suited forearm reaching in from below
  const arm = (hx, hy, hz, ex, ey, ez, fx) => {
    const L = (f) => hx + (ex - hx) * f, M = (f) => hy + (ey - hy) * f, Nn = (f) => hz + (ez - hz) * f;
    gR = .2; sty(16, 1, .1, .105, .12); prim(4, hx, hy - .005, hz, .036, .028, .05);
    for (let k = 0; k < 4; k++) { const z = hz - .036 + k * .024; seg(hx - fx * .01, hy + .028, z, hx + fx * .038, hy + .03, z, .0115, 1, 4); seg(hx + fx * .038, hy + .03, z, hx + fx * .05, hy + .0, z, .011, .9, 4); }
    seg(hx - fx * .03, hy + .005, hz + .03, hx - fx * .045, hy + .035, hz + .055, .012, .9, 4);
    gR = 0; sty(16, 1, .3, .31, .34); prim(4, hx - fx * .012, hy + .036, hz - .002, .022, .006, .044);
    gR = .2; sty(16, 1, .1, .105, .12); seg(L(.07), M(.07), Nn(.07), L(.19), M(.19), Nn(.19), .04, 1.05, 4);
    gR = 0; sty(16, 1, .15, .16, .19); seg(L(.2), M(.2), Nn(.2), ex, ey, ez, .04, 1.5);
    sty(16, 1, .27, .28, .31); seg(L(.27), M(.27), Nn(.27), L(.5), M(.5), Nn(.5), .05, 1.15, 4);
    sty(16, 1, .55, .24, .05); seg(L(.3), M(.3), Nn(.3), L(.33), M(.33), Nn(.33), .0525, 1, 4);
    sty(6, 1.6, .15, .8, 1); seg(L(.215), M(.215), Nn(.215), L(.235), M(.235), Nn(.235), .0445);
  };
  if (weapon === 0) {
    const pump = cool > .25 && cool < .6 ? sin((cool - .25) / .35 * PI) : 0, pz = .35 - pump * .1;
    MET();
    seg(.023, .02, -.02, .023, .02, .72, .0195); seg(-.023, .02, -.02, -.023, .02, .72, .0195);
    seg(0, -.03, .04, 0, -.03, .6, .017); prim(2, 0, -.03, .6, .017, .017, .012);
    DRK();
    seg(.023, .02, .7, .023, .02, .725, .024); seg(-.023, .02, .7, -.023, .02, .725, .024);
    prim(1, 0, .042, .36, .005, .004, .33); prim(4, 0, -.005, .58, .05, .03, .014); prim(4, 0, -.005, .2, .05, .03, .014);
    prim(4, 0, .0, -.07, .037, .053, .135); prim(1, 0, .057, -.07, .012, .006, .11);
    seg(0, .058, -.165, 0, .072, -.165, .006);
    seg(0, -.05, -.02, 0, -.092, -.05, .006); seg(0, -.092, -.05, 0, -.092, -.12, .006); seg(0, -.092, -.12, 0, -.05, -.15, .006);
    sty(16, 1, .02, .02, .025); prim(1, -.0375, .012, -.05, .002, .017, .05);
    POLY(.06, .062, .07); seg(0, -.05, -.15, 0, -.18, -.23, .029, .85, 4); prim(4, 0, -.015, -.27, .026, .04, .07);
    POLY(.3, .13, .04); prim(4, 0, -.032, pz, .037, .033, .09);
    sty(6, 4, .2, 1, .4); gR = 0; prim(2, 0, .051, .7, .005, .005, .005);
    sty(6, 2.5, .15, .8, 1); prim(1, .0378, .005, -.05, .001, .005, .05);
    arm(0, -.13, -.2, -.1, -.5, -.42, -1); arm(.02, -.07, pz, .36, -.5, .0, 1);
  } else {
    MET();
    seg(0, 0, -.06, 0, 0, .2, .066); seg(0, 0, .2, 0, 0, .24, .05); seg(0, 0, .2, 0, 0, .8, .011);
    DRK();
    seg(0, 0, -.02, 0, 0, .0, .072); seg(0, 0, .15, 0, 0, .17, .072);
    seg(0, 0, .36, 0, 0, .375, .058); seg(0, 0, .6, 0, 0, .615, .058); seg(0, 0, .775, 0, 0, .79, .058);
    prim(4, 0, -.015, -.13, .05, .056, .07); prim(4, 0, .03, -.13, .03, .02, .05); seg(-.052, -.02, -.17, -.052, -.02, -.09, .012); seg(.052, -.02, -.17, .052, -.02, -.09, .012);
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; seg(cos(a) * .058, sin(a) * .058, .02, cos(a) * .058, sin(a) * .058, .14, .009); }
    seg(0, .06, -.04, 0, .1, -.04, .008); seg(0, .06, .12, 0, .1, .12, .008); seg(0, .1, -.06, 0, .1, .14, .011);
    POLY(.1, .1, .07); seg(.06, -.05, .05, .15, -.07, .05, .078); gR = 0; sty(16, 1, .3, .26, .08); seg(.1, -.055, .05, .115, -.06, .05, .08);
    DRK(); prim(4, .05, -.01, .05, .03, .03, .04);
    POLY(.07, .075, .085); seg(0, -.06, -.14, 0, -.2, -.21, .029, .85, 4); seg(0, -.06, .1, 0, -.17, .12, .022, .9, 4);
    MET();
    for (let k = 0; k < 6; k++) { const a = barrel + k * PI / 3, x = cos(a) * .037, y = sin(a) * .037; seg(x, y, .22, x, y, .8, .0115); }
    sty(6, 2 + spin * 6, 1, .35, .1); seg(0, 0, .2, 0, 0, .207, .067);
    sty(6, 2.5, .15, .8, 1); prim(1, -.0525, .0, -.13, .001, .005, .045);
    arm(0, -.15, -.18, -.1, -.5, -.42, -1); arm(.01, -.13, .11, .36, -.5, -.05, 1);
  }
}
function buildInstances() {
  instP.set(instA); instA.fill(0, IS);
  for (let i = 0; i < nE; i++) drawEnemy(i);
  for (let k = 0; k < nK; k++) if (kOn[k]) {
    ic = PB + k * 2; eSet(kX[k], .75 + sin(T * 2 + k) * .08, kZ[k], T * .8 + k, 1); gR = gG = gB = 0; sFl = 0;
    sty(kType[k] ? 10 : 11, 1, 1, 1, 1); prim(4, 0, 0, 0, .42, .42, .42);
    sty(6, 5, kType[k] ? 1 : .1, kType[k] ? .5 : 1, kType[k] ? .06 : .4); eSet(kX[k], .06, kZ[k], 0, 1); prim(3, 0, 0, 0, .5, .012, .5);
  }
  for (let k = 0; k < NPJ; k++) if (jL[k] > 0) { ic = JB + k; eSet(jX[k], jY[k], jZ[k], 0, 1); sty(6, 14, .3, .95, 1); prim(2, 0, 0, 0, .13, .13, .13); }
  for (let k = 0; k < nBar; k++) {
    ic = BB + k * 8; eSet(barrels[k * 2], 0, barrels[k * 2 + 1], k * 1.3, 1); gR = gG = gB = 0; sFl = 0;
    if (bSt[k] === 2) { eRotZ(.13); sty(7, 1, .03, .026, .024); prim(3, 0, .22, 0, .48, .24, .45); sty(4, 1, .03, .03, .03); prim(3, 0, .45, 0, .5, .03, .47); }
    else {
      sty(7, 1, .62, .07, .04); prim(3, 0, .62, 0, .42, .62, .42);
      sty(4, 1, .1, .11, .13); prim(3, 0, .41, 0, .44, .03, .44); prim(3, 0, .83, 0, .44, .03, .44); prim(3, 0, 1.22, 0, .44, .03, .44); prim(3, .2, 1.26, 0, .06, .03, .06);
      sty(6, bSt[k] ? 30 : 3 + sin(T * 5 + k), 1, .4, .05); prim(3, 0, .62, 0, .426, .045, .426);
    }
  }
  drawWeapon();
}
function buildSprites() {
  nS = 0; const a = sprA;
  for (let o = 0; o < NPT * 12; o += 12) if (pt[o + 6] > 0) {
    const q = nS++ * 12, f = pt[o + 6] / pt[o + 7];
    a[q] = pt[o]; a[q + 1] = pt[o + 1]; a[q + 2] = pt[o + 2]; a[q + 3] = pt[o + 8] * (.2 + .25 * f); a[q + 4] = pt[o] - pt[o + 3] * .045; a[q + 5] = pt[o + 1] - pt[o + 4] * .045; a[q + 6] = pt[o + 2] - pt[o + 5] * .045; a[q + 7] = 0; a[q + 8] = pt[o + 9]; a[q + 9] = pt[o + 10]; a[q + 10] = pt[o + 11]; a[q + 11] = 14 * f;
  }
  for (let o = 0; o < NBM * 12; o += 12) if (bm[o + 6] > 0) {
    const q = nS++ * 12, f = bm[o + 6] / bm[o + 11];
    a[q] = bm[o]; a[q + 1] = bm[o + 1]; a[q + 2] = bm[o + 2]; a[q + 3] = bm[o + 7]; a[q + 4] = bm[o + 3]; a[q + 5] = bm[o + 4]; a[q + 6] = bm[o + 5]; a[q + 7] = 0; a[q + 8] = bm[o + 8]; a[q + 9] = bm[o + 9]; a[q + 10] = bm[o + 10]; a[q + 11] = 5 * f;
  }
  for (let k = 0; k < NPJ; k++) if (jL[k] > 0) { const q = nS++ * 12; a[q] = a[q + 4] = jX[k]; a[q + 1] = a[q + 5] = jY[k]; a[q + 2] = a[q + 6] = jZ[k]; a[q + 3] = .55; a[q + 7] = 0; a[q + 8] = .15; a[q + 9] = .7; a[q + 10] = 1; a[q + 11] = 2.5; }
  if (flashT > 0 && state === 1) {
    const mx = cP[0] + cR[0] * .056 - cU[0] * .064 + cF[0] * .37, my = cP[1] + cR[1] * .056 - cU[1] * .064 + cF[1] * .37, mz = cP[2] + cR[2] * .056 - cU[2] * .064 + cF[2] * .37;
    for (let k = 0; k < 2; k++) { const q = nS++ * 12; a[q] = a[q + 4] = mx; a[q + 1] = a[q + 5] = my; a[q + 2] = a[q + 6] = mz; a[q + 3] = k ? .008 : .022; a[q + 7] = 0; a[q + 8] = 1; a[q + 9] = k ? .9 : .55; a[q + 10] = k ? .7 : .2; a[q + 11] = k ? 10 : 2.5; }
  }
  for (let k = 0; k < nBar; k++) if (bSt[k] === 2 && bT[k] < .7) { const f = bT[k] / .7, q = nS++ * 12; a[q] = a[q + 4] = barrels[k * 2]; a[q + 1] = a[q + 5] = 1 + f * 1.2; a[q + 2] = a[q + 6] = barrels[k * 2 + 1]; a[q + 3] = 1.2 + f * 3.5; a[q + 7] = 0; a[q + 8] = 1; a[q + 9] = .5 - .3 * f; a[q + 10] = .12; a[q + 11] = 14 * (1 - f) * (1 - f); }
  // soft contact shadows under the nearest enemies
  nBlob = 0;
  for (let i = 0; i < nE && nBlob < 16; i++) if (eState[i] < 2 && hypot(eX[i] - cP[0], eZ[i] - cP[2]) < 40) { const o = nBlob++ * 4, ty = eType[i]; blobA[o] = eX[i]; blobA[o + 1] = eZ[i]; blobA[o + 2] = ty === 2 ? 1.6 : ty === 1 ? 1 : 1.5; blobA[o + 3] = ty === 1 ? .35 : .82; }
  // dynamic lights: muzzle flash, impact, plasma bolts
  nDyn = 0; const d = dynL;
  if (flashL > .02 && state === 1) { d[0] = cP[0] + cF[0] * 1.3; d[1] = cP[1] + cF[1] * 1.3 - .1; d[2] = cP[2] + cF[2] * 1.3; d[3] = 5; d[4] = 3.2 * flashL; d[5] = 1.9 * flashL; d[6] = .75 * flashL; d[7] = .2; nDyn++; }
  if (impT > 0) { const o = nDyn++ * 8; d[o] = impX; d[o + 1] = impY; d[o + 2] = impZ; d[o + 3] = 4; d[o + 4] = 10; d[o + 5] = 6; d[o + 6] = 2; d[o + 7] = .1; }
  for (let k = 0; k < nBar && nDyn < 8; k++) if (bSt[k] === 2 && bT[k] < .7) { const o = nDyn++ * 8, f = 1 - bT[k] / .7, q = 70 * f * f; d[o] = barrels[k * 2]; d[o + 1] = 1.3; d[o + 2] = barrels[k * 2 + 1]; d[o + 3] = 16; d[o + 4] = q; d[o + 5] = q * .5; d[o + 6] = q * .15; d[o + 7] = .3; }
  for (let k = 0; k < NPJ && nDyn < 8; k++) if (jL[k] > 0) { const o = nDyn++ * 8; d[o] = jX[k]; d[o + 1] = jY[k]; d[o + 2] = jZ[k]; d[o + 3] = 6; d[o + 4] = 2; d[o + 5] = 9; d[o + 6] = 11; d[o + 7] = .2; }
}

// ---------- scripted fly-through + fixed critic poses ----------
const FLYKEYS = [18, 14, 16, 14, 16, 12, 8, 12, 8, 5, 17, 5, 17, 9, 13, 9, 17, 9, 17, 11, 19, 11, 19, 4, 19, 2, 30, 2, 33, 3, 33, 12, 28, 12, 28, 15, 28, 12, 23, 12, 23, 19, 23, 22, 16, 22, 8, 22, 11, 20, 11, 16];
const flyP = new Float32Array(512); let flyN = 0;
{
  let cx = FLYKEYS[0], cz = FLYKEYS[1]; flyP[0] = cx; flyP[1] = cz; flyN = 1;
  for (let k = 2; k < FLYKEYS.length; k += 2) {
    bfs(FLYKEYS[k], FLYKEYS[k + 1]);
    while (flow[cz * MW + cx] > 0) {
      const c = cz * MW + cx, d = flow[c];
      if (flow[c - 1] === d - 1) cx--; else if (flow[c + 1] === d - 1) cx++; else if (flow[c - MW] === d - 1) cz--; else cz++;
      flyP[flyN * 2] = cx; flyP[flyN * 2 + 1] = cz; flyN++;
    }
  }
  bfs(startX, startZ);
}
let flyX = 0, flyZ = 0;
function flyAt(u) {
  u = max(0, min(flyN - 1.001, u)); const i = floor(u), f = u - i, a = max(i - 1, 0) * 2, b = i * 2, c = min(i + 1, flyN - 1) * 2, d = min(i + 2, flyN - 1) * 2, f2 = f * f, f3 = f2 * f;
  const w0 = -.5 * f3 + f2 - .5 * f, w1 = 1.5 * f3 - 2.5 * f2 + 1, w2 = -1.5 * f3 + 2 * f2 + .5 * f, w3 = .5 * f3 - .5 * f2;
  flyX = (flyP[a] * w0 + flyP[b] * w1 + flyP[c] * w2 + flyP[d] * w3) * CS + 2; flyZ = (flyP[a + 1] * w0 + flyP[b + 1] * w1 + flyP[c + 1] * w2 + flyP[d + 1] * w3) * CS + 2;
}
let flyT = qn('start', 0), flyYaw = 2.2;
function simFly(dt) {
  flyT += dt; const u = flyT / DUR * (flyN - 1);
  flyAt(u + 1.6); const ax = flyX, az = flyZ; flyAt(u + .6); const bx = flyX, bz = flyZ; flyAt(u); px = flyX; pz = flyZ;
  let da = atan2((ax + bx) * .5 - px, -((az + bz) * .5 - pz)) - flyYaw; da -= floor(da / (2 * PI) + .5) * 2 * PI;
  flyYaw += da * min(1, dt * 2.2); yaw = flyYaw + sin(flyT * .55) * .3; pitch = sin(flyT * .37) * .08 + .02;
  bob += 6 * dt; bobA = .6;
  const cyc = flyT % 10; fire = cyc > 6.5 && cyc < 9 ? 1 : 0;
  const w = floor(flyT / 10) & 1; if (w !== weapon) { weapon = w; switchT = .3; }
  mag[0] = max(mag[0], 4); mag[1] = max(mag[1], 60);
}
// x, z in cells, yaw, pitch, fire, weapon
const POSES = [18.7, 13.6, 2.3, .03, 0, 0, 16.6, 12.5, -1.6, .02, 0, 0, 29.3, 2.9, -1.0, .17, 0, 0, 19.4, 23.5, 1.2, .16, 0, 1, 13.6, 23.3, -1.42, .05, 0, 0, 9.6, 16.4, 1.52, .04, 1, 1];
if (POSE >= 0) { const o = POSE * 6; px = POSES[o] * CS; pz = POSES[o + 1] * CS; yaw = POSES[o + 2]; pitch = POSES[o + 3]; fire = POSES[o + 4]; weapon = POSES[o + 5]; if (fire) spin = 1; }

function sim(dt) {
  T += dt;
  if (state === 1) {
    if (FLY) simFly(dt); else if (POSE < 0) simPlayer(dt);
    if (POSE >= 0 && fire) mag[1] = 99;
  }
  // camera basis
  const cp = cos(pitch), sp = sin(pitch), sy = sin(yaw), cy = cos(yaw);
  cF[0] = cp * sy; cF[1] = sp; cF[2] = -cp * cy; cR[0] = cy; cR[1] = 0; cR[2] = sy;
  cU[0] = cR[1] * cF[2] - cR[2] * cF[1]; cU[1] = cR[2] * cF[0] - cR[0] * cF[2]; cU[2] = cR[0] * cF[1] - cR[1] * cF[0];
  cP[0] = px; cP[1] = (state === 2 ? .5 : EYE) + sin(bob * 2) * .035 * bobA; cP[2] = pz;
  if (state === 1 || state === 3) { simWeapon(dt); simEnemies(dt); }
  simStuff(dt);
  if (AW) sP[14].value = state === 1 ? spin : 0;
}
