// ---------- WebGPU renderer ----------
const cv = document.getElementById('c'), ov = document.getElementById('o'), msg = document.getElementById('m');
const fail = (t) => { ov.style.display = 'flex'; msg.textContent = t; };
if (!navigator.gpu) { fail('WebGPU is not available in this browser.'); return; }
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) { fail('No WebGPU adapter found.'); return; }
const hasTS = adapter.features.has('timestamp-query');
const dev = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
dev.addEventListener('uncapturederror', (e) => console.error('GPU', e.error.message));
dev.lost.then((i) => console.error('GPU device lost: ' + i.message));
const ctx = cv.getContext('webgpu'), fmt = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device: dev, format: fmt, alphaMode: 'opaque' });
const HDR = 'rgba16float', BU = GPUBufferUsage, TU = GPUTextureUsage;
const mkBuf = (data, usage) => { const b = dev.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); dev.queue.writeBuffer(b, 0, data); return b; };
const worldVB = mkBuf(worldV, BU.VERTEX), worldIB = mkBuf(worldI, BU.INDEX), unitVB = mkBuf(unitV, BU.VERTEX), unitIB = mkBuf(unitI, BU.INDEX);
vbuf = vf = vu = ibuf = null;
const U = new Float32Array(416), ubuf = dev.createBuffer({ size: U.byteLength, usage: BU.UNIFORM | BU.COPY_DST });
const instBuf = dev.createBuffer({ size: instA.byteLength, usage: BU.STORAGE | BU.COPY_DST }), sprBuf = dev.createBuffer({ size: sprA.byteLength, usage: BU.STORAGE | BU.COPY_DST }), decBuf = dev.createBuffer({ size: dcl.byteLength, usage: BU.STORAGE | BU.COPY_DST });
const lightBuf = mkBuf(lightD.subarray(0, max(nL, 1) * 8), BU.STORAGE), cellBuf = mkBuf(cellL, BU.STORAGE);
// wall distance field as r16float
const sdfTex = dev.createTexture({ size: [SW, SH], format: 'r16float', usage: TU.TEXTURE_BINDING | TU.COPY_DST });
{
  const h = new Uint16Array(SW * SH), f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  for (let i = 0; i < SW * SH; i++) { f32[0] = sdS[i]; const x = u32[0], s = (x >> 16) & 0x8000, e = ((x >> 23) & 255) - 112, m = x & 0x7fffff; h[i] = e <= 0 ? s : e >= 31 ? s | 0x7c00 : s | (e << 10) | (m >> 13); }
  dev.queue.writeTexture({ texture: sdfTex }, h, { bytesPerRow: SW * 2 }, [SW, SH]);
}
const lin = dev.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const mod = (code) => dev.createShaderModule({ code });
const smG = mod(WG_GBUF), smL = mod(WG_LIGHT), smS = mod(WG_SPR), smT = mod(WG_TAA), smB = mod(WG_BLOOM), smF = mod(WG_FINAL);
const vlay = [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'unorm8x4' }, { shaderLocation: 3, offset: 28, format: 'uint8x4' }] }];
const prim3 = { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' };
const fsq = (m, entry, format, blend) => dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: entry, targets: [blend ? { format, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } } : { format }] } });
const smD = mod(WG_DEC);
const [pDc, pZ, pG, pL, pS, pT, pD0, pD, pUp, pF] = await Promise.all([
  dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: smD, entryPoint: 'vs' }, fragment: { module: smD, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' } } }, { format: HDR, blend: { color: { srcFactor: 'zero', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }, { format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }, { format: 'rg16float', writeMask: 0 }] }, primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' }, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' } }),
  dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: smG, entryPoint: 'vsz', buffers: vlay }, primitive: prim3, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' } }),
  dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: smG, entryPoint: 'vs', buffers: vlay }, fragment: { module: smG, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }, { format: HDR }, { format: HDR }, { format: 'rg16float' }] }, primitive: prim3, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'equal' } }),
  fsq(smL, 'fs', HDR),
  dev.createRenderPipelineAsync({ layout: 'auto', vertex: { module: smS, entryPoint: 'vs' }, fragment: { module: smS, entryPoint: 'fs', targets: [{ format: HDR, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'zero', dstFactor: 'one' } } }] }, depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' } }),
  fsq(smT, 'fs', HDR), fsq(smB, 'fd0', HDR), fsq(smB, 'fd', HDR), fsq(smB, 'fu', HDR, 1), fsq(smF, 'fs', fmt)]);
const bg = (p, i, entries) => dev.createBindGroup({ layout: p.getBindGroupLayout(i), entries: entries.map((r, binding) => ({ binding, resource: r })) });
const ub = { buffer: ubuf };
const bgZ = bg(pZ, 0, [ub, { buffer: instBuf }]), bgG = bg(pG, 0, [ub, { buffer: instBuf }]), bgL0 = bg(pL, 0, [ub]), bgS = bg(pS, 0, [ub, { buffer: sprBuf }]), bgT0 = bg(pT, 0, [ub]), bgDc = bg(pDc, 0, [ub, { buffer: decBuf }]), bgF0 = bg(pF, 0, [ub]);

// render targets (rebuilt on resize only)
const NB = 6;
let bgDc1 = null, W = 0, H = 0, tex = [], bgL = [null, null], bgT = [null, null], bgF = [null, null], bgD = [], bgU = [], bgD0 = [null, null];
const cl = (view, load) => ({ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] });
const rpZ = { colorAttachments: [], depthStencilAttachment: null }, rpG = { colorAttachments: null, depthStencilAttachment: null }, rpL = { colorAttachments: null }, rpS = { colorAttachments: null, depthStencilAttachment: null },
  rpT = [{ colorAttachments: null }, { colorAttachments: null }], rpD = [], rpU = [], rpF = { colorAttachments: [cl(null)] };
for (let i = 0; i < NB; i++) { rpD.push({ colorAttachments: null }); rpU.push({ colorAttachments: null }); }
let qs = null, qres = null, qbig = null; const QMAX = 24000, NQ = 34;
if (BENCH && hasTS) {
  // every pass gets its own begin/end pair; the GPU frame time is the sum of pass durations
  qs = dev.createQuerySet({ type: 'timestamp', count: NQ }); qres = dev.createBuffer({ size: 512, usage: BU.QUERY_RESOLVE | BU.COPY_SRC }); qbig = dev.createBuffer({ size: QMAX * NQ * 8, usage: BU.COPY_DST | BU.MAP_READ });
  let qi = 0; const tw = (d) => { d.timestampWrites = { querySet: qs, beginningOfPassWriteIndex: qi, endOfPassWriteIndex: qi + 1 }; qi += 2; };
  tw(rpZ); tw(rpG); tw(rpL); tw(rpS); tw(rpT[0]); qi -= 2; tw(rpT[1]); rpD.forEach(tw); rpU.slice(0, NB - 1).forEach(tw); tw(rpF);
}
function resize() {
  const w = FW || (BENCH ? 2560 : max(1, floor(cv.clientWidth * devicePixelRatio))), h = FH || (BENCH ? 1440 : max(1, floor(cv.clientHeight * devicePixelRatio)));
  if (w === W && h === H) return;
  W = cv.width = w; H = cv.height = h;
  for (const t of tex) t.destroy(); tex = [];
  const mk = (format, w2 = W, h2 = H) => { const t = dev.createTexture({ size: [w2, h2], format, usage: TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING }); tex.push(t); return t.createView(); };
  const vA = mk('rgba8unorm'), vN = mk(HDR), vE = mk(HDR), vV = mk('rg16float'), vD = mk('depth32float'), vLit = mk(HDR), vH = [mk(HDR), mk(HDR)], vB = [];
  for (let i = 0; i < NB; i++) vB.push(mk(HDR, max(1, W >> (i + 1)), max(1, H >> (i + 1))));
  rpZ.depthStencilAttachment = { view: vD, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' };
  rpG.colorAttachments = [cl(vA), cl(vN), cl(vE), cl(vV)]; rpG.depthStencilAttachment = { view: vD, depthReadOnly: true };
  rpL.colorAttachments = [cl(vLit)]; bgDc1 = bg(pDc, 1, [vD]);
  rpS.colorAttachments = [cl(vLit, 1)]; rpS.depthStencilAttachment = { view: vD, depthReadOnly: true };
  for (let k = 0; k < 2; k++) {
    rpT[k].colorAttachments = [cl(vH[k])];
    bgL[k] = bg(pL, 1, [vA, vN, vE, vD, vH[1 - k], lin, sdfTex.createView(), { buffer: lightBuf }, { buffer: cellBuf }]);
    bgT[k] = bg(pT, 1, [vLit, vH[1 - k], vV, vD, lin]);
    bgF[k] = bg(pF, 1, [vH[k], vB[0], lin]);
    bgD0[k] = bg(pD0, 0, [vH[k], lin]);
  }
  bgD = []; bgU = [];
  for (let i = 0; i < NB; i++) {
    rpD[i].colorAttachments = [cl(vB[i])]; rpU[i].colorAttachments = [cl(vB[i], 1)];
    if (i > 0) bgD.push(bg(pD, 0, [vB[i - 1], lin])); else bgD.push(null);
    if (i < NB - 1) bgU.push(bg(pUp, 0, [vB[i + 1], lin])); else bgU.push(null);
  }
  resetHist = 1;
}
let resetHist = 1;
addEventListener('resize', resize);

// ---------- per-frame uniforms ----------
const FOVF = 1 / Math.tan(72 * PI / 360), NEAR = .03;
const JX = new Float32Array(16), JY = new Float32Array(16);
for (let i = 0; i < 16; i++) { const hal = (n, b) => { let f = 1, r = 0; while (n > 0) { f /= b; r += f * (n % b); n = floor(n / b); } return r; }; JX[i] = hal(i + 1, 2) - .5; JY[i] = hal(i + 1, 3) - .5; }
const fogW = new Float32Array(MAXL), fogSel = new Int32Array(10);
function setVP(o, jx, jy) {
  const a = W / H, fx = FOVF / a, dr = -(cR[0] * cP[0] + cR[1] * cP[1] + cR[2] * cP[2]), du = -(cU[0] * cP[0] + cU[1] * cP[1] + cU[2] * cP[2]), df = -(cF[0] * cP[0] + cF[1] * cP[1] + cF[2] * cP[2]);
  for (let k = 0; k < 3; k++) { U[o + k * 4] = fx * cR[k] + jx * cF[k]; U[o + k * 4 + 1] = FOVF * cU[k] + jy * cF[k]; U[o + k * 4 + 2] = 0; U[o + k * 4 + 3] = cF[k]; }
  U[o + 12] = fx * dr + jx * df; U[o + 13] = FOVF * du + jy * df; U[o + 14] = NEAR; U[o + 15] = df;
}
function uniforms(dt) {
  const a = W / H, j = frameNo & 15, jx = JX[j] * 2 / W, jy = JY[j] * 2 / H;
  for (let k = 0; k < 16; k++) U[32 + k] = U[16 + k];
  setVP(0, jx, jy); setVP(16, 0, 0);
  if (resetHist) for (let k = 0; k < 16; k++) U[32 + k] = U[16 + k];
  for (let k = 0; k < 3; k++) { U[48 + k] = cP[k]; U[52 + k] = cR[k] * a / FOVF; U[56 + k] = cU[k] / FOVF; U[60 + k] = cF[k]; }
  U[51] = T; U[59] = frameNo; U[63] = dt;
  U[64] = W; U[65] = H; U[66] = 1 / W; U[67] = 1 / H; U[68] = jx; U[69] = jy;
  U[72] = .3458; U[73] = .494; U[74] = -.7977; U[75] = 2.3;
  U[76] = FOVF; U[77] = a; U[78] = NEAR; U[79] = 1.05;
  U[80] = hp; U[81] = mag[weapon]; U[82] = res[weapon]; U[83] = alive;
  U[84] = weapon; U[85] = dmgFlash; U[86] = pickFlash; U[87] = hitMark;
  U[88] = state === 2 ? 1 : 0; U[89] = reloadT > 0 ? max(.02, 1 - reloadT / reloadD) : 0; U[90] = AUTO ? -1 : playT; U[91] = min(1, kick + hypot(pvx, pvz) * .06);
  U[92] = nDyn; U[94] = resetHist; resetHist = 0; U[95] = nBlob;
  for (let k = 0; k < nBlob * 4; k++) U[352 + k] = blobA[k];
  for (let k = 0; k < nDyn * 8; k++) U[96 + k] = dynL[k];
  // fog lights: nearest lights visible from the camera, smoothly weighted
  let nf = 0;
  for (let l = 0; l < nL; l++) {
    const o = l * 8, d = hypot(lightD[o] - cP[0], lightD[o + 2] - cP[2]);
    let w = 0;
    if (d < 24) { const lx = lightD[o] - cP[0], lz = lightD[o + 2] - cP[2], f = max(0, 1 - (lightD[o + 7] + .1) / (d + 1e-6)); w = los(cP[0], cP[2], cP[0] + lx * f, cP[2] + lz * f) * min(1, (24 - d) * .25); }
    fogW[l] += (w - fogW[l]) * min(1, dt * 6);
    if (fogW[l] > .01 && nf < 10) fogSel[nf++] = l;
  }
  for (let k = 0; k < nf; k++) { const o = fogSel[k] * 8, q = 160 + k * 8, w = fogW[fogSel[k]]; U[q] = lightD[o]; U[q + 1] = lightD[o + 1]; U[q + 2] = lightD[o + 2]; U[q + 4] = lightD[o + 4] * w; U[q + 5] = lightD[o + 5] * w; U[q + 6] = lightD[o + 6] * w; }
  U[93] = nf;
}

// ---------- frame ----------
const submitArr = [null], NI = MAXINST, MUL = qn('mul', 1);
let hi = 0, benchI = 0, warm = 0, benchDone = 0, lastNow = 0;
const ftLog = new Float32Array(QMAX);
function render() {
  dev.queue.writeBuffer(ubuf, 0, U); dev.queue.writeBuffer(instBuf, 0, instA); dev.queue.writeBuffer(decBuf, 0, dcl);
  if (nS) dev.queue.writeBuffer(sprBuf, 0, sprA, 0, nS * 12);
  const enc = dev.createCommandEncoder();
  let p = enc.beginRenderPass(rpZ);
  p.setPipeline(pZ); p.setBindGroup(0, bgZ);
  p.setVertexBuffer(0, worldVB); p.setIndexBuffer(worldIB, 'uint32'); p.drawIndexed(worldNI, 1, 0, 0, 0);
  p.setVertexBuffer(0, unitVB); p.setIndexBuffer(unitIB, 'uint32'); p.drawIndexed(unitNI, NI - 1, 0, 0, 1);
  p.end();
  p = enc.beginRenderPass(rpG);
  p.setPipeline(pG); p.setBindGroup(0, bgG);
  p.setVertexBuffer(0, worldVB); p.setIndexBuffer(worldIB, 'uint32'); p.drawIndexed(worldNI, 1, 0, 0, 0);
  p.setVertexBuffer(0, unitVB); p.setIndexBuffer(unitIB, 'uint32'); p.drawIndexed(unitNI, NI - 1, 0, 0, 1);
  p.setPipeline(pDc); p.setBindGroup(0, bgDc); p.setBindGroup(1, bgDc1); p.draw(6, NDC);
  p.end();
  p = enc.beginRenderPass(rpL); p.setPipeline(pL); p.setBindGroup(0, bgL0); p.setBindGroup(1, bgL[hi]); p.draw(3); p.end();
  if (nS || qs) { p = enc.beginRenderPass(rpS); p.setPipeline(pS); p.setBindGroup(0, bgS); if (nS) p.draw(6, nS); p.end(); }
  p = enc.beginRenderPass(rpT[hi]); p.setPipeline(pT); p.setBindGroup(0, bgT0); p.setBindGroup(1, bgT[hi]); p.draw(3); p.end();
  p = enc.beginRenderPass(rpD[0]); p.setPipeline(pD0); p.setBindGroup(0, bgD0[hi]); p.draw(3); p.end();
  for (let i = 1; i < NB; i++) { p = enc.beginRenderPass(rpD[i]); p.setPipeline(pD); p.setBindGroup(0, bgD[i]); p.draw(3); p.end(); }
  for (let i = NB - 2; i >= 0; i--) { p = enc.beginRenderPass(rpU[i]); p.setPipeline(pUp); p.setBindGroup(0, bgU[i]); p.draw(3); p.end(); }
  rpF.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  p = enc.beginRenderPass(rpF); p.setPipeline(pF); p.setBindGroup(0, bgF0); p.setBindGroup(1, bgF[hi]); p.draw(3); p.end();
  if (qs && warm >= 90 && !benchDone && benchI < QMAX) { enc.resolveQuerySet(qs, 0, NQ, qres, 0); enc.copyBufferToBuffer(qres, 0, qbig, benchI * NQ * 8, NQ * 8); }
  submitArr[0] = enc.finish(); dev.queue.submit(submitArr);
  hi ^= 1;
}
function step(dt) {
  resize();
  if (BENCH && warm < 90) { flyT = 0; }
  sim(dt); buildInstances(); buildSprites(); uniforms(dt); render(); frameNo++;
  for (let k = 1; k < MUL; k++) { hi ^= 1; render(); } // bench only: draw the same frame MUL times to make the run GPU-bound
}
function frame(now) {
  let dt = (now - lastNow) / 1000; lastNow = now;
  if (BENCH && !benchDone) {
    if (warm < 90) warm++; else { ftLog[benchI++] = dt * 1000; if (flyT >= DUR || benchI >= QMAX) { benchDone = 1; finishBench(); } }
  }
  dt = FIXDT || min(dt, .05);
  if (state === 0) dt = min(dt, .02);
  step(dt);
  requestAnimationFrame(frame);
}
async function finishBench() {
  const n = benchI - 1, st = (a) => { const s = Float64Array.from(a).sort(); let m = 0; for (const v of s) m += v; return { avg: m / s.length, p50: s[s.length >> 1], p99: s[min(s.length - 1, floor(s.length * .99))], max: s[s.length - 1] }; };
  const r = { frames: n, mul: MUL, costPerRenderMs: 0, width: W, height: H, seconds: DUR, adapter: adapter.info ? (adapter.info.description || adapter.info.vendor + ' ' + adapter.info.architecture) : '', frameIntervalMs: st(ftLog.subarray(1, n + 1)), gpuMs: null };
  if (qbig) {
    await dev.queue.onSubmittedWorkDone(); await qbig.mapAsync(GPUMapMode.READ, 0, (n + 1) * NQ * 8);
    // Pass-begin stamps are unreliable on some drivers and the last pass's end stamp can land one frame late,
    // so the frame time is (end of final pass) - (begin of first pass), taking the final end from the next record when stale.
    const q = new BigInt64Array(qbig.getMappedRange(0, (n + 1) * NQ * 8)), g = new Float64Array(n - 1), pa = new Float64Array(NQ / 2), ORD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 14, 13, 12, 11, 16]; let bad = 0, m = 0;
    for (let i = 1; i < n; i++) {
      const o = i * NQ, b0 = q[o]; let last = b0, prev = b0;
      for (let k = 0; k < 16; k++) { const e = q[o + ORD[k] * 2 + 1]; if (e > last) last = e; const d = Number(e - prev) / 1e6; if (d >= 0 && d < 100) pa[k] += d; prev = e > prev ? e : prev; }
      let fe = q[o + NQ - 1]; if (fe < last) fe = q[o + 2 * NQ - 1];
      let d = Number(fe - b0) / 1e6; if (!(fe >= last) || d > 500) { d = Number(last - b0) / 1e6; bad++; }
      pa[16] += Math.max(0, Number(fe - last) / 1e6); g[m++] = d;
    }
    r.gpuMs = st(g.subarray(0, m)); r.invalidPassSamples = bad; r.gpuOver16_7 = g.filter(v => v > 16.7).length;
    r.passAvgMs = { names: 'depth gbuffer lighting sprites taa bloomDown0-5 bloomUp4-0 final', ms: Array.from(pa, (v) => +(v / m).toFixed(3)) };
    r.rawNs = [50, 51, 52].map((fi) => Array.from({ length: NQ }, (_, k) => Number(q[fi * NQ + k] - q[fi * NQ])));
    qbig.unmap();
  }
  r.costPerRenderMs = { avg: r.frameIntervalMs.avg / MUL, p99: r.frameIntervalMs.p99 / MUL, max: r.frameIntervalMs.max / MUL };
  r.pass = !!r.gpuMs && r.invalidPassSamples < n * .02 && r.gpuMs.avg <= 11 && r.gpuMs.max <= 16.7;
  window.__bench = r; console.log('BENCH ' + JSON.stringify(r));
  const f = (s) => s ? `avg ${s.avg.toFixed(2)}  p99 ${s.p99.toFixed(2)}  max ${s.max.toFixed(2)} ms` : 'timestamp-query unavailable';
  ov.style.display = 'flex'; msg.innerHTML = `<b>FLY-THROUGH BENCHMARK ${r.width}×${r.height}, ${n} frames</b><br>GPU frame time: ${f(r.gpuMs)}<br>Frame interval: ${f(r.frameIntervalMs)}<br>${r.gpuMs ? (r.pass ? 'PASS' : 'FAIL') + ' (target avg ≤ 11 ms, max ≤ 16.7 ms)' + (r.invalidPassSamples ? ' — ' + r.invalidPassSamples + ' invalid timestamp samples' : '') : ''}<br>Lighting ${r.passAvgMs ? r.passAvgMs.ms[2] : '?'} ms, G-buffer ${r.passAvgMs ? r.passAvgMs.ms[1] : '?'} ms, TAA ${r.passAvgMs ? r.passAvgMs.ms[4] : '?'} ms (avg)<br>${MUL > 1 ? `Frame drawn ${MUL}× per refresh → cost per render ≤ ${f(r.costPerRenderMs)}<br>` : ''}<small>${r.adapter} — click to copy full JSON report</small>`;
  ov.onclick = () => navigator.clipboard.writeText(JSON.stringify(r));
}

// ---------- state + input ----------
// ---------- local leaderboard: ten best clear times per difficulty, kept in localStorage ----------
const DN = ['EASY', 'MEDIUM', 'HARD'];
let pName = '';
const lbLoad = () => { try { const l = JSON.parse(localStorage.hbl); if (l.length === 3) return l; } catch (e) { } return [[], [], []]; };
const fmtT = (t) => { const m = floor(t / 60), s = t - m * 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
const esc = (t) => String(t).replace(/[&<>]/g, (c) => '&#' + c.charCodeAt(0) + ';');
const lbHtml = (d, hi) => { const l = lbLoad()[d]; return l.length ? '<table>' + l.map((e, i) => `<tr${i === hi ? ' class=s' : ''}><td>${i + 1}.<td>${esc(e[1] || '-')}<td>${fmtT(e[0])}<td>${esc(e[2])}`).join('') + '</table>' : '<small>No cleared runs on ' + DN[d] + ' yet</small>'; };
function lbAdd() {
  const l = lbLoad(), e = [Math.round(playT * 10) / 10, pName, new Date().toISOString().slice(0, 10)];
  l[DIFF].push(e); l[DIFF].sort((a, b) => a[0] - b[0]); const rank = l[DIFF].indexOf(e); l[DIFF].length = min(l[DIFF].length, 10);
  try { localStorage.hbl = JSON.stringify(l); } catch (e) { }
  return rank;
}
function setState(s) {
  state = s;
  if (s === 2) { ov.style.display = 'flex'; msg.innerHTML = '<b>YOU DIED</b><br>Click to try again'; document.exitPointerLock(); }
  else if (s === 3) { ov.style.display = 'flex'; const rk = lbAdd(); msg.innerHTML = `<b>SHIP CLEARED</b><br>${DN[DIFF]} &nbsp;&middot;&nbsp; ${fmtT(playT)}${rk < 10 ? ' &nbsp;&middot;&nbsp; #' + (rk + 1) : ''}<br><br>${lbHtml(DIFF, rk)}<br>Click to play again`; document.exitPointerLock(); }
  else if (s === 1) ov.style.display = 'none';
}
if (!AUTO) {
  const key = (e, v) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'KeyW': kW = v; break; case 'KeyS': kS = v; break; case 'KeyA': kA = v; break; case 'KeyD': kD = v; break;
      case 'ShiftLeft': case 'ShiftRight': kShift = v; break;
      case 'KeyR': if (v) wantReload = 1; break;
      case 'KeyM': if (v && !e.repeat) { musOn ^= 1; if (AW) sP[15].value = musOn; } break;
      case 'Digit1': if (v && weapon !== 0) { weapon = 0; switchT = .3; reloadT = 0; snd(12); } break;
      case 'Digit2': if (v && hasMG && weapon !== 1) { weapon = 1; switchT = .3; reloadT = 0; snd(12); } break;
      case 'KeyQ': if (v && hasMG) { weapon ^= 1; switchT = .3; reloadT = 0; snd(12); } break;
      default: return;
    }
    e.preventDefault();
  };
  addEventListener('keydown', (e) => key(e, 1)); addEventListener('keyup', (e) => key(e, 0));
  addEventListener('mousemove', (e) => { if (document.pointerLockElement === cv) { mdx += e.movementX; mdy += e.movementY; } });
  addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement === cv) fire = 1; });
  addEventListener('mouseup', (e) => { if (e.button === 0) fire = 0; });
  addEventListener('wheel', () => { if (state === 1 && hasMG && switchT <= 0) { weapon ^= 1; switchT = .3; reloadT = 0; snd(12); } }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  const dB = document.querySelectorAll('#d a'), lbEl = document.getElementById('l'), nEl = document.getElementById('n'), dSel = (i) => { dB.forEach((el, j) => { el.className = j === i ? 's' : ''; }); lbEl.innerHTML = lbHtml(i, -1); };
  document.getElementById('sd').textContent = RANDMAP ? 'ship seed ' + shipSeed : 'classic ship';
  try { pName = localStorage.hbn || ''; } catch (e) { }
  nEl.value = pName; nEl.onclick = (e) => e.stopPropagation(); nEl.oninput = () => { pName = nEl.value.trim(); try { localStorage.hbn = pName; } catch (e) { } };
  dB.forEach((el, i) => { el.onclick = (e) => { e.stopPropagation(); if (state) return; setDiff(i); dSel(i); try { localStorage.hbd = i; } catch (e) { } }; });
  dSel(DIFF);
  ov.addEventListener('click', () => { if (state >= 2) { location.reload(); return; } initAudio(); if (AC) AC.resume(); cv.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === cv) setState(1);
    else if (state === 1) { state = 0; fire = kW = kA = kS = kD = kShift = 0; ov.style.display = 'flex'; msg.innerHTML = '<b>PAUSED</b><br>Click to resume'; }
  });
} else ov.style.display = 'none';
resize();
if (CAP) window.__in = (o) => {
  if (o) { state = 1; if ('w' in o) kW = o.w; if ('fire' in o) fire = o.fire; if ('yaw' in o) yaw = o.yaw; if ('pitch' in o) pitch = o.pitch; if ('weapon' in o) weapon = o.weapon; if ('mg' in o) for (let k = 0; k < nK; k++) if (kType[k] > 1) { px = kX[k] - o.mg; pz = kZ[k]; yaw = PI / 2; pitch = -.12; } if ('r' in o) wantReload = o.r; if ('x' in o) { px = o.x; pz = o.z; } if ('hp' in o) hp = o.hp; if ('killall' in o) for (let i = 0; i < nE; i++) hurt(i, 1e6); if ('leave' in o) { let n = 0; for (let i = nE - 1; i >= 0 && alive > o.leave; i--) if (eState[i] < 2 && hypot(eX[i] - px, eZ[i] - pz) < 1e3 - n++) hurt(i, 1e6); } if ('ebar' in o) for (let i = 0; i < 6; i++) { eX[i] = barrels[o.ebar * 2] + 1.2 + i * .9; eZ[i] = barrels[o.ebar * 2 + 1] + 2; } if ('bar' in o) { const bx = barrels[o.bar * 2], bz = barrels[o.bar * 2 + 1]; for (let k = 0; k < 16; k++) { const a = k * PI / 8, x = bx + sin(a) * o.d, z = bz + cos(a) * o.d; if (sdfAt(sdC, x, z) > .8 && los(x, z, bx, bz)) { px = x; pz = z; yaw = -a; pitch = Math.atan2(.62 - EYE, o.d); break; } } } if ('kill' in o) for (let i = 0; i < nE; i++) if (eType[i] === o.kill && eState[i] < 2) { for (let k = 0; k < 16; k++) { const a = k * PI / 8, x = eX[i] + sin(a) * o.d, z = eZ[i] + cos(a) * o.d; if (sdfAt(sdC, x, z) > .8 && los(x, z, eX[i], eZ[i])) { px = x; pz = z; yaw = -a; eYaw[i] = a; break; } } hurt(i, 1e5); break; } }
  return { live: Array.from(eState).map((v, i) => v < 2 && i < nE ? [v, Math.round(hypot(eX[i] - px, eZ[i] - pz))] : 0).filter(v => v), hasMG, m1: mag[1], r1: res[1], playT, map: MAP, nv: worldV.length / 32, nL, nE, eh: Array.from(eHp.subarray(0, 6)).map(Math.round), et: Array.from(eType.subarray(0, 6)), nBar, bSt: Array.from(bSt.subarray(0, nBar)), px, pz, hp, alive, state, weapon, mag: mag[weapon], res: res[weapon], reloadT, chasing: eState.filter(v => v === 1).length, nK: kOn.reduce((a, b) => a + b, 0) };
};
if (CAP) { window.__frame = (n = 1) => { for (let i = 0; i < n; i++) step(FIXDT || 1 / 60); return frameNo; }; window.__ready = 1; }
else requestAnimationFrame((t) => { lastNow = t; requestAnimationFrame(frame); });
