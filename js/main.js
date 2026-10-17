// App shell: audio analysis, the music-driven timeline, camera smoothing, UI and the frame loop.

import { createRenderer } from './renderer.js';
import { SCENES, STARTS, TOTAL, sceneAt, buildScene, buildMesh, cameraFor } from './scenes.js';
import { lookAt, perspective, clamp01 } from './math.js';

const TRACKS = [
  { short: 'Moonlight', title: 'Beethoven: Moonlight Sonata', src: 'assets/music/moonlight-sonata.mp3', credit: 'Public domain. Internet Archive.' },
  { short: 'Requiem', title: 'Mozart: Requiem, Dies irae', src: 'assets/music/mozart-requiem-dies-irae.mp3', credit: 'CC0. Internet Archive.' },
  { short: 'Brandenburg', title: 'Bach: Brandenburg Concerto No. 2', src: 'assets/music/bach-brandenburg-2.mp3', credit: 'Public domain. Internet Archive.' },
];

const SPRING = 3.2, DAMP = 3.4;
const $ = (s) => document.querySelector(s);

function showHint(text) {
  const h = $('#hint');
  h.textContent = text;
  h.hidden = false;
}
function showError(text) {
  const e = $('#nogl');
  e.textContent = text;
  e.hidden = false;
  $('#hint').hidden = true;
}

function main() {
  const params = new URLSearchParams(location.search);
  const small = matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const N = Math.max(4000, Math.min(200000, Number(params.get('n')) || (small ? 60000 : 180000)));

  const canvas = $('#scene');
  let R;
  try {
    R = createRenderer(canvas);
  } catch (err) {
    showError(err.message);
    return;
  }

  /* ----- particle state ----- */
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const tgt = new Float32Array(N * 3), col = new Float32Array(N * 3), tcol = new Float32Array(N * 3);
  const size = new Float32Array(N), kind = new Float32Array(N), anchor = new Float32Array(N * 3), seed = new Float32Array(N);
  col.fill(0.5); tcol.fill(0.5);
  for (let i = 0; i < N; i++) {
    seed[i] = Math.random();
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 1 + Math.random() * 2;
    pos[i * 3] = s * Math.cos(th) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = s * Math.sin(th) * r;
  }
  R.bind({ aPos: pos, aCol: col, aSize: size, aKind: kind, aAnchor: anchor, aSeed: seed });

  /* ----- DOM ----- */
  const hint = $('#hint'), nowEl = $('#now'), creditEl = $('#credit');
  const captionEl = $('#caption'), fillEl = $('#fill'), meterEl = $('#meter');
  const toggleBtn = $('#toggle'), stageList = $('#stages'), tracksEl = $('#tracks'), fileInput = $('#file');

  SCENES.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s.short;
    stageList.appendChild(li);
  });
  STARTS.forEach((s) => {
    const tick = document.createElement('span');
    tick.className = 'tick';
    tick.style.left = (s / TOTAL * 100) + '%';
    meterEl.appendChild(tick);
  });

  /* ----- audio ----- */
  const audio = new Audio();
  audio.preload = 'auto';
  let ac = null, analyser = null, freq = null, wave = null, audioReady = false;
  function initAudio() {
    if (audioReady) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    const src = ac.createMediaElementSource(audio);
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    src.connect(analyser);
    analyser.connect(ac.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Float32Array(analyser.fftSize);
    audioReady = true;
    return true;
  }
  function syncToggle() {
    toggleBtn.textContent = audio.paused ? '▶' : '❚❚';
    toggleBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }
  function playSource(src, title, credit, btn) {
    if (!initAudio()) showHint('This browser cannot analyse audio, so the story will not move.');
    if (ac && ac.state === 'suspended') ac.resume();
    audio.src = src;
    audio.play().catch((err) => showHint('Playback was blocked (' + err.message + '). Press play to start.'));
    nowEl.textContent = title;
    creditEl.textContent = credit;
    hint.hidden = true;
    toggleBtn.disabled = false;
    tracksEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    syncToggle();
  }
  function loadTrack(track, btn) { playSource(track.src, track.title, track.credit, btn); }
  function loadFile(f) {
    playSource(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, ''), 'Your file. It stays in this browser.', null);
  }
  function togglePlay() {
    if (!audio.src) return;
    if (ac && ac.state === 'suspended') ac.resume();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }
  function seekFraction(f) {
    progress = clamp01(f) * TOTAL;
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = clamp01(f) * audio.duration;
  }

  TRACKS.forEach((tr) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tr.short;
    b.addEventListener('click', () => loadTrack(tr, b));
    tracksEl.appendChild(b);
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) loadFile(f);
    fileInput.value = '';
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && audio.duration > 0) {
      e.preventDefault();
      const dir = e.code === 'ArrowRight' ? 5 : -5;
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + dir));
      progress = audio.currentTime / audio.duration * TOTAL;
    }
  });
  meterEl.addEventListener('click', (e) => {
    const r = meterEl.getBoundingClientRect();
    seekFraction((e.clientX - r.left) / r.width);
  });
  toggleBtn.addEventListener('click', togglePlay);
  audio.addEventListener('play', syncToggle);
  audio.addEventListener('pause', syncToggle);
  audio.addEventListener('ended', () => { syncToggle(); progress = TOTAL; });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) showHint('That file did not load. Try another track.'); });

  /* ----- story state ----- */
  let progress = 0, sceneIdx = -1;
  let sumE = 0, sumT = 0; // loudness averaged over the time played, so the pace is fair to each track
  let bass = 0, mid = 0, high = 0, energy = 0, bassAvg = 0, beat = 0, lastBeat = -9;
  let pkB = 0, pkM = 0, pkH = 0;
  let spin = 0, diffCur = 0, diffTarget = 0;

  const hm = location.hash.match(/scene=(\d+)(?:&u=([\d.]+))?/);
  if (hm) {
    const k = Math.min(SCENES.length - 1, +hm[1]);
    progress = STARTS[k] + (hm[2] ? clamp01(+hm[2]) : 0.5) * SCENES[k].weight;
  }

  let capTimer = 0;
  function showCaption(k) {
    const s = SCENES[k];
    captionEl.querySelector('.idx').textContent = (k + 1) + ' / ' + SCENES.length;
    captionEl.querySelector('.name').textContent = s.name;
    captionEl.querySelector('.line').textContent = s.line;
    captionEl.classList.add('on');
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { if (progress < TOTAL) captionEl.classList.remove('on'); }, 6500);
  }
  function markStage(k) {
    [...stageList.children].forEach((li, i) => {
      li.classList.toggle('on', i === k);
      li.classList.toggle('done', i < k);
    });
  }
  function setScene(k) {
    sceneIdx = k;
    const T = buildScene(k, N);
    tgt.set(T.pos); tcol.set(T.col);
    size.set(T.size); kind.set(T.kind); anchor.set(T.anchor);
    R.upload('aSize'); R.upload('aKind'); R.upload('aAnchor');
    R.setMesh(buildMesh(k));
    diffTarget = SCENES[k].spin;
    showCaption(k);
    markStage(k);
  }

  /* ----- analysis ----- */
  function analyse(dt, t, playing) {
    let b = 0, m = 0, h = 0, target = 0;
    if (playing && analyser) {
      analyser.getByteFrequencyData(freq);
      const avg = (a, z) => { let s = 0; for (let i = a; i < z; i++) s += freq[i]; return s / ((z - a) * 255); };
      b = avg(1, 7); m = avg(7, 40); h = avg(40, 200);
      analyser.getFloatTimeDomainData(wave);
      let sum = 0;
      for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
      const db = 10 * Math.log10(Math.max(sum / wave.length, 1e-12));
      target = clamp01((db + 44) / 22);
    }
    // Visual bands use automatic gain, so quiet and loud recordings both fill the range.
    const dec = Math.exp(-dt * 0.05);
    pkB = Math.max(b, pkB * dec); pkM = Math.max(m, pkM * dec); pkH = Math.max(h, pkH * dec);
    b = Math.min(1, b / Math.max(pkB, 0.15));
    m = Math.min(1, m / Math.max(pkM, 0.15));
    h = Math.min(1, h / Math.max(pkH, 0.15));
    const k = Math.min(1, dt * 14);
    bass += (b - bass) * k; mid += (m - mid) * k; high += (h - high) * k;
    energy += (target - energy) * Math.min(1, dt * 1.2);
    bassAvg += (bass - bassAvg) * Math.min(1, dt * 2);
    let fired = 0;
    if (playing && bass > bassAvg * 1.3 + 0.06 && t - lastBeat > 0.22) {
      lastBeat = t;
      beat = 1;
      fired = Math.min(1, (bass - bassAvg) * 3);
    }
    beat = Math.max(0, beat - dt * 3.5);
    return fired;
  }

  function kick(s) {
    const f = 0.55 * s, n = N * 3;
    for (let i = 0; i < n; i++) vel[i] += pos[i] * f;
  }
  function physics(dt) {
    const n = N * 3, cl = Math.min(1, dt * 2.5);
    for (let i = 0; i < n; i++) {
      const v = vel[i] + ((tgt[i] - pos[i]) * SPRING - vel[i] * DAMP) * dt;
      vel[i] = v;
      pos[i] += v * dt;
      col[i] += (tcol[i] - col[i]) * cl;
    }
  }

  /* ----- camera ----- */
  const camEye = [0, 0, 8], camTgt = [0, 0, 0];
  let fovCur = 50, camInit = false;

  /* ----- frame loop ----- */
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const d = dpr();
    R.resize(Math.round(innerWidth * d), Math.round(innerHeight * d));
  }
  window.addEventListener('resize', resize);
  resize();

  const t0 = performance.now();
  let last = t0;
  let lastAudioT = 0;
  function frame(now) {
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    const t = (now - t0) / 1000;
    const playing = !audio.paused && !audio.ended;

    const fired = analyse(dt, t, playing);

    // The story runs on the music's own clock, so slow frames never slow the song's journey.
    const aNow = audio.currentTime;
    const dtA = playing && audio.readyState >= 2 ? Math.min(0.5, Math.max(0, aNow - lastAudioT)) : 0;
    lastAudioT = aNow;
    if (dtA > 0) {
      const dur = Number.isFinite(audio.duration) && audio.duration > 5 ? audio.duration : 180;
      // Pace: the whole story spans the song. Loud passages move faster than quiet ones.
      sumE += energy * dtA;
      sumT += dtA;
      const avgE = sumE / Math.max(sumT, 1e-3);
      const ratio = Math.min(2.5, Math.max(0.2, energy / Math.max(avgE, 0.05)));
      progress = Math.min(TOTAL, progress + dtA * (TOTAL / dur) * ratio);
    }

    const k = sceneAt(progress);
    if (k !== sceneIdx) setScene(k);
    const sc = SCENES[k];
    if (fired && sc.kick) kick(fired);

    fillEl.style.width = (progress / TOTAL * 100).toFixed(2) + '%';
    if (progress >= TOTAL) captionEl.classList.add('on');

    spin += dt * (0.25 + bass * 1.2);
    diffCur += (diffTarget - diffCur) * Math.min(1, dt * 1.5);

    physics(dt);
    R.upload('aPos');
    R.upload('aCol');

    const frac = clamp01((progress - STARTS[k]) / sc.weight);
    const want = cameraFor(k, t, frac);
    const a = camInit ? 1 - Math.exp(-dt * 1.8) : 1;
    camInit = true;
    for (let i = 0; i < 3; i++) {
      camEye[i] += (want.eye[i] - camEye[i]) * a;
      camTgt[i] += (want.target[i] - camTgt[i]) * a;
    }
    fovCur += (want.fov - fovCur) * a;

    const aspect = canvas.width / canvas.height;
    const fovY = 2 * Math.atan(Math.tan(fovCur * Math.PI / 360) / Math.min(1, aspect));
    R.draw({
      view: lookAt(camEye, camTgt),
      proj: perspective(fovY, aspect, 0.08, 400),
      time: t, bass, beat, spin, diff: diffCur,
      px: sc.px, dpr: dpr(), fog: sc.fog,
      wave: sc.wave * (1 + bass * 0.5), wrap: sc.wrap,
      solid: sc.solid, n: N, cam: camEye,
    });
    requestAnimationFrame(frame);
  }

  /* ----- controls wiring that needs state ----- */
  meterEl.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight') seekFraction(progress / TOTAL + 0.02);
    if (e.code === 'ArrowLeft') seekFraction(progress / TOTAL - 0.02);
  });

  window.atomsDebug = () => ({ progress: +progress.toFixed(3), scene: sceneIdx, energy: +energy.toFixed(3), bass: +bass.toFixed(3), playing: !audio.paused });

  setScene(sceneAt(progress));
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
  requestAnimationFrame(frame);
}

main();
