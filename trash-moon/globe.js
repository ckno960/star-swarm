// 실제 행성 지도(Solar System Scope, NASA)를 WebGL로 공에 입혀 그린다.
// 바위 행성은 표면 밝기로 요철을 만들어 충돌구가 입체로 보이고, 가스 행성은 가장자리가 어두워지며 대기가 빛난다.
// 토성 고리는 행성 그림자를 받고, 행성에도 고리 그림자가 진다. 낮 하늘에서는 어두운 쪽이 하늘에 묻힌다.

export const BODIES = {
  pluto: { tex: 'pluto', kind: 0, bump: 1.6, roll: 0.25, pitch: 0.15, spin: 0.006 },
  europa: { tex: 'europa', kind: 0, bump: 1.0, roll: 0.1, pitch: 0.05, spin: 0.008 },
  moon: { tex: 'moon', kind: 0, bump: 2.2, roll: 0.05, pitch: 0.05, spin: 0.004 },
  io: { tex: 'io', kind: 0, bump: 0.9, roll: 0.05, pitch: 0.05, spin: 0.01 },
  mercury: { tex: 'mercury', kind: 0, bump: 2.6, roll: 0.02, pitch: 0.02, spin: 0.005 },
  titan: { tex: 'titan', kind: 1, bump: 0, roll: 0.3, pitch: 0.1, spin: 0.004, atmo: '#e8b070', atmoK: 0.8, halo: 0.12, haze: 0.35, hazeC: '#c99a5c' },
  ganymede: { tex: 'ganymede', kind: 0, bump: 1.4, roll: 0.05, pitch: 0.05, spin: 0.007 },
  mars: { tex: 'mars', kind: 0, bump: 1.1, roll: 0.35, pitch: 0.2, spin: 0.012, atmo: '#ffb090', atmoK: 0.25, halo: 0.035 },
  venus: { tex: 'venus', kind: 1, bump: 0, roll: 0.05, pitch: 0.03, spin: 0.003, atmo: '#fff2d6', atmoK: 0.6, halo: 0.06 },
  neptune: { tex: 'neptune', kind: 1, bump: 0, roll: 0.45, pitch: 0.2, spin: 0.02, atmo: '#9ccaff', atmoK: 0.75, halo: 0.05 },
  uranus: { tex: 'uranus', kind: 1, bump: 0, roll: 1.35, pitch: 0.3, spin: 0.015, atmo: '#c4f4ff', atmoK: 0.65, halo: 0.05, ring: 'faint', ringIn: 1.55, ringOut: 2.05 },
  saturn: { tex: 'saturn', kind: 1, bump: 0, roll: -0.32, pitch: 0.42, spin: 0.025, atmo: '#fff0d4', atmoK: 0.35, halo: 0.035, ring: 'saturn_ring', ringIn: 1.22, ringOut: 2.3 },
  jupiter: { tex: 'jupiter', kind: 1, bump: 0, roll: 0.05, pitch: 0.05, spin: 0.03, atmo: '#ffe8d2', atmoK: 0.35, halo: 0.04 },
  earth: { tex: 'earth', kind: 1, bump: 0, roll: 0.4, pitch: 0.15, spin: 0.01, atmo: '#7ab8ff', atmoK: 0.9, halo: 0.06 },
};
export const AVG_COLOR = {
  pluto: '#c8b8a4', europa: '#d8ccb8', moon: '#a8a6a0', io: '#d8c070', mercury: '#9c968e', titan: '#d89a48', ganymede: '#a09888',
  mars: '#b8643c', venus: '#e8d8b0', neptune: '#4070d0', uranus: '#9adce8', saturn: '#dcc490', jupiter: '#d0b08a', earth: '#4a7ab8',
};

const VERT = `attribute vec2 aPos; uniform float uS; varying vec2 vP; void main(){ vP = aPos * uS; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `precision highp float;
varying vec2 vP;
uniform sampler2D uTex; uniform sampler2D uRingTex;
uniform vec2 uTexel; uniform float uRot; uniform mat3 uOrient; uniform vec3 uL;
uniform float uKind, uBump, uAtmoK, uHalo, uHaze, uHeat, uDay, uPx;
uniform vec3 uAtmo, uHazeC;
uniform float uRingMode, uRingIn, uRingOut;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 toView(vec3 v){ return vec3(dot(uOrient[0], v), dot(uOrient[1], v), dot(uOrient[2], v)); }
vec4 ringSample(float rr){
  if (rr < uRingIn || rr > uRingOut) return vec4(0.0);
  float t = (rr - uRingIn) / (uRingOut - uRingIn);
  if (uRingMode > 1.5) {   // 천왕성: 가늘고 희미한 고리 몇 줄
    float a = 0.0;
    a += (1.0 - smoothstep(0.0, 0.008, abs(t - 0.18))) * 0.12;
    a += (1.0 - smoothstep(0.0, 0.007, abs(t - 0.42))) * 0.1;
    a += (1.0 - smoothstep(0.0, 0.012, abs(t - 0.9))) * 0.28;
    return vec4(vec3(0.86, 0.9, 0.95), a);
  }
  return texture2D(uRingTex, vec2(t, 0.5));
}
vec4 over(vec4 front, vec4 back){ return front + back * (1.0 - front.a); }
void main(){
  vec2 p = vP;
  float r2 = dot(p, p), r = sqrt(r2);
  vec3 rn = vec3(uOrient[0][1], uOrient[1][1], uOrient[2][1]);   // 고리 면의 법선(행성 자전축)
  float zs = -1e9;
  vec4 planet = vec4(0.0);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2); zs = z;
    vec3 n = vec3(p, z);
    vec3 nb = uOrient * n;
    float lon = atan(nb.x, nb.z), lat = asin(clamp(nb.y, -1.0, 1.0));
    vec2 uv = vec2(uRot + lon / 6.2831853, 0.5 - lat / 3.1415927);
    vec3 col = texture2D(uTex, uv).rgb;
    vec3 N = n;
    if (uBump > 0.0) {   // 표면 밝기로 요철: 해 반대쪽 경사가 어두워져 충돌구가 입체로
      float hx = lum(texture2D(uTex, uv + vec2(uTexel.x, 0.0)).rgb) - lum(texture2D(uTex, uv - vec2(uTexel.x, 0.0)).rgb);
      float hy = lum(texture2D(uTex, uv + vec2(0.0, uTexel.y)).rgb) - lum(texture2D(uTex, uv - vec2(0.0, uTexel.y)).rgb);
      vec3 eb = normalize(vec3(nb.z, 0.0, -nb.x) + vec3(1e-5));
      vec3 east = toView(eb);
      vec3 north = cross(n, east);
      N = normalize(n - uBump * (hx * east - hy * north));
    }
    float mu0 = dot(N, uL), mu = max(z, 0.04), shade;
    if (uKind < 0.5) {   // 공기 없는 천체: 가장자리까지 고르게 밝다(로멜-젤리거)
      float m0 = max(mu0, 0.0);
      shade = 1.6 * m0 / (m0 + mu) * 0.8 + 0.25 * m0;
    } else {             // 가스 행성: 부드러운 명암 경계 + 가장자리 어둡게
      shade = clamp((mu0 + 0.1) / 1.1, 0.0, 1.0);
      shade *= mix(1.0, pow(mu, 0.45), 0.55);
    }
    if (uRingMode > 0.5) {   // 고리 그림자
      float d = dot(uL, rn);
      if (abs(d) > 1e-3) { float s = -dot(n, rn) / d; if (s > 0.0) shade *= 1.0 - ringSample(length(n + uL * s)).a * 0.8; }
    }
    vec3 c = col * shade;
    c += uAtmo * pow(1.0 - mu, 3.0) * uAtmoK * clamp(mu0 * 1.5 + 0.35, 0.0, 1.0);
    c = mix(c, uHazeC * clamp(mu0 + 0.3, 0.0, 1.0), uHaze);
    c += vec3(1.0, 0.3, 0.07) * uHeat * (1.0 - clamp(mu0 * 2.0 + 0.2, 0.0, 1.0)) * (0.3 + 0.7 * lum(col));
    float a = 1.0 - smoothstep(1.0 - uPx * 1.5, 1.0, r);   // 가장자리 계단 없애기
    a *= mix(1.0, clamp(lum(c) * 1.9 + 0.04, 0.0, 1.0), uDay);   // 낮에는 그늘진 쪽이 하늘빛에 묻힘
    planet = vec4(c * a, a);
  }
  vec4 acc = vec4(0.0);
  if (uAtmoK > 0.0 && r > 1.0 - uPx * 2.0 && r < 1.0 + uHalo) {   // 바깥 대기
    vec3 rd = normalize(vec3(p, 0.0));
    float lit = smoothstep(-0.35, 0.75, dot(rd, uL)) + uHeat * 0.6;
    float ha = exp(-max(r - 1.0, 0.0) / uHalo * 4.0) * uAtmoK * 0.75 * lit * (1.0 - 0.5 * uDay);
    vec3 hc = mix(uAtmo, vec3(1.0, 0.45, 0.2), uHeat * 0.7);
    acc = vec4(hc * ha, ha);
  }
  vec4 ring = vec4(0.0); float zr = -1e9;
  if (uRingMode > 0.5 && abs(rn.z) > 1e-3) {
    float z = -(p.x * rn.x + p.y * rn.y) / rn.z;
    vec3 q = vec3(p, z);
    vec4 rs = ringSample(length(q));
    if (rs.a > 0.0) {
      float b = dot(q, uL), cc = dot(q, q) - 1.0, disc = b * b - cc;
      float lit = (disc > 0.0 && -b - sqrt(disc) > 0.0) ? 0.06 : 1.0;   // 행성 그림자
      lit *= 0.8 + 0.2 * abs(dot(rn, uL));
      float ra = rs.a * 0.95 * (1.0 - 0.25 * uDay);
      ring = vec4(rs.rgb * lit * ra, ra);
      zr = z;
    }
  }
  if (zr < zs) { acc = over(ring, acc); acc = over(planet, acc); }
  else { acc = over(planet, acc); acc = over(ring, acc); }
  gl_FragColor = acc;
}`;

function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

export function createGlobe(base = './textures/') {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uS', 'uTex', 'uRingTex', 'uTexel', 'uRot', 'uOrient', 'uL', 'uKind', 'uBump', 'uAtmoK', 'uHalo', 'uHaze', 'uHeat', 'uDay', 'uPx', 'uAtmo', 'uHazeC', 'uRingMode', 'uRingIn', 'uRingOut']) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uRingTex, 1);
  const L = (() => { const v = [-0.45, 0.32, 0.83], m = Math.hypot(...v); return v.map((x) => x / m); })();   // 해: 왼쪽 위 앞
  gl.uniform3fv(U.uL, L);

  const textures = new Map();
  function load(name, ring = false) {
    if (textures.has(name)) return textures.get(name);
    const entry = { ready: false, tex: null, w: 1, h: 1 };
    textures.set(name, entry);
    const img = new Image();
    img.onload = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      if (ring) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      } else {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext && !ring) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      Object.assign(entry, { ready: true, tex: t, w: img.width, h: img.height });
    };
    img.src = base + name + (ring ? '.png' : '.jpg');
    return entry;
  }
  const blank = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.activeTexture(gl.TEXTURE0);

  function preload(id) {
    const b = BODIES[id]; if (!b) return false;
    const t = load(b.tex);
    let ok = t.ready;
    if (b.ring && b.ring !== 'faint') ok = load(b.ring, true).ready && ok;
    return ok;
  }

  // 행성 하나를 그린 캔버스를 돌려준다. extent: 캔버스 반폭(행성 반지름 단위)
  function render(id, Rdev, t, { heat = 0, day = 0 } = {}) {
    const b = BODIES[id];
    if (!b || !preload(id)) return null;
    const S = b.ring ? b.ringOut + 0.05 : 1 + (b.halo || 0) + 0.03;
    const size = Math.max(8, Math.min(2048, Math.ceil(2 * S * Rdev)));
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const tex = textures.get(b.tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.ring && b.ring !== 'faint' ? textures.get(b.ring).tex : blank);
    gl.activeTexture(gl.TEXTURE0);
    // 자전축: 화면 안에서 roll만큼 기울고, pitch만큼 우리 쪽으로 숙임(보이는 쪽 → 행성 좌표)
    const cr = Math.cos(b.roll), sr = Math.sin(b.roll), cp = Math.cos(b.pitch), sp = Math.sin(b.pitch);
    // R = Rz(roll)·Rx(pitch): 행성 → 화면, 그 전치가 화면 → 행성
    const Rm = [
      [cr, -sr * cp, sr * sp],
      [sr, cr * cp, -cr * sp],
      [0, sp, cp],
    ];
    // uOrient = Rᵀ (열 우선으로 넘김: 열 i = Rᵀ의 i열 = R의 i행)
    gl.uniformMatrix3fv(U.uOrient, false, new Float32Array([Rm[0][0], Rm[0][1], Rm[0][2], Rm[1][0], Rm[1][1], Rm[1][2], Rm[2][0], Rm[2][1], Rm[2][2]]));
    gl.uniform1f(U.uS, S);
    gl.uniform2f(U.uTexel, 1.5 / tex.w, 1.5 / tex.h);
    gl.uniform1f(U.uRot, -t * b.spin);
    gl.uniform1f(U.uKind, b.kind);
    gl.uniform1f(U.uBump, b.bump * Math.min(1, Rdev / 60));
    gl.uniform3fv(U.uAtmo, hexRGB(b.atmo || '#000000'));
    gl.uniform1f(U.uAtmoK, b.atmoK || 0);
    gl.uniform1f(U.uHalo, b.halo || 0.001);
    gl.uniform1f(U.uHaze, b.haze || 0);
    gl.uniform3fv(U.uHazeC, hexRGB(b.hazeC || '#000000'));
    gl.uniform1f(U.uHeat, heat);
    gl.uniform1f(U.uDay, day);
    gl.uniform1f(U.uPx, 1 / Rdev);
    gl.uniform1f(U.uRingMode, !b.ring ? 0 : b.ring === 'faint' ? 2 : 1);
    gl.uniform1f(U.uRingIn, b.ringIn || 0); gl.uniform1f(U.uRingOut, b.ringOut || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return { canvas, extent: S };
  }
  return { render, preload };
}
