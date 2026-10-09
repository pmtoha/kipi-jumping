
"use strict";

/* ================= canvas & helpers ================= */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1, groundY = 0;

const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixN = (a, b, t) => a + (b - a) * t;
const mixC = (a, b, t) => [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/* ================= day/night palette keyframes ================= */
/* Cycle: sunset -> night -> dawn -> day -> ... (full loop ~80s) */
const PAL_SRC = {
  sunset: { skyTop: "#472a3a", skyBot: "#ff9e5e", sunCol: "#ff9640", sun: 1,    moon: 0,    stars: 0,    cloud: 0.55,
            hillF: "#5a3040", hillN: "#3c2030", ground: "#8a4a3a", dash: "#a85f45", obst: "#241019" },
  night:  { skyTop: "#0a0f1e", skyBot: "#22303f", sunCol: "#c8d2e6", sun: 0,    moon: 1,    stars: 1,    cloud: 0.08,
            hillF: "#101826", hillN: "#0b101c", ground: "#1a2330", dash: "#2a3543", obst: "#05080d" },
  dawn:   { skyTop: "#3d5566", skyBot: "#ffc9a0", sunCol: "#ffbe82", sun: 0.5,  moon: 0.15, stars: 0.25, cloud: 0.35,
            hillF: "#4a5a68", hillN: "#33424e", ground: "#9a8a70", dash: "#b5a07e", obst: "#2e3a34" },
  day:    { skyTop: "#6fb7c9", skyBot: "#f6ead0", sunCol: "#fff2cd", sun: 0.9,  moon: 0,    stars: 0,    cloud: 0.6,
            hillF: "#e0a868", hillN: "#c9854e", ground: "#e8b877", dash: "#c99457", obst: "#5d7a4a" }
};
const CFIELDS = ["skyTop", "skyBot", "sunCol", "hillF", "hillN", "ground", "dash", "obst"];
const NFIELDS = ["sun", "moon", "stars", "cloud"];
const PAL_KEYS = ["sunset", "night", "dawn", "day"].map(k => {
  const p = PAL_SRC[k], o = {};
  CFIELDS.forEach(f => o[f] = hex2rgb(p[f]));
  NFIELDS.forEach(f => o[f] = p[f]);
  return o;
});
const CP = {}; // current interpolated palette
function computePalette() {
  const t = cycleT * 4, i = Math.floor(t) % 4, j = (i + 1) % 4;
  let u = t - Math.floor(t); u = u * u * (3 - 2 * u); // smoothstep
  const A = PAL_KEYS[i], B = PAL_KEYS[j];
  CFIELDS.forEach(f => CP[f] = mixC(A[f], B[f], u));
  NFIELDS.forEach(f => CP[f] = mixN(A[f], B[f], u));
}

/* ================= tuning ================= */
const GRAV = 0.82, JUMP_V = -15.4, DJUMP_V = -13.4, JUMP_CUT = -4.5, FASTFALL = 2.7;
const INK = "#2a2430", CREAM = "#f6eee2", CORAL = "#ff6b4a", GOLD = "#ffcf5c", GOLD_D = "#9a6d1d";

/* ================= state ================= */
let state = "menu";               // menu | play | pause | dead
let last = 0, time = 0;
let score = 0, coinCount = 0, comboCount = 0, lastCoinT = -9;
let best = +(localStorage.getItem("kipi.best") || 0);
let speed = 5.4, distAcc = 0, nextGap = 700, coinAcc = 0, nextCoin = 700;
let obstacles = [], coinsArr = [], particles = [], popups = [];
let shake = 0, deadT = 0, graceT = 0, cycleT = 0, lastTier = 0, newBest = false;
let bgFar = 0, bgNear = 0, gOff = 0;
let duckHeld = false;
const jumpPointers = new Set(), duckPointers = new Set();
let jumpKeyHeld = false;

/* ================= player ================= */
const P = {
  x: 60, y: 0, w: 46, h: 46,
  vy: 0, grounded: true, jumps: 0,
  stretch: 1, rot: 0, rotV: 0,
  runPhase: 0, blinkT: 2, blink: 0, buffer: 0,
  scarf: Array.from({ length: 7 }, () => ({ x: 0, y: 0 }))
};

/* ================= scenery ================= */
let stars = [], clouds = [], streaks = [];
function initStars() {
  stars = [];
  for (let i = 0; i < 60; i++) stars.push({
    x: Math.random() * W, y: Math.random() * H * 0.6,
    r: 0.6 + Math.random() * 1.2, tw: Math.random() * 6
  });
}
function initClouds() {
  clouds = [];
  for (let i = 0; i < 6; i++) clouds.push({
    x: Math.random() * W, y: 30 + Math.random() * H * 0.35,
    s: 0.5 + Math.random() * 0.8, spd: 0.6 + Math.random() * 0.8
  });
}
function initStreaks() {
  streaks = [];
  for (let i = 0; i < 6; i++) streaks.push({
    x: Math.random() * W, y: Math.random() * H * 0.6,
    len: 40 + Math.random() * 60, sp: 0.7 + Math.random() * 0.6
  });
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  groundY = H - 96;
  P.x = Math.max(60, W * 0.16);
  if (P.grounded || P.y + P.h > groundY) { P.y = groundY - P.h; P.vy = Math.min(P.vy, 0); }
  obstacles.forEach(o => {
    if (o.type === "b") { o.baseY = groundY - 52; o.y = o.baseY; }
    else o.y = groundY - o.h;
  });
  resetScarf();
  initStars();
}
window.addEventListener("resize", resize);

function resetScarf() {
  const ax = P.x + P.w / 2 - 6, ay = groundY - 36;
  P.scarf.forEach(p => { p.x = ax; p.y = ay; });
}

/* ================= audio (all synthesized, no files) ================= */
let AC = null, masterG, musicG, sfxG, delayN, noiseBuf = null;
let muted = localStorage.getItem("kipi.mute") === "1";
const BPM = 116, STEPD = 60 / BPM / 2;
let mStep = 0, mNext = 0, mTimer = null;
const BASS = [45, 0, 45, 0, 52, 0, 45, 0, 43, 0, 43, 0, 50, 0, 48, 0];
const LEAD = [69, 0, 64, 67, 0, 64, 62, 0, 69, 0, 72, 67, 64, 0, 60, 0];
const midi = m => 440 * Math.pow(2, (m - 69) / 12);

function initAudio() {
  if (AC) { if (AC.state === "suspended") AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    masterG = AC.createGain(); masterG.gain.value = muted ? 0 : 1; masterG.connect(AC.destination);
    sfxG = AC.createGain(); sfxG.gain.value = 0.9; sfxG.connect(masterG);
    musicG = AC.createGain(); musicG.gain.value = 0; musicG.connect(masterG);
    delayN = AC.createDelay(1); delayN.delayTime.value = 0.29;
    const fb = AC.createGain(); fb.gain.value = 0.32;
    const df = AC.createBiquadFilter(); df.type = "lowpass"; df.frequency.value = 2400;
    delayN.connect(df); df.connect(fb); fb.connect(delayN); df.connect(musicG);
    mTimer = setInterval(schedMusic, 40);
  } catch (e) { AC = null; }
}
function setMusic(on) { if (AC) musicG.gain.setTargetAtTime(on ? 0.16 : 0, AC.currentTime, 0.35); }
function startMusic() {
  if (!AC) return;
  mStep = 0; mNext = AC.currentTime + 0.06; setMusic(true);
}
function schedMusic() {
  if (!AC) return;
  if (state === "pause") { mNext = Math.max(mNext, AC.currentTime + 0.06); return; }
  while (mNext < AC.currentTime + 0.18) {
    if (state === "play") {
      const s = mStep;
      if (BASS[s]) pluck(midi(BASS[s]), mNext, 0.34, "triangle", 0.5, false);
      if (LEAD[s]) pluck(midi(LEAD[s]), mNext, 0.28, "square", 0.14, true);
      if (s % 2 === 1) hat(mNext);
    }
    mStep = (mStep + 1) % 16; mNext += STEPD;
  }
}
function pluck(f, t, dur, type, vol, lead) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(musicG);
  if (lead) g.connect(delayN);
  o.start(t); o.stop(t + dur + 0.05);
}
function getNoise() {
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function hat(t) {
  const src = AC.createBufferSource(); src.buffer = getNoise();
  const f = AC.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
  const g = AC.createGain();
  g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(f); f.connect(g); g.connect(musicG);
  src.start(t); src.stop(t + 0.06);
}
function tone(f0, f1, dur, type, vol, at) {
  if (!AC) return;
  const t = at || AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxG);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseSfx(dur, vol, freq, type) {
  if (!AC) return;
  const t = AC.currentTime;
  const src = AC.createBufferSource(); src.buffer = getNoise();
  const f = AC.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = freq;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxG);
  src.start(t); src.stop(t + dur + 0.05);
}
const sJump   = () => tone(300, 560, 0.12, "square", 0.2);
const sDouble = () => tone(420, 780, 0.14, "square", 0.2);
const sLand   = () => noiseSfx(0.08, 0.22, 500);
const sDuck   = () => noiseSfx(0.12, 0.1, 1200, "bandpass");
const sNear   = () => tone(1200, 1700, 0.09, "sine", 0.12);
function sCoin(c) {
  if (!AC) return;
  const t = AC.currentTime, base = 78 + Math.min(c, 12);
  tone(midi(base), midi(base), 0.09, "sine", 0.18, t);
  tone(midi(base + 7), midi(base + 7), 0.14, "sine", 0.15, t + 0.07);
}
function sHit() { tone(220, 45, 0.4, "sawtooth", 0.35); noiseSfx(0.3, 0.4, 900); }
function sBest() {
  if (!AC) return;
  const t = AC.currentTime;
  [660, 830, 990].forEach((f, i) => tone(f, f, 0.18, "sine", 0.16, t + i * 0.12));
}
function toggleMute() {
  muted = !muted;
  localStorage.setItem("kipi.mute", muted ? "1" : "0");
  if (AC) masterG.gain.setTargetAtTime(muted ? 0 : 1, AC.currentTime, 0.05);
  updateAudioIcon();
}

/* ================= game flow ================= */
function setState(s) {
  state = s;
  document.getElementById("btnPause").style.display = (s === "play" || s === "pause") ? "flex" : "none";
  document.getElementById("icoPause").style.display = s === "pause" ? "none" : "block";
  document.getElementById("icoResume").style.display = s === "pause" ? "block" : "none";
}
function resetRun() {
  score = 0; coinCount = 0; comboCount = 0; lastCoinT = -9;
  speed = 5.4; distAcc = 0; nextGap = 700; coinAcc = 0; nextCoin = 700;
  obstacles = []; coinsArr = []; particles = []; popups = [];
  shake = 0; deadT = 0; graceT = 0; lastTier = 0; newBest = false;
  P.y = groundY - P.h; P.vy = 0; P.grounded = true; P.jumps = 0;
  P.stretch = 1; P.rot = 0; P.rotV = 0; P.buffer = 0;
  resetScarf();
  setState("play");
  startMusic();
  if (window.matchMedia("(orientation: portrait)").matches) setState("pause");
}
function startRun() {
  goFullscreen();
  resetRun();
}
function die() {
  newBest = Math.floor(score) > best;
  if (newBest) { best = Math.floor(score); localStorage.setItem("kipi.best", best); }
  setState("dead"); deadT = 0; shake = 13;
  P.grounded = false; P.vy = -8; P.rotV = 0;
  burst(P.x + P.w / 2, P.y + P.h / 2, 26);
  sHit();
  if (newBest) setTimeout(sBest, 350);
  setMusic(false);
}
function togglePause() {
  if (state === "play") { setState("pause"); setMusic(false); }
  else if (state === "pause") { setState("play"); graceT = 0.15; setMusic(true); }
}
function goFullscreen() {
  try {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) fn.call(el);
    if (screen.orientation && screen.orientation.lock)
      screen.orientation.lock("landscape").catch(() => {});
  } catch (e) {}
}

/* ================= spawning ================= */
function spawnObstacle() {
  const r = Math.random();
  let o = { x: W + 80, scored: false, minGap: 999 };
  if (r < 0.5)      { o.type = "c";  o.w = 24 + Math.random() * 16; o.h = 46 + Math.random() * 36; o.v = Math.random(); }
  else if (r < 0.68){ o.type = "cc"; o.w = 56 + Math.random() * 26; o.h = 40 + Math.random() * 22; o.v = Math.random(); }
  else if (r < 0.86){ o.type = "r";  o.w = 46 + Math.random() * 26; o.h = 26 + Math.random() * 14; }
  else if (score >= 120) { o.type = "b"; o.w = 34; o.h = 22; o.baseY = groundY - 52; o.y = o.baseY; o.bob = 0; o.ph = Math.random() * 6; }
  else { o.type = "c"; o.w = 26; o.h = 52; o.v = Math.random(); }
  if (o.type !== "b") o.y = groundY - o.h;
  obstacles.push(o);
  nextGap = 300 + Math.random() * 320 + speed * 22;
}
function trySpawnCoins() {
  const n = 3 + (Math.random() * 3 | 0);
  const cx = W + 40, arc = Math.random() < 0.5, baseY = groundY - 40;
  for (const o of obstacles)
    if (o.x < cx + n * 34 + 60 && o.x + o.w > cx - 60) return; // don't overlap an obstacle
  for (let i = 0; i < n; i++) coinsArr.push({
    x: cx + i * 34,
    y: arc ? baseY - Math.sin(i / (n - 1) * Math.PI) * 70 : groundY - 95,
    t: Math.random() * 10
  });
}

/* ================= effects ================= */
function dustBurst(x, y, n, pow) {
  for (let i = 0; i < n; i++) particles.push({
    x: x + Math.random() * 12 - 6, y: y + Math.random() * 4,
    vx: -(1 + Math.random() * 2) * (pow || 1) + (Math.random() - 0.5),
    vy: -Math.random() * 2.4 * (pow || 1),
    g: 0.12, r: 2 + Math.random() * 3, t: 0,
    life: 0.4 + Math.random() * 0.35, col: rgb(CP.dash)
  });
}
function burst(x, y, n) {
  const cols = [CORAL, CREAM, "#3a2f38"];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      g: 0.25, r: 2 + Math.random() * 4, t: 0,
      life: 0.6 + Math.random() * 0.5, col: cols[i % 3]
    });
  }
}
function sparkle(x, y) {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      g: 0.05, r: 1.5 + Math.random() * 2, t: 0,
      life: 0.35 + Math.random() * 0.25, col: GOLD
    });
  }
}
function popup(x, y, txt, col) { popups.push({ x, y, txt, col, t: 0, life: 0.9 }); }

/* ================= player actions ================= */
function playerBox() {
  if (duckHeld && P.grounded)
    return { x: P.x + 4, y: groundY - 24, w: P.w - 8, h: 24 };
  return { x: P.x + 7, y: P.y + 4, w: P.w - 14, h: P.h - 6 };
}
function startJump(v) {
  P.vy = v; P.grounded = false; P.jumps++; P.stretch = 1.28;
  dustBurst(P.x + P.w / 2, groundY, 4, 1);
  (v === JUMP_V ? sJump : sDouble)();
}
function tryJump() {
  if (state !== "play" || graceT > 0) return;
  if (P.grounded) startJump(JUMP_V);
  else if (P.jumps < 2) { startJump(DJUMP_V); P.rotV = Math.PI * 2 / 0.38; }
  else P.buffer = 0.12;
}
function jumpCut() { if (P.vy < JUMP_CUT) P.vy = JUMP_CUT; }

/* ================= update ================= */
function update(f, dtSec) {
  shake = Math.max(0, shake - 0.6 * f);
  P.blinkT -= dtSec;
  if (P.blinkT <= 0) { P.blinkT = 1.6 + Math.random() * 2.8; P.blink = 0.12; }
  P.blink = Math.max(0, P.blink - dtSec);

  if (state === "menu") { updateAmbient(f, dtSec, 3.4); updateMenuPlayer(f); }
  if (state === "play") updatePlay(f, dtSec);
  if (state === "dead") updateDead(f, dtSec);
  updateFx(f, dtSec);
}

function updateAmbient(f, dtSec, sp) {
  cycleT = (cycleT + dtSec / 80) % 1;
  bgFar += sp * 0.16 * f;
  bgNear += sp * 0.34 * f;
  gOff += sp * f;
  clouds.forEach(c => {
    c.x -= (0.2 + sp * 0.05) * c.spd * f;
    if (c.x < -160 * c.s) { c.x = W + 60; c.y = 30 + Math.random() * H * 0.35; }
  });
}

// menu-only: the KiPi on the title screen runs in place
function updateMenuPlayer(f) {
  P.grounded = true;
  P.y = groundY - P.h;
  P.runPhase += 3.4 * 0.05 * f;
  if (Math.random() < 0.08 * f) dustBurst(P.x + 4, groundY, 1, 0.7);
  updateScarf(f);
}

function updatePlay(f, dtSec) {
  graceT = Math.max(0, graceT - dtSec);
  speed = Math.min(13, speed + 0.0011 * f);
  score += speed * f * 0.12;
  distAcc += speed * f;
  updateAmbient(f, dtSec, speed);

  // speed-up notification
  const tier = Math.floor((speed - 5.4) / 1.6);
  if (tier > lastTier) { lastTier = tier; popup(W / 2, H * 0.3, "SPEED UP", CORAL); tone(520, 780, 0.15, "sine", 0.12); }

  // buffered jump
  if (P.buffer > 0) {
    P.buffer -= dtSec;
    if (P.grounded) { P.buffer = 0; startJump(JUMP_V); }
  }

  // physics
  if (!P.grounded) {
    const g = GRAV * (duckHeld ? FASTFALL : 1);
    P.vy += g * f;
    P.y += P.vy * f;
    if (P.y + P.h >= groundY) {
      const impact = P.vy;
      P.y = groundY - P.h; P.vy = 0; P.grounded = true; P.jumps = 0; P.rot = 0; P.rotV = 0;
      if (impact > 5) {
        P.stretch = 0.72; dustBurst(P.x + P.w / 2, groundY, 6, 1.2); sLand();
        if (impact > 14) shake = Math.max(shake, Math.min(6, impact * 0.25));
      }
    }
  }
  if (P.rotV !== 0) { P.rot += P.rotV * f; if (P.rot >= Math.PI * 2) { P.rot = 0; P.rotV = 0; } }
  P.stretch += (1 - P.stretch) * Math.min(1, 0.15 * f);

  // spawns
  if (distAcc >= nextGap) { distAcc = 0; spawnObstacle(); }
  coinAcc += speed * f;
  if (coinAcc >= nextCoin) { coinAcc = 0; nextCoin = 520 + Math.random() * 640; trySpawnCoins(); }

  const hb = playerBox();

  // obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= speed * f;
    if (o.type === "b") { o.bob += f; o.y = o.baseY + Math.sin(o.bob * 0.1) * 2.5; }
    const ox = o.x + 3, ow = o.w - 6, oy = o.y + 3, oh = o.h - 3;
    const horiz = hb.x < ox + ow && hb.x + hb.w > ox;
    if (horiz) {
      const gap = Math.max(oy - (hb.y + hb.h), hb.y - (oy + oh));
      if (gap < 0) { die(); return; }
      o.minGap = Math.min(o.minGap, gap);
    } else if (!o.scored && o.minGap < 12 && o.x + o.w < hb.x) {
      o.scored = true; score += 15;
      popup(P.x + P.w / 2, P.y - 12, "close! +15", CORAL); sNear();
    }
    if (o.x + o.w < -40) obstacles.splice(i, 1);
  }

  // coins
  const pcx = P.x + P.w / 2, pcy = P.y + (duckHeld && P.grounded ? 13 : P.h / 2);
  for (let i = coinsArr.length - 1; i >= 0; i--) {
    const c = coinsArr[i];
    c.x -= speed * f; c.t += f;
    const dx = pcx - c.x, dy = pcy - (c.y + Math.sin(c.t * 0.1) * 3);
    if (dx * dx + dy * dy < 24 * 24) {
      comboCount = (time - lastCoinT < 1) ? comboCount + 1 : 1;
      lastCoinT = time;
      coinCount++; score += 8;
      sparkle(c.x, c.y); sCoin(comboCount);
      popup(c.x, c.y - 14, "+" + (8 + (comboCount > 1 ? 2 : 0)), GOLD);
      coinsArr.splice(i, 1);
    } else if (c.x < -30) coinsArr.splice(i, 1);
  }

  // wind streaks at high speed
  if (speed > 8.5) streaks.forEach(s => {
    s.x -= speed * 2.5 * s.sp * f;
    if (s.x < -s.len) { s.x = W + Math.random() * 200; s.y = Math.random() * H * 0.6; }
  });

  updateScarf(f);
}

function updateDead(f, dtSec) {
  deadT += dtSec;
  updateScarf(f);
  if (!P.grounded) {
    P.vy += GRAV * f; P.y += P.vy * f;
    if (P.y + P.h >= groundY) {
      P.y = groundY - P.h; P.vy = 0; P.grounded = true;
      shake = Math.max(shake, 4); dustBurst(P.x + P.w / 2, groundY, 8, 1.4);
    }
  }
  P.rot += (-1.45 - P.rot) * Math.min(1, 0.18 * f);
}

function updateFx(f, dtSec) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * f; p.y += p.vy * f; p.vy += p.g * f; p.t += dtSec;
    if (p.t > p.life) particles.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dtSec;
    if (popups[i].t > popups[i].life) popups.splice(i, 1);
  }
}

function updateScarf(f) {
  const duck = duckHeld && P.grounded;
  const ax = P.x + P.w / 2 - 6, ay = (P.y + P.h) - (duck ? 14 : 36) * P.stretch;
  const s = P.scarf;
  s[0].x = ax; s[0].y = ay;
  const k = Math.min(1, 0.5 * f);
  for (let i = 1; i < s.length; i++) {
    const tx = s[i - 1].x - 9, ty = s[i - 1].y + Math.sin(time * 9 - i * 0.9) * 1.6;
    s[i].x += (tx - s[i].x) * k;
    s[i].y += (ty - s[i].y) * k;
  }
}

/* ================= drawing ================= */
function hillPath(off, amp, wl, base) {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W + 24; x += 24) {
    const y = base + Math.sin((x + off) / wl) * amp + Math.sin((x + off) / (wl * 0.37) + 1.7) * amp * 0.45;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function drawWorld() {
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(CP.skyTop)); g.addColorStop(1, rgb(CP.skyBot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // stars
  if (CP.stars > 0.02) {
    ctx.fillStyle = "#ffe9d6";
    for (const s of stars) {
      ctx.globalAlpha = CP.stars * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + s.tw)));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // sun / moon
  if (CP.sun > 0.02) {
    ctx.globalAlpha = CP.sun;
    ctx.fillStyle = rgb(CP.sunCol);
    ctx.beginPath();
    ctx.arc(W * 0.74, groundY - 70 - CP.sun * H * 0.32, 30 + (1 - CP.sun) * 26, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (CP.moon > 0.02) {
    ctx.globalAlpha = CP.moon * 0.9;
    ctx.fillStyle = "#e8ecf2";
    ctx.beginPath(); ctx.arc(W * 0.26, H * 0.22, 22, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(150,160,180,0.35)";
    ctx.beginPath(); ctx.arc(W * 0.26 - 7, H * 0.22 - 4, 5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.26 + 6, H * 0.22 + 7, 3.5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // clouds
  if (CP.cloud > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${CP.cloud * 0.9})`;
    for (const c of clouds) {
      const cw = 70 * c.s, ch = 26 * c.s;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, cw, ch, 0, 0, 7);
      ctx.ellipse(c.x - cw * 0.6, c.y + ch * 0.2, cw * 0.6, ch * 0.7, 0, 0, 7);
      ctx.ellipse(c.x + cw * 0.6, c.y + ch * 0.2, cw * 0.6, ch * 0.7, 0, 0, 7);
      ctx.fill();
    }
  }

  // parallax hills
  ctx.fillStyle = rgb(CP.hillF); hillPath(bgFar, 42, 300, groundY - 24);
  ctx.fillStyle = rgb(CP.hillN); hillPath(bgNear, 22, 160, groundY + 4);

  // ground
  ctx.fillStyle = rgb(CP.ground);
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.globalAlpha = 0.8; ctx.fillStyle = rgb(CP.dash);
  ctx.fillRect(0, groundY, W, 4);
  ctx.globalAlpha = 0.5;
  const rows = [
    { y: groundY + 18, sp: 1,    w: 26, gap: 90 },
    { y: groundY + 44, sp: 0.66, w: 34, gap: 120 },
    { y: groundY + 72, sp: 0.45, w: 22, gap: 80 }
  ];
  for (const r of rows) {
    const off = -((gOff * r.sp) % r.gap);
    for (let x = off; x < W; x += r.gap) {
      ctx.beginPath(); ctx.roundRect(x, r.y, r.w, 3, 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawCoins() {
  for (const c of coinsArr) {
    const s = Math.max(0.18, Math.abs(Math.cos(c.t * 0.09)));
    const y = c.y + Math.sin(c.t * 0.1) * 3;
    ctx.save(); ctx.translate(c.x, y); ctx.scale(s, 1);
    ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_D; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.stroke();
    ctx.restore();
  }
}

function drawObstacles() {
  const fill = rgb(CP.obst);
  for (const o of obstacles) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(255,233,214,0.18)"; ctx.lineWidth = 1.5;
    if (o.type === "c") {
      ctx.beginPath();
      ctx.roundRect(o.x + o.w * 0.25, o.y, o.w * 0.5, o.h + 8, 8);
      ctx.fill(); ctx.stroke();
      if (o.v > 0.3) {
        const ay = o.y + o.h * 0.45;
        ctx.beginPath(); ctx.roundRect(o.x - 2, ay, o.w * 0.35, 7, 3); ctx.fill();
        ctx.beginPath(); ctx.roundRect(o.x - 2, ay - 13, 7, 15, 3); ctx.fill();
      }
      if (o.v < 0.75) {
        const ay = o.y + o.h * 0.3;
        ctx.beginPath(); ctx.roundRect(o.x + o.w * 0.68, ay, o.w * 0.36, 7, 3); ctx.fill();
        ctx.beginPath(); ctx.roundRect(o.x + o.w * 0.98, ay - 13, 7, 15, 3); ctx.fill();
      }
    } else if (o.type === "cc") {
      ctx.beginPath(); ctx.roundRect(o.x, o.y + o.h * 0.25, 14, o.h * 0.75 + 8, 6); ctx.fill();
      ctx.beginPath(); ctx.roundRect(o.x + o.w - 16, o.y, 16, o.h + 8, 7); ctx.fill();
    } else if (o.type === "r") {
      ctx.beginPath();
      ctx.moveTo(o.x, groundY + 4);
      ctx.quadraticCurveTo(o.x + o.w * 0.15, o.y + 4, o.x + o.w * 0.45, o.y);
      ctx.quadraticCurveTo(o.x + o.w * 0.85, o.y + 2, o.x + o.w, groundY + 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // bird
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const fl = Math.sin(time * 15 + o.ph);
      ctx.beginPath(); ctx.ellipse(cx, cy, 15, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 13, cy - 3); ctx.lineTo(cx + 22, cy - 1); ctx.lineTo(cx + 13, cy + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 13, cy); ctx.lineTo(cx - 22, cy - 4); ctx.lineTo(cx - 22, cy + 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - 2); ctx.lineTo(cx - 10, cy - 3 - 13 * fl); ctx.lineTo(cx + 7, cy - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffe9d6";
      ctx.beginPath(); ctx.arc(cx + 7, cy - 2, 1.6, 0, 7); ctx.fill();
    }
  }
}

function drawPlayer() {
  const duck = duckHeld && P.grounded;
  const footY = P.y + P.h;
  const cx = P.x + P.w / 2;
  const sy = P.stretch * (duck ? 0.58 : 1);
  const sx = 1 + (1 - P.stretch) * 0.7;

  // shadow
  const airH = groundY - footY;
  const shR = 24 * Math.max(0.4, 1 - airH / 240);
  ctx.fillStyle = "rgba(20,10,15,0.25)";
  ctx.beginPath(); ctx.ellipse(cx, groundY + 6, shR, shR * 0.28, 0, 0, 7); ctx.fill();

  // scarf trails behind the body
  ctx.fillStyle = CORAL;
  const s = P.scarf;
  for (let i = s.length - 1; i >= 0; i--) {
    ctx.beginPath(); ctx.arc(s[i].x, s[i].y, 7 - i * 0.8, 0, 7); ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, footY);
  ctx.rotate(P.rot);
  ctx.scale(sx, sy);

  // legs
  ctx.fillStyle = INK;
  if (P.grounded) {
    const a = Math.sin(P.runPhase) * 0.85;
    leg(-8, a); leg(8, -a);
  } else { leg(-8, -0.9); leg(8, 0.5); }

  // body
  ctx.fillStyle = CREAM; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(-23, -46, 46, 38, 13); ctx.fill(); ctx.stroke();

  // antenna
  const sway = Math.sin(time * 6) * 2 + (P.grounded ? Math.sin(P.runPhase * 0.5) * 1.5 : -3);
  ctx.beginPath(); ctx.moveTo(0, -45); ctx.quadraticCurveTo(sway * 0.4, -52, sway, -57); ctx.stroke();
  ctx.fillStyle = CORAL;
  ctx.beginPath(); ctx.arc(sway, -59, 4, 0, 7); ctx.fill(); ctx.stroke();

  // face
  const dead = state === "dead";
  for (const ex of [-8, 8]) {
    if (dead) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ex - 3, -36); ctx.lineTo(ex + 3, -30);
      ctx.moveTo(ex + 3, -36); ctx.lineTo(ex - 3, -30);
      ctx.stroke();
    } else {
      const eh = P.blink > 0 ? 1.6 : 10;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(ex - 3, -38 + (10 - eh) / 2, 6, eh, 3); ctx.fill();
      if (eh > 4) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath(); ctx.roundRect(ex - 1.6, -36, 2, 2.6, 1); ctx.fill();
      }
    }
  }
  if (!dead) {
    ctx.fillStyle = "rgba(255,107,74,0.45)";
    ctx.beginPath(); ctx.arc(-15, -25, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(15, -25, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -26, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  ctx.restore();
  function leg(offx, ang) {
    ctx.save();
    ctx.translate(offx, -9); ctx.rotate(ang);
    ctx.beginPath(); ctx.roundRect(-3.5, 0, 7, 11, 3); ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawPopups() {
  ctx.textAlign = "center";
  ctx.font = '16px "Titan One", cursive';
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = INK; ctx.fillText(p.txt, p.x + 1.5, p.y - p.t * 46 + 1.5);
    ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y - p.t * 46);
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
}
function drawWind() {
  if (speed <= 8.5 || state !== "play") return;
  ctx.strokeStyle = "rgba(255,238,220,1)";
  ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.globalAlpha = (speed - 8.5) / 4.5 * 0.22;
  for (const s of streaks) {
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function shadowText(txt, x, y, size, col, align, off) {
  ctx.font = `${size}px "Titan One", cursive`;
  ctx.textAlign = align || "left";
  ctx.fillStyle = "rgba(30,16,24,0.9)";
  ctx.fillText(txt, x + (off || 3), y + (off || 3));
  ctx.fillStyle = col;
  ctx.fillText(txt, x, y);
  ctx.textAlign = "left";
}

function drawHUD() {
  shadowText(String(Math.floor(score)), W - 24, 48, 36, CREAM, "right");
  ctx.font = '700 13px Outfit, sans-serif';
  ctx.fillStyle = "rgba(255,233,214,0.75)"; ctx.textAlign = "right";
  ctx.fillText("BEST " + best, W - 24, 70); ctx.textAlign = "left";

  // coin counter
  ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_D; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(28, 36, 10, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(28, 36, 4.5, 0, 7); ctx.stroke();
  shadowText(String(coinCount), 46, 44, 22, CREAM);
  if (comboCount > 1 && time - lastCoinT < 1.2) {
    ctx.font = '14px "Titan One", cursive';
    ctx.fillStyle = CORAL; ctx.fillText("x" + comboCount, 46, 64);
  }
}

function drawMenu() {
  ctx.fillStyle = "rgba(20,10,15,0.16)"; ctx.fillRect(0, 0, W, H);
  const cy = H * 0.36;
  const tSize = Math.min(92, H * 0.24);
  shadowText("KiPi", W / 2, cy, tSize, CREAM, "center", 5);
  ctx.fillStyle = CORAL;
  ctx.beginPath(); ctx.roundRect(W / 2 - 62, cy + 16, 124, 30, 15); ctx.fill();
  ctx.font = '700 16px Outfit, sans-serif'; ctx.textAlign = "center";
  ctx.fillStyle = CREAM; ctx.fillText("re.web", W / 2, cy + 37);

  ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 3);
  ctx.font = '600 18px Outfit, sans-serif'; ctx.fillStyle = CREAM;
  ctx.fillText("TAP OR PRESS SPACE", W / 2, cy + 92);
  ctx.globalAlpha = 1;

  if (best > 0) {
    ctx.font = '16px "Titan One", cursive';
    ctx.fillStyle = "rgba(255,233,214,0.85)";
    ctx.fillText("BEST " + best, W / 2, cy + 124);
  }
  ctx.font = '600 13px Outfit, sans-serif';
  ctx.fillStyle = "rgba(255,233,214,0.6)";
  ctx.fillText("SPACE / TAP jump  ·  press twice to double jump  ·  DOWN swipe to duck & dive", W / 2, H - 44);
  ctx.fillText("Developed by Toha", W / 2, H - 20);
  ctx.textAlign = "left";
}

function panel(w, h) {
  ctx.beginPath();
  ctx.roundRect(W / 2 - w / 2, H * 0.42 - h / 2, w, h, 18);
  ctx.fill(); ctx.stroke();
}
function drawDead() {
  ctx.fillStyle = "rgba(20,10,15,0.35)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(22,13,20,0.8)";
  ctx.strokeStyle = "rgba(255,233,214,0.25)"; ctx.lineWidth = 2;
  panel(Math.min(380, W - 60), 210);
  ctx.textAlign = "center";
  shadowText("WIPEOUT!", W / 2, H * 0.42 - 52, 36, CORAL, "center", 3);
  shadowText("SCORE  " + Math.floor(score), W / 2, H * 0.42 + 2, 26, CREAM, "center", 2.5);
  ctx.font = '600 15px Outfit, sans-serif';
  if (newBest) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 6);
    ctx.fillStyle = CORAL; ctx.fillText("NEW BEST!", W / 2, H * 0.42 + 30);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "rgba(255,233,214,0.8)";
    ctx.fillText("BEST  " + best, W / 2, H * 0.42 + 30);
  }
  if (deadT > 0.6) {
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 3);
    ctx.fillStyle = CREAM;
    ctx.fillText("TAP TO RUN AGAIN", W / 2, H * 0.42 + 68);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}
function drawPause() {
  ctx.fillStyle = "rgba(20,10,15,0.5)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(22,13,20,0.8)";
  ctx.strokeStyle = "rgba(255,233,214,0.25)"; ctx.lineWidth = 2;
  panel(300, 140);
  shadowText("PAUSED", W / 2, H * 0.42 - 6, 32, CREAM, "center", 3);
  ctx.font = '600 15px Outfit, sans-serif'; ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,233,214,0.8)";
  ctx.fillText("tap or press P to resume", W / 2, H * 0.42 + 30);
  ctx.textAlign = "left";
}

function render() {
  computePalette();
  ctx.save();
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawWorld();
  drawCoins();
  drawObstacles();
  drawParticles();
  drawPlayer();
  drawPopups();
  ctx.restore();
  drawWind();
  if (state === "play") drawHUD();
  if (state === "menu") drawMenu();
  if (state === "pause") drawPause();
  if (state === "dead") drawDead();
}

/* ================= input ================= */
canvas.addEventListener("pointerdown", e => {
  initAudio();
  if (state === "menu") { startRun(); return; }
  if (state === "dead") { if (deadT > 0.6) resetRun(); return; }
  if (state === "pause") { togglePause(); return; }
  // duck pad: bottom-right circle on touch devices
  if (e.pointerType !== "mouse") {
    const dx = e.clientX - (W - 74), dy = e.clientY - (H - 74);
    if (dx * dx + dy * dy < 52 * 52) {
      duckPointers.add(e.pointerId); duckHeld = true; sDuck(); return;
    }
  }
  jumpPointers.add(e.pointerId);
  tryJump();
});
function pointerRelease(e) {
  if (jumpPointers.delete(e.pointerId) && jumpPointers.size === 0 && !jumpKeyHeld) jumpCut();
  if (duckPointers.delete(e.pointerId) && duckPointers.size === 0) duckHeld = false;
}
window.addEventListener("pointerup", pointerRelease);
window.addEventListener("pointercancel", pointerRelease);

window.addEventListener("keydown", e => {
  if (e.repeat) return;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault(); initAudio();
    if (state === "menu") startRun();
    else if (state === "dead") { if (deadT > 0.6) resetRun(); }
    else if (state === "pause") togglePause();
    else { jumpKeyHeld = true; tryJump(); }
  }
  if (e.code === "ArrowDown" || e.code === "KeyS") {
    e.preventDefault();
    if (!duckHeld) sDuck();
    duckHeld = true;
  }
  if (e.code === "KeyP" || e.code === "Escape") togglePause();
  if (e.code === "KeyM") toggleMute();
});
window.addEventListener("keyup", e => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    jumpKeyHeld = false;
    if (jumpPointers.size === 0) jumpCut();
  }
  if (e.code === "ArrowDown" || e.code === "KeyS") duckHeld = false;
});

const btnAudio = document.getElementById("btnAudio");
btnAudio.addEventListener("pointerdown", e => { e.stopPropagation(); initAudio(); toggleMute(); });
document.getElementById("btnPause").addEventListener("pointerdown", e => { e.stopPropagation(); togglePause(); });
function updateAudioIcon() {
  document.getElementById("icoSoundOn").style.display = muted ? "none" : "block";
  document.getElementById("icoSoundOff").style.display = muted ? "block" : "none";
}
updateAudioIcon();

window.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "play") togglePause(); });
window.matchMedia("(orientation: portrait)").addEventListener("change", ev => {
  if (ev.matches && state === "play") togglePause();
});

/* ================= boot ================= */
resize();
initClouds();
initStreaks();
resetScarf();
if (document.fonts && document.fonts.load) {
  document.fonts.load('20px "Titan One"');
  document.fonts.load('600 14px Outfit');
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  const dtms = Math.min(ts - last, 50); // clamp so tab-switches don't teleport the world
  last = ts;
  const f = dtms / 16.6667, dtSec = dtms / 1000;
  time += dtSec;
  update(f, dtSec);
  render();
}
requestAnimationFrame(frame);
