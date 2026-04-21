// ── SLIDE ORDER ──────────────────────────────────────────────────────────────
const SLIDE_ORDER = ['intro','hours','books','author','months','personality','execute','gear','outro'];

// ── STATE ────────────────────────────────────────────────────────────────────
function getState() {
  try { return JSON.parse(sessionStorage.getItem('w_state') || '{}'); } catch(e) { return {}; }
}
function setState(upd) {
  sessionStorage.setItem('w_state', JSON.stringify(Object.assign(getState(), upd)));
}
function requireState() {
  const s = getState();
  if (!s.userId) { window.location.href = '/wrapped'; return {}; }
  return s;
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────
function goNext(currentSlide) {
  const idx = SLIDE_ORDER.indexOf(currentSlide);
  if (idx >= 0 && idx < SLIDE_ORDER.length - 1)
    window.location.href = '/wrapped/' + SLIDE_ORDER[idx + 1];
}
function navigate(toSlide) {
  window.location.href = '/wrapped/' + toSlide;
}

// ── TAP TO CONTINUE ───────────────────────────────────────────────────────────
function unlockSlide(currentSlide) {
  const cue = document.getElementById('tap-cue');
  if (cue) { cue.style.opacity = '1'; cue.style.pointerEvents = 'auto'; }
  const advance = () => goNext(currentSlide);
  document.addEventListener('click', advance, { once: true });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { advance(); document.removeEventListener('keydown', handler); }
  });
}

// ── PROGRESS BARS ─────────────────────────────────────────────────────────────
function initProgressBars(idx) {
  const row = document.getElementById('progress-bar-row');
  if (!row) return;
  row.innerHTML = SLIDE_ORDER.map((_, i) =>
    `<div class="story-bar"><div class="story-fill" style="width:${i <= idx ? '100%' : '0%'}"></div></div>`
  ).join('');
}

// ── COMBAT UI ─────────────────────────────────────────────────────────────────
function initCombatUI() {
  const s = getState();
  const bossMaxHP     = s.bossMaxHP     || 100000;
  const bossCurrentHP = s.bossCurrentHP !== undefined ? s.bossCurrentHP : bossMaxHP;
  const userMaxHP     = s.userMaxHP     || 3000;
  const userCurrentHP = s.userCurrentHP !== undefined ? s.userCurrentHP : userMaxHP;

  const bossFill = document.getElementById('boss-hp-fill');
  const userFill = document.getElementById('user-hp-fill');
  const bossText = document.getElementById('boss-hp-text');
  const userText = document.getElementById('user-hp-text');

  if (bossFill) bossFill.style.width = (bossCurrentHP / bossMaxHP * 100) + '%';
  if (userFill) userFill.style.width = (userCurrentHP / userMaxHP * 100) + '%';
  if (bossText) bossText.innerText = `${bossCurrentHP.toLocaleString()} / ${bossMaxHP.toLocaleString()}`;
  if (userText) userText.innerText = `${userCurrentHP.toLocaleString()} / ${userMaxHP.toLocaleString()}`;

  const hpLabel = document.getElementById('hp-user-label');
  if (hpLabel) hpLabel.textContent = (s.username || 'LISTENER').toUpperCase();

  const statsBar = document.getElementById('user-stats-bar');
  if (statsBar) {
    const ts = (s.userSheet && s.userSheet.total_stats) || {};
    const cp = (s.userSheet && s.userSheet.combat_power) || 0;
    statsBar.innerHTML =
      `<span class="stat-chip str">STR ${ts.str || 0}</span>` +
      `<span class="stat-chip mag">MAG ${ts.mag || 0}</span>` +
      `<span class="stat-chip def">DEF ${ts.def || 0}</span>` +
      `<span class="stat-chip hp">HP ${ts.hp || 0}</span>` +
      `<span class="stat-chip cp">CP ${cp}</span>`;
    console.log('[wrapped] stats bar state:', JSON.stringify({ userSheet: s.userSheet, userMaxHP: s.userMaxHP }));
  }

  const bossCont = document.getElementById('boss-hp-container');
  const userCont = document.getElementById('user-hp-container');
  if (bossCont) setTimeout(() => bossCont.style.opacity = '1', 200);
  if (userCont) setTimeout(() => userCont.style.opacity = '1', 200);

  return { bossMaxHP, bossCurrentHP, userMaxHP, userCurrentHP };
}

// ── HP UPDATES ───────────────────────────────────────────────────────────────
function updateHP(target, newHP) {
  const s = getState();
  if (target === 'boss') {
    const bossMaxHP = s.bossMaxHP || 100000;
    const val = Math.max(0, newHP);
    const pct = val / bossMaxHP * 100;
    const fill = document.getElementById('boss-hp-fill');
    const text = document.getElementById('boss-hp-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.innerText = `${val.toLocaleString()} / ${bossMaxHP.toLocaleString()}`;
    setState({ bossCurrentHP: val });
    return val;
  } else {
    const userMaxHP = s.userMaxHP || 3000;
    const val = Math.max(0, Math.min(userMaxHP, newHP));
    const pct = val / userMaxHP * 100;
    const fill = document.getElementById('user-hp-fill');
    const text = document.getElementById('user-hp-text');
    if (fill) fill.style.width = pct + '%';
    if (text) text.innerText = `${val.toLocaleString()} / ${userMaxHP.toLocaleString()}`;
    setState({ userCurrentHP: val });
    return val;
  }
}

function countUpHP(elementId, targetHP, maxHP, duration) {
  const el = document.getElementById(elementId);
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.innerText = `${Math.floor(ease * targetHP).toLocaleString()} / ${maxHP.toLocaleString()}`;
    if (p < 1) requestAnimationFrame(step);
    else el.innerText = `${targetHP.toLocaleString()} / ${maxHP.toLocaleString()}`;
  };
  requestAnimationFrame(step);
}

function countUpSimple(elementId, targetNum, duration) {
  const el = document.getElementById(elementId);
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.innerText = Math.floor(ease * targetNum).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.innerText = targetNum.toLocaleString();
  };
  requestAnimationFrame(step);
}

// ── DAMAGE TEXT ───────────────────────────────────────────────────────────────
function spawnDamageText(text, target, color, fixedX, fixedY) {
  const dmg = document.createElement('div');
  dmg.className = 'floating-text';
  dmg.innerText = text;
  dmg.style.color = color;
  if (fixedX && fixedY) {
    dmg.style.left = fixedX + 'px';
    dmg.style.top  = fixedY + 'px';
  } else if (target === 'boss') {
    dmg.style.top  = '30%';
    dmg.style.left = (40 + Math.random() * 20) + '%';
  } else {
    dmg.style.bottom = '30%';
    dmg.style.left   = (40 + Math.random() * 20) + '%';
  }
  document.body.appendChild(dmg);
  setTimeout(() => dmg.remove(), 1500);
}

// ── SHAKE ─────────────────────────────────────────────────────────────────────
function triggerShake(intensity) {
  intensity = intensity || 'light';
  const el = document.getElementById('slide-content') || document.body;
  const o = intensity === 'heavy' ? 18 : 6;
  el.style.transform = `translate(${o}px,${o}px)`;
  setTimeout(() => el.style.transform = `translate(-${o}px,-${o}px)`, 40);
  setTimeout(() => el.style.transform = `translate(${o}px,-${o}px)`, 80);
  setTimeout(() => el.style.transform = `translate(-${o}px,${o}px)`, 120);
  setTimeout(() => el.style.transform = `translate(0,0)`, 160);
}

// ── FIREWORKS ─────────────────────────────────────────────────────────────────
const fwColors = ['#00e5ff','#18FF92','#5A87FF','#FBF38C'];
let fwCtx2, fwCanvas2;

function initFireworks() {
  fwCanvas2 = document.getElementById('fireworks-canvas');
  if (!fwCanvas2) return;
  fwCtx2 = fwCanvas2.getContext('2d');
  setFwSize();
  window.addEventListener('resize', setFwSize);
  anime({ duration: Infinity, update: () => fwCtx2.clearRect(0, 0, fwCanvas2.width, fwCanvas2.height) });
}
function setFwSize() {
  if (!fwCanvas2) return;
  fwCanvas2.width  = window.innerWidth * 2;
  fwCanvas2.height = window.innerHeight * 2;
  fwCtx2.scale(2, 2);
}
function createParticule(x, y) {
  var p = { x, y };
  p.color    = fwColors[anime.random(0, fwColors.length - 1)];
  p.radius   = anime.random(16, 32);
  p.endPos   = setParticuleDirection(p);
  p.draw = function() {
    fwCtx2.beginPath();
    fwCtx2.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
    fwCtx2.fillStyle = p.color;
    fwCtx2.fill();
  };
  return p;
}
function setParticuleDirection(p) {
  var a = anime.random(0, 360) * Math.PI / 180;
  var v = anime.random(50, 180);
  var r = [-1, 1][anime.random(0, 1)] * v;
  return { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) };
}
function createCircle(x, y) {
  var p = { x, y, color: '#FFF', radius: 0.1, alpha: 0.5, lineWidth: 6 };
  p.draw = function() {
    fwCtx2.globalAlpha = p.alpha;
    fwCtx2.beginPath();
    fwCtx2.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
    fwCtx2.lineWidth = p.lineWidth;
    fwCtx2.strokeStyle = p.color;
    fwCtx2.stroke();
    fwCtx2.globalAlpha = 1;
  };
  return p;
}
function renderParticule(anim) {
  for (var i = 0; i < anim.animatables.length; i++) anim.animatables[i].target.draw();
}
function triggerFirework(x, y) {
  var circle = createCircle(x, y), particules = [];
  for (var i = 0; i < 30; i++) particules.push(createParticule(x, y));
  anime.timeline()
    .add({ targets: particules, x: p => p.endPos.x, y: p => p.endPos.y, radius: 0.1, duration: anime.random(1200,1800), easing: 'easeOutExpo', update: renderParticule })
    .add({ targets: circle, radius: anime.random(80,160), lineWidth: 0, alpha: { value: 0, easing: 'linear', duration: anime.random(600,800) }, duration: anime.random(1200,1800), easing: 'easeOutExpo', update: renderParticule, offset: 0 });
}

// ── TYPEWRITER ────────────────────────────────────────────────────────────────
function typeWriter(text, elementId, speed, append) {
  append = append || false;
  let i = 0;
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!append) el.textContent = '';
  function type() { if (i < text.length) { el.textContent += text.charAt(i); i++; setTimeout(type, speed); } }
  type();
}
