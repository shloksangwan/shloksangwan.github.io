// ============================================================
// Shlok Sangwan · portfolio
// Plain JS, no libraries. The hero is one WebGL fragment shader
// with three "channels" you can flip between.
// ============================================================

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.getElementById("year").textContent = new Date().getFullYear();

// ---------- Live shader field ----------
const CHANNELS = ["Topo", "Matrix", "Ripple"];

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;   // 0..1, y up
uniform float uMode;    // 0 topo, 1 matrix, 2 ripple
uniform float uGlitch;  // 1 -> 0 after a channel change

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

const vec3 INK    = vec3(0.95, 0.94, 0.91);
const vec3 ACCENT = vec3(1.0, 0.36, 0.13);
const vec3 LIVE   = vec3(0.24, 1.0, 0.54);

vec2 toSpace(vec2 frag) { return (frag - 0.5 * uRes) / uRes.y; }

// Channel 01: topographic contour lines that bulge around the cursor
vec3 topo(vec2 uv, vec2 m) {
  float t = uTime * 0.06;
  float d = length(uv - m);
  vec2 p = uv * 1.8;
  vec2 w = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float h = fbm(p + 1.6 * w) + 0.35 * exp(-d * d * 7.0);
  float bands = h * 18.0;
  float l = abs(fract(bands) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.0, 0.16, 1.0 - l);
  float major = step(4.5, mod(floor(bands), 5.0));
  vec3 col = INK * line * (0.42 + 0.5 * h);
  col = mix(col, ACCENT * line * 1.2, major);
  col += ACCENT * line * exp(-d * 3.0) * 0.9;
  return col;
}

// Channel 02: LED dot-matrix with a wave rolling out from the cursor
vec3 matrix(vec2 uv, vec2 m) {
  float cells = 46.0;
  vec2 g = uv * cells;
  vec2 cell = (floor(g) + 0.5) / cells;
  float d = length(cell - m);
  float wave = 0.5 + 0.5 * sin(d * 22.0 - uTime * 3.2);
  float field = fbm(cell * 3.0 + vec2(uTime * 0.12, 0.0));
  float v = clamp(wave * 0.75 + field - 0.5, 0.0, 1.0);
  v *= 0.5 + 0.5 * exp(-d * 1.2);
  float dotMask = 1.0 - smoothstep(0.3, 0.4, length(fract(g) - 0.5));
  vec3 col = ACCENT * smoothstep(0.05, 0.6, v);
  col = mix(col, INK, smoothstep(0.62, 0.8, v));
  return col * dotMask + vec3(0.07) * dotMask;
}

// Channel 03: interference rings from the cursor and two drifting sources
vec3 ripple(vec2 uv, vec2 m) {
  float t = uTime;
  vec2 a = vec2(0.55 * sin(t * 0.21), 0.3 * cos(t * 0.17));
  vec2 b = vec2(-0.6 * cos(t * 0.13), 0.35 * sin(t * 0.19));
  float s = sin(length(uv - m) * 26.0 - t * 2.4)
          + sin(length(uv - a) * 21.0 - t * 2.0)
          + sin(length(uv - b) * 23.0 - t * 1.7);
  float peak = smoothstep(0.9, 2.4, s);
  float rim = 1.0 - smoothstep(0.0, 0.12, abs(s - 0.9));
  vec3 col = ACCENT * peak;
  col = mix(col, INK, smoothstep(2.2, 2.85, s));
  col += LIVE * rim * 0.35;
  return col;
}

vec3 scene(vec2 frag, vec2 m) {
  vec2 uv = toSpace(frag);
  if (uMode < 0.5) return topo(uv, m);
  if (uMode < 1.5) return matrix(uv, m);
  return ripple(uv, m);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 m = toSpace(uMouse * uRes);

  // channel-change glitch: torn rows that slide sideways
  float row = floor(frag.y / (uRes.y * 0.035));
  float tear = (hash(vec2(row, floor(uTime * 24.0))) - 0.5) * uGlitch * uRes.x * 0.12;
  frag.x += tear;

  // chromatic split, stronger while glitching
  float off = (1.2 + uGlitch * 10.0) * (uRes.y / 900.0);
  vec3 col;
  col.r = scene(frag + vec2(off, 0.0), m).r;
  col.g = scene(frag, m).g;
  col.b = scene(frag - vec2(off, 0.0), m).b;

  // static snow during the switch
  float snow = hash(frag + fract(uTime) * 100.0);
  col = mix(col, vec3(snow), uGlitch * 0.65);

  // vignette
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 1.1;

  gl_FragColor = vec4(col, 1.0);
}
`;

function startField() {
  const canvas = document.getElementById("field");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return null; // CSS gradient background stays as the fallback

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ["uRes", "uTime", "uMouse", "uMode", "uGlitch"].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));

  // Render below native resolution: cheaper, and the softness suits the CRT look
  const SCALE = 0.6;
  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener("resize", resize);
  resize();

  const state = {
    mode: 0,
    glitch: 0,
    mouse: [0.68, 0.55],
    target: [0.68, 0.55],
    visible: true,
  };

  const hero = document.querySelector(".hero");
  hero.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    state.target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  });

  // Pause rendering when the hero is scrolled out of view
  new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    if (state.visible) requestAnimationFrame(frame);
  }).observe(hero);

  const hudX = document.getElementById("hud-x");
  const hudY = document.getElementById("hud-y");
  const hudFps = document.getElementById("hud-fps");
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  const t0 = last;

  function draw(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // ease the cursor so the field "follows" instead of snapping
    state.mouse[0] += (state.target[0] - state.mouse[0]) * Math.min(1, dt * 6);
    state.mouse[1] += (state.target[1] - state.mouse[1]) * Math.min(1, dt * 6);
    state.glitch = Math.max(0, state.glitch - dt * 2.6);

    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, (now - t0) / 1000);
    gl.uniform2f(u.uMouse, state.mouse[0], state.mouse[1]);
    gl.uniform1f(u.uMode, state.mode);
    gl.uniform1f(u.uGlitch, state.glitch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    hudX.textContent = state.mouse[0].toFixed(3);
    hudY.textContent = state.mouse[1].toFixed(3);
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) {
      hudFps.textContent = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0; fpsFrames = 0;
    }
  }

  function frame(now) {
    if (!state.visible) return;
    draw(now);
    if (!reduceMotion) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setMode(i) {
      state.mode = i;
      state.glitch = reduceMotion ? 0 : 1;
      if (reduceMotion) requestAnimationFrame(draw); // single still frame
    },
  };
}

const field = startField();

// ---------- Channel switching ----------
let channel = 0;
const chNum = document.getElementById("ch-num");
const chName = document.getElementById("ch-name");
const heroEl = document.querySelector(".hero");

function setChannel(i) {
  channel = (i + CHANNELS.length) % CHANNELS.length;
  chNum.textContent = String(channel + 1).padStart(2, "0");
  chName.textContent = CHANNELS[channel];
  if (field) field.setMode(channel);
  heroEl.classList.remove("switching");
  void heroEl.offsetWidth; // restart the CSS roll animation
  heroEl.classList.add("switching");
}

document.getElementById("ch-next").addEventListener("click", (e) => { e.stopPropagation(); setChannel(channel + 1); });
document.getElementById("ch-prev").addEventListener("click", (e) => { e.stopPropagation(); setChannel(channel - 1); });
document.getElementById("field").addEventListener("click", () => setChannel(channel + 1));
if (!field) document.querySelector(".hud-hint").textContent = "";

// ---------- Pune clock ----------
const hudTime = document.getElementById("hud-time");
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
const tick = () => (hudTime.textContent = clock.format(new Date()));
tick();
setInterval(tick, 15000);

// ---------- Mobile menu ----------
const menuBtn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
function toggleMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.firstChild.textContent = open ? "Close " : "Menu ";
  document.body.style.overflow = open ? "hidden" : "";
}
menuBtn.addEventListener("click", () => toggleMenu(menu.hidden));
menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => toggleMenu(false)));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) toggleMenu(false); });

// ---------- Scroll reveal + heading decode ----------
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/<>_";

function decode(el) {
  const final = el.dataset.text || el.textContent;
  el.dataset.text = final;
  if (reduceMotion) return;
  let frameN = 0;
  const total = 18;
  const timer = setInterval(() => {
    frameN++;
    el.textContent = final
      .split("")
      .map((ch, i) => {
        if (ch === " ") return " ";
        return i < (frameN / total) * final.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      })
      .join("");
    if (frameN >= total) {
      clearInterval(timer);
      el.textContent = final;
    }
  }, 40);
}

const revealTargets = document.querySelectorAll(".project, .spec-lg, .about, .contact-lead, .links-list");
revealTargets.forEach((el) => el.classList.add("reveal"));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      if (entry.target.classList.contains("decode")) decode(entry.target);
      else entry.target.classList.add("visible");
      io.unobserve(entry.target);
    });
  },
  { threshold: 0.15 }
);
revealTargets.forEach((el) => io.observe(el));
document.querySelectorAll(".decode").forEach((el) => io.observe(el));

// ---------- Highlight current section in the top bar ----------
const navLinks = [...document.querySelectorAll(".bar-nav a")];
const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href")));
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id));
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
sections.forEach((s) => s && spy.observe(s));
