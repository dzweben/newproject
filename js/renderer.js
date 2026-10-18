// WebGL2 renderer with two passes.
// 1. Geometry: lit triangle chunks for ground scenes (terrain, water, city facades).
// 2. Particles: additive points with per-kind motion, layered over the geometry.

const PVS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aCol;
in float aSize;
in float aKind;
in vec3 aAnchor;
in vec3 aAxis;
in float aSeed;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime, uBass, uBeat, uSpin, uDiff, uPx, uDpr, uFog, uWave, uWrap, uDensity, uMid, uHigh, uBreath;
out vec3 vCol;
out float vA;
void main() {
  vec3 p = aPos;
  float t = uTime;
  float sd = aSeed;
  int k = int(aKind + 0.5);
  float alpha = 1.0;

  if (uDiff > 0.0) {
    float a = uSpin * uDiff / (length(p.xz) + 0.25);
    float ca = cos(a), sa = sin(a);
    p.xz = mat2(ca, sa, -sa, ca) * p.xz;
  }
  if (k == 9) {
    // Electrons orbit their nucleus around their own shell's normal, faster when closer.
    vec3 d = p - aAnchor;
    float ang = t * 0.9 / (length(d) + 0.05);
    vec3 ax = normalize(aAxis);
    d = d * cos(ang) + cross(ax, d) * sin(ang) + ax * dot(ax, d) * (1.0 - cos(ang));
    p = aAnchor + d;
  }
  if (k == 1) {
    p.x = mod(p.x + uWrap * 0.5 + t * (3.0 + 3.0 * sd), uWrap) - uWrap * 0.5;
  } else if (k == 2) {
    p.z = mod(p.z + uWrap * 0.5 + t * (3.0 + 3.0 * sd), uWrap) - uWrap * 0.5;
  } else if (k == 3) {
    p.y += uWave * (sin(p.x * 0.9 + t * 1.3) * 0.5 + sin(p.z * 1.3 - t * 1.1) * 0.35 + sin((p.x + p.z) * 0.5 + t * 0.7) * 0.25);
  } else if (k == 4) {
    float h = max(0.0, p.y - aAnchor.y);
    float s = sin(t * 1.6 + aAnchor.x * 0.7 + aAnchor.z * 0.5 + sd * 2.0) * 0.05 * (1.0 + 3.0 * uMid);
    p.x += s * h;
    p.z += s * 0.6 * h;
  } else if (k == 5) {
    float r = fract(sd + t * (0.06 + 0.08 * fract(sd * 7.3)));
    p.y += r * 4.5 * (1.0 + 0.8 * uBeat);
    p.x += sin(t * 1.3 + sd * 20.0) * 0.35 * r;
    p.z += cos(t * 1.1 + sd * 13.0) * 0.35 * r;
    alpha = 1.0 - r;
  } else if (k == 6) {
    p.y += 0.12 * sin(t * 0.9 + aAnchor.x * 1.7 + aAnchor.z * 1.3);
    float pu = 1.0 + (0.06 + 0.12 * uBeat + 0.06 * uBass) * sin(t * 2.6 + sd * 6.28);
    float py = 1.0 - (0.04 + 0.08 * uBeat) * sin(t * 2.6 + sd * 6.28);
    vec3 d = p - aAnchor;
    p = aAnchor + vec3(d.x * pu, d.y * py, d.z * pu);
  } else if (k == 7) {
    p.y += 0.12 * sin(t * 0.9 + aAnchor.x * 1.7 + aAnchor.z * 1.3);
    float h = max(0.0, aAnchor.y - p.y);
    p.x += sin(t * 2.2 + sd * 6.28 + h * 3.0) * 0.09 * h * (1.0 + 2.5 * uMid);
    p.z += cos(t * 1.8 + sd * 4.0 + h * 2.5) * 0.09 * h * (1.0 + 2.5 * uMid);
  } else if (k == 10) {
    p += (0.035 + 0.05 * uMid) * vec3(sin(t * 0.7 + sd * 31.0), sin(t * 0.5 + sd * 17.0), cos(t * 0.6 + sd * 47.0));
  }

  // Whole-scene breath: swells on bass and beats, and shimmers with the top end.
  float pulse = 1.0 + uBreath * (0.10 * uBass + 0.08 * uBeat);
  p *= pulse;
  p += uBreath * uHigh * 0.018 * vec3(sin(t * 7.0 + sd * 40.0), cos(t * 6.1 + sd * 23.0), sin(t * 5.3 + sd * 11.0));
  vec4 vp = uView * vec4(p, 1.0);
  gl_Position = uProj * vp;
  float depth = max(0.1, -vp.z);
  float fog = exp(-depth * uFog);
  gl_PointSize = min(48.0, aSize * uPx * uDpr * uDensity * clamp(4.0 / depth, 0.2, 12.0));
  vec3 c = aCol * (0.8 + 0.12 * uBeat + 0.05 * uBass) * mix(0.7, 1.0, uDensity);
  if (k == 8) c *= 0.7 + 0.45 * sin(t * 2.0 + sd * 40.0) + 0.5 * uHigh;
  vCol = c * fog;
  vA = alpha;
}`;

const PFS = `#version 300 es
precision mediump float;
in vec3 vCol;
in float vA;
uniform float uSolid;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float glow = exp(-d * 3.2);
  float disc = 1.0 - smoothstep(0.3, 1.0, d);
  float a = mix(glow, disc, uSolid) * vA;
  if (a < 0.02) discard;
  o = vec4(vCol * a * mix(0.6, 0.45, uSolid), 1.0);
}`;

const MVS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNrm;
in vec3 aCol;
in float aEmi;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uTime, uWave, uMode;
out vec3 vPos;
out vec3 vNrm;
out vec3 vCol;
out float vEmi;
void main() {
  vec3 p = aPos;
  vec3 n = aNrm;
  if (uMode > 1.5 && uMode < 2.5) {
    float a = p.x * 0.9 + uTime * 1.3, b = p.z * 1.3 - uTime * 1.1, c = (p.x + p.z) * 0.5 + uTime * 0.7;
    p.y += uWave * (sin(a) * 0.5 + sin(b) * 0.35 + sin(c) * 0.25);
    float dwdx = 0.45 * cos(a) + 0.125 * cos(c);
    float dwdz = 0.455 * cos(b) + 0.125 * cos(c);
    n = normalize(vec3(-uWave * dwdx, 1.0, -uWave * dwdz));
  }
  vPos = p;
  vNrm = n;
  vCol = aCol;
  vEmi = aEmi;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

const MFS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNrm;
in vec3 vCol;
in float vEmi;
uniform float uTime, uFog, uMode, uBeat;
uniform vec3 uCam;
out vec4 o;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 n = normalize(vNrm);
  vec3 L = normalize(vec3(-0.45, 0.85, 0.3));
  float diff = max(dot(n, L), 0.0);
  vec3 amb = mix(vec3(0.05, 0.055, 0.085), vec3(0.12, 0.14, 0.21), n.y * 0.5 + 0.5);
  vec3 col = vCol * (amb + diff * 0.5);

  if (uMode > 0.5 && uMode < 1.5) {
    vec3 an = abs(n);
    if (an.y < 0.5 && vPos.y > 0.8) {
      float u = an.x > an.z ? vPos.z : vPos.x;
      vec2 g = vec2(u / 1.1 + 0.5, (vPos.y - 0.8) / 1.2 + 0.5);
      vec2 id = floor(g), f = fract(g);
      float inwin = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.8);
      float r = h1(id);
      float lit = step(0.42, r);
      vec3 wc = h1(id + 3.7) > 0.6 ? vec3(0.55, 0.85, 1.0) : vec3(1.0, 0.8, 0.5);
      float flick = 0.92 + 0.08 * sin(uTime * 0.8 + r * 60.0);
      vec3 win = wc * (lit * 1.3 * flick + 0.035) * (1.0 + 1.2 * uBeat);
      col = mix(col, win, inwin);
    }
  }

  if (uMode > 1.5 && uMode < 2.5) {
    vec3 V = normalize(uCam - vPos);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col = mix(col, vec3(0.42, 0.58, 0.68), 0.2 + 0.5 * fres);
    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 140.0) * 1.1;
  }

  col += vec3(1.0, 0.42, 0.1) * vEmi * (1.1 + 0.3 * sin(uTime * 2.0 + vPos.x * 3.0 + vPos.z * 2.0) + 0.8 * uBeat) * 1.6;

  float depth = length(vPos - uCam);
  float f = exp(-depth * uFog);
  vec3 bg = vec3(0.012, 0.014, 0.03);
  o = vec4(mix(bg, col, f), 1.0);
}`;

const ATTRIBS = { aPos: 3, aCol: 3, aSize: 1, aKind: 1, aAnchor: 3, aAxis: 3, aSeed: 1 };
const MATTRIBS = { aPos: 3, aNrm: 3, aCol: 3, aEmi: 1 };
const MESH_KEYS = { aPos: 'pos', aNrm: 'nrm', aCol: 'col', aEmi: 'emi' };
const PUNI = ['uView', 'uProj', 'uTime', 'uBass', 'uBeat', 'uSpin', 'uDiff', 'uPx', 'uDpr', 'uFog', 'uWave', 'uWrap', 'uSolid', 'uDensity', 'uMid', 'uHigh', 'uBreath'];
const MUNI = ['uView', 'uProj', 'uTime', 'uWave', 'uMode', 'uFog', 'uCam', 'uBeat'];

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This visual needs WebGL 2. Try a current Chrome, Edge, Firefox or Safari.');

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const link = (vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const prog = link(PVS, PFS);
  const mprog = link(MVS, MFS);
  const PU = {}, MU = {};
  gl.useProgram(prog);
  for (const n of PUNI) PU[n] = gl.getUniformLocation(prog, n);
  gl.useProgram(mprog);
  for (const n of MUNI) MU[n] = gl.getUniformLocation(mprog, n);

  const particleVao = gl.createVertexArray();
  gl.bindVertexArray(particleVao);
  const buffers = {};
  function bind(state) {
    gl.useProgram(prog);
    for (const name of Object.keys(ATTRIBS)) {
      const data = state[name];
      const loc = gl.getAttribLocation(prog, name);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, ATTRIBS[name], gl.FLOAT, false, 0, 0);
      }
      buffers[name] = { buf, data };
    }
  }
  function upload(name) {
    const { buf, data } = buffers[name];
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  // Geometry chunks. Each chunk gets its own VAO; old ones are released on replacement.
  let chunks = [];
  function setMesh(list) {
    for (const c of chunks) {
      gl.deleteVertexArray(c.vao);
      for (const b of c.bufs) gl.deleteBuffer(b);
    }
    chunks = [];
    if (!list) return;
    for (const ch of list) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bufs = [];
      for (const [name, comps] of Object.entries(MATTRIBS)) {
        const data = ch[MESH_KEYS[name]];
        const loc = gl.getAttribLocation(mprog, name);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
        }
        bufs.push(buf);
      }
      chunks.push({ vao, bufs, mode: ch.mode, count: ch.count });
    }
    gl.bindVertexArray(null);
  }

  function resize(w, h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  // f: { view, proj, cam, time, bass, beat, spin, diff, px, dpr, fog, wave, wrap, solid, n }
  function draw(f) {
    gl.clearColor(0.012, 0.014, 0.03, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (chunks.length) {
      gl.useProgram(mprog);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.uniformMatrix4fv(MU.uView, false, f.view);
      gl.uniformMatrix4fv(MU.uProj, false, f.proj);
      gl.uniform1f(MU.uTime, f.time);
      gl.uniform1f(MU.uWave, f.wave);
      gl.uniform1f(MU.uBeat, f.beat);
      gl.uniform1f(MU.uFog, f.fog);
      gl.uniform3f(MU.uCam, f.cam[0], f.cam[1], f.cam[2]);
      for (const c of chunks) {
        gl.bindVertexArray(c.vao);
        gl.uniform1f(MU.uMode, c.mode);
        gl.drawArrays(gl.TRIANGLES, 0, c.count);
      }
      gl.bindVertexArray(null);
    }

    gl.useProgram(prog);
    gl.bindVertexArray(particleVao);
    gl.uniformMatrix4fv(PU.uView, false, f.view);
    gl.uniformMatrix4fv(PU.uProj, false, f.proj);
    gl.uniform1f(PU.uTime, f.time);
    gl.uniform1f(PU.uBass, f.bass);
    gl.uniform1f(PU.uBeat, f.beat);
    gl.uniform1f(PU.uSpin, f.spin);
    gl.uniform1f(PU.uDiff, f.diff);
    gl.uniform1f(PU.uPx, f.px);
    gl.uniform1f(PU.uDpr, f.dpr);
    gl.uniform1f(PU.uFog, f.fog);
    gl.uniform1f(PU.uWave, 0);
    gl.uniform1f(PU.uWrap, f.wrap);
    gl.uniform1f(PU.uMid, f.mid);
    gl.uniform1f(PU.uHigh, f.high);
    gl.uniform1f(PU.uBreath, f.breath);
    gl.uniform1f(PU.uDensity, f.density);
    gl.uniform1f(PU.uSolid, f.solid ? 1 : 0);

    if (f.solid) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.POINTS, 0, f.n);
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);
    } else if (chunks.length) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, f.n);
    gl.depthMask(true);
  }

  return { bind, upload, setMesh, resize, draw };
}
