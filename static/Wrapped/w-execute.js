const s = requireState();
initProgressBars(6);
const hp = initCombatUI();

const l1 = document.getElementById('s7-l1');
const l2 = document.getElementById('s7-l2');
const l3 = document.getElementById('s7-l3');
const fx = document.getElementById('screen-fx');

[l1, l2, l3].forEach(el => el && el.classList.remove('text-visible'));

if (typeof gsap !== 'undefined') gsap.globalTimeline.timeScale(1);

// ── Compute execute values up-front (needed for text AND the strike) ──────────
const cp          = (s.userSheet || {}).combat_power || 0;
const EXECUTE_DMG = Math.min(62500, cp * 15);
const bossMaxHP   = s.bossMaxHP || 100000;
const pct         = Math.round((EXECUTE_DMG / bossMaxHP) * 100);
const totalBooks  = s.stats?.totalBooks || 0;
const estChars    = totalBooks * 26; // ~26 named characters per audiobook

// ── Build the epic sub-text ───────────────────────────────────────────────────
if (l3) {
  const army = estChars > 0
    ? `<strong>${estChars.toLocaleString()}</strong> voices — heroes, monsters, tyrants, and gods —`
    : 'Every voice from every world —';
  const campaign = totalBooks > 0
    ? `your <strong>${totalBooks}</strong>-volume campaign`
    : 'your campaign';
  l3.innerHTML =
    `${army} every soul from ${campaign} answers the call. ` +
    `They converge at your back in a single catastrophic strike. ` +
    `Combat Power <span style="color:#ffaa00;font-weight:bold;">${cp.toLocaleString()}</span> detonates for ` +
    `<span style="color:#ffaa00;font-weight:bold;">${EXECUTE_DMG.toLocaleString()} damage</span>` +
    (pct > 0
      ? ` — <span style="color:#ffaa00;font-weight:bold;">${pct}%</span> of the Administrator's HP, erased.`
      : '.');
}

// ── Text reveal ───────────────────────────────────────────────────────────────
setTimeout(() => l1 && l1.classList.add('text-visible'), 500);
setTimeout(() => l2 && l2.classList.add('text-visible'), 1200);
setTimeout(() => l3 && l3.classList.add('text-visible'), 2500);

// ── Execute strike ────────────────────────────────────────────────────────────
setTimeout(() => {
  spawnDamageText(`-${EXECUTE_DMG.toLocaleString()} [FINAL EXECUTE]`, 'boss', '#ffaa00');
  triggerShake('heavy');

  const finalState = getState();
  const newBossHP  = updateHP('boss', finalState.bossCurrentHP - EXECUTE_DMG);
  const userHP     = finalState.userCurrentHP;

  if (typeof gsap !== 'undefined') {
    gsap.to(gsap.globalTimeline, { timeScale: 0.1, duration: 0.5, ease: 'power2.out' });
  }

  const win = (newBossHP <= 0) && (userHP > 0);

  if (win) {
    if (fx) {
      fx.style.transition      = 'opacity 0.1s';
      fx.style.backgroundColor = '#ff0000';
      fx.style.opacity         = '0.5';
      setTimeout(() => { fx.style.transition = 'opacity 2s ease-out'; fx.style.opacity = '0'; }, 150);
    }
    setTimeout(() => { setState({ win: true }); navigate('gear'); }, 3000);
  } else {
    if (fx) {
      fx.style.transition      = 'opacity 2.5s ease-in-out';
      fx.style.backgroundColor = '#000000';
      fx.style.opacity         = '1';
    }
    setTimeout(() => { setState({ win: false }); navigate('outro'); }, 3000);
  }
}, 14000);

// ── CROWD SIMULATOR ───────────────────────────────────────────────────────────
const crowdConfig = {
  src:  'https://s3-us-west-2.amazonaws.com/s.cdpn.io/175711/open-peeps-sheet.png',
  rows: 15, cols: 7
};
const randRange = (min, max) => min + Math.random() * (max - min);
const randIndex = arr => randRange(0, arr.length) | 0;

const resetPeep = ({ stage, peep }) => {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const offsetY   = 100 - 250 * (function ease(t){ return t*t; })(Math.random());
  const startY    = stage.height - peep.height + offsetY;
  let startX, endX;
  if (direction === 1) { startX = -peep.width;         endX = stage.width; peep.scaleX =  1; }
  else                 { startX = stage.width + peep.width; endX = 0;       peep.scaleX = -1; }
  peep.x = startX; peep.y = startY; peep.anchorY = startY;
  return { startX, startY, endX };
};

const normalWalk = ({ peep, props }) => {
  const { startX, startY, endX } = props;
  const xDuration = 10, yDuration = 0.25;
  const tl = gsap.timeline();
  tl.timeScale(randRange(0.5, 1.5));
  tl.to(peep, { duration: xDuration, x: endX, ease: 'none' }, 0);
  tl.to(peep, { duration: yDuration, repeat: xDuration / yDuration, yoyo: true, y: startY - 10 }, 0);
  return tl;
};

class Peep {
  constructor({ image, rect }) {
    this.image    = image; this.rect = rect;
    this.width    = rect[2]; this.height = rect[3];
    this.drawArgs = [image, ...rect, 0, 0, rect[2], rect[3]];
    this.x = 0; this.y = 0; this.anchorY = 0; this.scaleX = 1; this.walk = null;
  }
  render(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.scaleX, 1);
    ctx.drawImage(...this.drawArgs); ctx.restore();
  }
}

let crowdImg, crowdCanvas, crowdCtx;
const crowdStage  = { width: 0, height: 0 };
const allPeeps    = [], availablePeeps = [], crowd = [];

function setupCrowd() {
  const { rows, cols } = crowdConfig;
  const { naturalWidth: w, naturalHeight: h } = crowdImg;
  const total = rows * cols, rW = w / rows, rH = h / cols;
  for (let i = 0; i < total; i++)
    allPeeps.push(new Peep({ image: crowdImg, rect: [i % rows * rW, (i / rows | 0) * rH, rW, rH] }));
  resizeCrowd();
  gsap.ticker.add(renderCrowd);
  window.addEventListener('resize', resizeCrowd);
  // Fade in — canvas starts at opacity:0 via w-shared.css; transition:opacity 1s handles the ease
  if (crowdCanvas) crowdCanvas.style.opacity = '1';
}

function resizeCrowd() {
  if (!crowdCanvas) return;
  crowdStage.width  = crowdCanvas.clientWidth;
  crowdStage.height = crowdCanvas.clientHeight;
  crowdCanvas.width  = crowdStage.width  * devicePixelRatio;
  crowdCanvas.height = crowdStage.height * devicePixelRatio;
  crowd.forEach(p => p.walk.kill());
  crowd.length = 0; availablePeeps.length = 0;
  availablePeeps.push(...allPeeps);
  while (availablePeeps.length) addPeepToCrowd().walk.progress(Math.random());
}

function addPeepToCrowd() {
  const peep = availablePeeps.splice(randIndex(availablePeeps), 1)[0];
  const walk = normalWalk({ peep, props: resetPeep({ peep, stage: crowdStage }) })
    .eventCallback('onComplete', () => {
      crowd.splice(crowd.indexOf(peep), 1);
      availablePeeps.push(peep);
      addPeepToCrowd();
    });
  peep.walk = walk; crowd.push(peep); crowd.sort((a, b) => a.anchorY - b.anchorY);
  return peep;
}

function renderCrowd() {
  if (!crowdCanvas) return;
  crowdCanvas.width = crowdCanvas.width; // clear
  crowdCtx.save(); crowdCtx.scale(devicePixelRatio, devicePixelRatio);
  crowd.forEach(p => p.render(crowdCtx));
  crowdCtx.restore();
}

crowdCanvas = document.getElementById('crowd-canvas');
if (crowdCanvas) {
  crowdCtx = crowdCanvas.getContext('2d');
  crowdImg  = new Image();
  crowdImg.crossOrigin = 'anonymous';
  crowdImg.onload  = setupCrowd;
  crowdImg.onerror = () => console.warn('[crowd] Failed to load peeps sprite sheet:', crowdConfig.src);
  crowdImg.src     = crowdConfig.src;
}

initFireworks();
