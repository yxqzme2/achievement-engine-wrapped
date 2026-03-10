const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

const s = requireState();
initProgressBars(4);
const hp = initCombatUI();

const stats = s.stats || {};

// Set peak month text
const monthEl = document.getElementById('s5-l4');
if (monthEl) monthEl.textContent = MONTH_NAMES[stats.mostActiveMonth || 0];

// Reset text
for (let i = 1; i <= 6; i++) {
  const el = document.getElementById(`s5-l${i}`);
  if (el) el.classList.remove('s5-show');
}
const shield = document.getElementById('user-shield');
if (shield) shield.classList.remove('shield-active');

// Choreographed text reveal
setTimeout(() => document.getElementById('s5-l1').classList.add('s5-show'), 500);
setTimeout(() => document.getElementById('s5-l2').classList.add('s5-show'), 1200);
setTimeout(() => document.getElementById('s5-l3').classList.add('s5-show'), 2000);
setTimeout(() => document.getElementById('s5-l4').classList.add('s5-show'), 2800);
setTimeout(() => document.getElementById('s5-l5').classList.add('s5-show'), 3800);
setTimeout(() => document.getElementById('s5-l6').classList.add('s5-show'), 4800);

// Boss strike
const STRIKE_TIME = 6300;
const hoursByMonth  = stats.hoursByMonth || [];
const peakMonthHrs  = hoursByMonth.length ? Math.max(...hoursByMonth) : 0;

const totalStatChips = ((s.userSheet || {}).total_stats) || {};
const totalDef       = totalStatChips.def || 0;

// damage_calc.md §2E: (2500 + PeakMonthHours * 15) - (Total_DEF * 3)
const peakStrikeDmg  = Math.max(100, Math.round((2500 + peakMonthHrs * 15) - (totalDef * 3)));

let wasLiquidatedByRetaliation = false;

setTimeout(() => {
  if (shield) shield.classList.add('shield-active');
  spawnDamageText(`-${peakStrikeDmg.toLocaleString()}`, 'user', '#ff0000');
  triggerShake('heavy');
  // Removed safety floor: allows for ASSET LIQUIDATED (Loss)
  const newUserHP = updateHP('user', hp.userCurrentHP - peakStrikeDmg);
  setTimeout(() => { if (shield) shield.classList.remove('shield-active'); }, 1500);

  if (newUserHP <= 0) {
    wasLiquidatedByRetaliation = true;
    const fx = document.getElementById('screen-fx');
    if (fx) {
      fx.style.transition = 'opacity 1.1s ease-in-out';
      fx.style.backgroundColor = '#000000';
      fx.style.opacity = '1';
    }
    setTimeout(() => {
      setState({ win: false });
      navigate('outro');
    }, 1200);
  }
}, STRIKE_TIME);

setTimeout(() => {
  if (!wasLiquidatedByRetaliation) unlockSlide('months');
}, STRIKE_TIME + 2000);

// ── GRASS (CORRUPTION WORMS) ──────────────────────────────────────────────────
let grassCanvas, grassCtx, worms = [];

function createWorm() {
  return {
    x: Math.random() * grassCanvas.width,
    y: grassCanvas.height,
    angle: -Math.PI/2 + (Math.random() - 0.5),
    segments: 0,
    maxSegments: 40 + Math.random() * 40,
    width: 2 + Math.random() * 3
  };
}
function renderGrass() {
  if (Math.random() > 0.8) worms.push(createWorm());
  for (let i = 0; i < worms.length; i++) {
    const w = worms[i];
    grassCtx.beginPath(); grassCtx.strokeStyle = '#ff2a2a'; grassCtx.lineWidth = w.width;
    grassCtx.moveTo(w.x, w.y);
    w.angle += (Math.random() - 0.5) * 0.5;
    w.x += Math.cos(w.angle) * 8;
    w.y += Math.sin(w.angle) * 8;
    w.width *= 0.98;
    grassCtx.lineTo(w.x, w.y); grassCtx.stroke();
    w.segments++;
    if (w.segments > w.maxSegments || w.y < 0) { worms.splice(i, 1); i--; }
  }
  requestAnimationFrame(renderGrass);
}
function initGrass() {
  grassCanvas = document.getElementById('grass-canvas');
  if (!grassCanvas) return;
  grassCtx = grassCanvas.getContext('2d');
  grassCanvas.width  = window.innerWidth;
  grassCanvas.height = window.innerHeight;
  renderGrass();
}

initGrass();
initFireworks();
