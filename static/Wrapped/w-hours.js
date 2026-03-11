const s = requireState();
initProgressBars(1);
const hp = initCombatUI();

const totalHours  = Math.round((s.stats || {}).totalHours || 0);
// Balanced scaling: 30% win potential cap. (600 hrs = 75k DMG)
const hoursDmg    = Math.min(75000, totalHours * 125);

document.getElementById('s-hours-num').innerText = '0';
document.getElementById('s-hours-combat-text').style.opacity = '0';
countUpSimple('s-hours-num', totalHours, 2000);

setTimeout(() => {
  document.getElementById('s-hours-combat-text').style.opacity = '1';
  spawnDamageText(`-${hoursDmg.toLocaleString()}`, 'boss', '#ffffff');
  triggerShake('heavy');
  updateHP('boss', hp.bossCurrentHP - hoursDmg);
}, 3500);

setTimeout(() => unlockSlide('hours'), 4200);

// ── SPIRAL CANVAS ─────────────────────────────────────────────────────────────
const spiralCanvas = document.getElementById('spiral-canvas');
const spiralCtx = spiralCanvas.getContext('2d');
const SPIN_SPEED = 0.08;
let spTime = 0, spW, spH;
const SP_MAX_OFFSET = 400, SP_SPACING = 4, SP_POINTS = SP_MAX_OFFSET / SP_SPACING;
const SP_PEAK = SP_MAX_OFFSET * 0.25, SP_PPL = 6, SP_SHADOW = 6;

function resizeSpiral() {
  spW = spiralCanvas.width  = window.innerWidth;
  spH = spiralCanvas.height = window.innerHeight;
}
function renderSpiral() {
  spTime += SPIN_SPEED;
  spiralCtx.clearRect(0, 0, spW, spH);
  let cx = spW / 2, cy = spH / 2;
  spiralCtx.globalCompositeOperation = 'lighter';
  spiralCtx.strokeStyle = '#00e5ff';
  spiralCtx.shadowColor = '#00e5ff';
  spiralCtx.lineWidth = 2;
  spiralCtx.beginPath();
  for (let i = SP_POINTS; i > 0; i--) {
    let value = i * SP_SPACING + (spTime % SP_SPACING);
    let ax = Math.sin(value / SP_PPL) * Math.PI, ay = Math.cos(value / SP_PPL) * Math.PI;
    let x  = ax * value;
    let y  = ay * value * 0.35;
    let o  = 1 - (Math.min(value, SP_PEAK) / SP_PEAK);
    y -= Math.pow(o, 2) * 200;
    y += 200 * value / SP_MAX_OFFSET;
    y += x / cx * spW * 0.1;
    spiralCtx.globalAlpha = 1 - (value / SP_MAX_OFFSET);
    spiralCtx.shadowBlur  = SP_SHADOW * o;
    spiralCtx.lineTo(cx + x, cy + y);
    spiralCtx.stroke();
    spiralCtx.beginPath();
    spiralCtx.moveTo(cx + x, cy + y);
  }
  spiralCtx.lineTo(cx, cy - 200);
  spiralCtx.lineTo(cx, 0);
  spiralCtx.stroke();
  requestAnimationFrame(renderSpiral);
}
function initSpiral() { resizeSpiral(); window.addEventListener('resize', resizeSpiral); renderSpiral(); }

initSpiral();
initFireworks();
