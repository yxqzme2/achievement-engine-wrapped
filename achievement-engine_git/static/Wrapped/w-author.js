const s = requireState();
initProgressBars(3);
const hp = initCombatUI();

const stats       = s.stats || {};
const authorName  = (stats.topAuthor   || {}).name || '???';
const narratorName = (stats.topNarrator || {}).name || '???';
const authorHours = (stats.topAuthor || {}).hours || 0;
const totalStatChips = (s.userSheet || {}).total_stats || {};
const mag = totalStatChips.mag || 0;

// damage_calc.md §2C: Math.min(37500, (MAG * 25) + (TopAuthorHours * 50))
const totalSummonDmg = Math.min(37500, (mag * 25) + (authorHours * 50));
const dmgLeft  = Math.round(totalSummonDmg * 0.6);
const dmgRight = Math.round(totalSummonDmg * 0.4);

const authorEl   = document.getElementById('s4-author-name');
const narratorEl = document.getElementById('s4-narrator-name');
const npLeft     = document.getElementById('s4-rpg-nameplate-left');
const npRight    = document.getElementById('s4-rpg-nameplate-right');
if (authorEl)   authorEl.textContent   = authorName.toUpperCase();
if (narratorEl) narratorEl.textContent = narratorName.toUpperCase();
if (npLeft)     npLeft.textContent     = authorName;
if (npRight)    npRight.textContent    = narratorName;

const centerText = document.getElementById('s4-summon-center');
const boxLeft    = document.getElementById('s4-rpg-ui-left');
const boxRight   = document.getElementById('s4-rpg-ui-right');
const pLeft      = document.getElementById('proj-left');
const pRight     = document.getElementById('proj-right');

pLeft.style.opacity  = '0';
pRight.style.opacity = '0';

// 1. Show summon center
setTimeout(() => { if (centerText) centerText.style.opacity = '1'; }, 800);

// 2. Hide center, show battle boxes
setTimeout(() => {
  if (centerText) centerText.style.opacity = '0';
  setTimeout(() => {
    if (boxLeft)  boxLeft.style.display  = 'block';
    if (boxRight) boxRight.style.display = 'block';

    const authorLine   = authorHours > 0 ? `Casts ${Math.round(authorHours)} hours of pure magic!` : 'Unleashes a devastating assault!';
    const narratorLine = `Weaponizes their voice for ${dmgRight.toLocaleString()} damage!`;
    typeWriter(authorLine,   's4-rpg-text-left',  40);
    typeWriter(narratorLine, 's4-rpg-text-right', 40);
  }, 600);
}, 2200);

// 3. Fire projectiles
setTimeout(() => {
  pLeft.style.opacity  = '1';
  pRight.style.opacity = '1';
  const targetX = window.innerWidth / 2;
  const targetY = 80;
  anime({ targets: '#proj-left',  translateX: [window.innerWidth*0.2, targetX-40], translateY: [window.innerHeight-150, targetY], rotate: ['45deg','45deg'],   duration: 1200, easing: 'easeInSine', complete: () => pLeft.style.opacity  = '0' });
  anime({ targets: '#proj-right', translateX: [window.innerWidth*0.8, targetX+40], translateY: [window.innerHeight-150, targetY], rotate: ['-45deg','-45deg'], duration: 1200, easing: 'easeInSine', complete: () => pRight.style.opacity = '0' });
}, 5000);

// 4. Impact
setTimeout(() => {
  spawnDamageText(`-${dmgLeft.toLocaleString()}`, 'boss', '#00e5ff', window.innerWidth/2 - 50, 150);
  spawnDamageText(`-${dmgRight.toLocaleString()}`, 'boss', '#ffaa00', window.innerWidth/2 + 50, 180);
  triggerShake('heavy');
  updateHP('boss', getState().bossCurrentHP - totalSummonDmg);
}, 6200);

// 5. Post-damage text
setTimeout(() => {
  typeWriter(" It's super effective!", 's4-rpg-text-left',  40, true);
  typeWriter(" A critical hit!",        's4-rpg-text-right', 40, true);
}, 6800);

setTimeout(() => unlockSlide('author'), 9500);

// ── STARS CANVAS ──────────────────────────────────────────────────────────────
const starsCanvas = document.getElementById('stars-canvas');
const starsCtx    = starsCanvas.getContext('2d');
let starsArr = [], dotsArr = [];
let mouseX = 0, mouseY = 0, mouseMoving = false, mouseMoveTimer;

function Star(x, y) {
  this.x = x; this.y = y;
  this.r = Math.random() * 2 + 1;
  this.color = 'rgba(255,255,255,' + (Math.random() * 0.5) + ')';
  this.move = function() {
    this.y -= 0.15;
    if (this.y <= -10) this.y = starsCanvas.height + 10;
    starsCtx.fillStyle = this.color;
    starsCtx.beginPath(); starsCtx.arc(this.x, this.y, this.r, 0, Math.PI*2); starsCtx.fill();
  };
}
function Dot(x, y) {
  this.x = x; this.y = y;
  this.r = Math.random() * 5 + 1;
  this.a = 0.5;
  this.move = function() {
    this.a -= 0.005;
    if (this.a <= 0) return false;
    starsCtx.fillStyle = 'rgba(255,255,255,' + this.a + ')';
    starsCtx.beginPath(); starsCtx.arc(this.x, this.y, this.r, 0, Math.PI*2); starsCtx.fill();
    return true;
  };
}
function drawConnections() {
  for (let i = 0; i < dotsArr.length; i++) {
    for (let j = i+1; j < dotsArr.length; j++) {
      const dist = Math.sqrt(Math.pow(dotsArr[i].x-dotsArr[j].x,2)+Math.pow(dotsArr[i].y-dotsArr[j].y,2));
      if (dist < 150) {
        starsCtx.strokeStyle = 'rgba(255,255,255,' + (dotsArr[i].a * 0.2) + ')';
        starsCtx.lineWidth = 1; starsCtx.beginPath();
        starsCtx.moveTo(dotsArr[i].x, dotsArr[i].y); starsCtx.lineTo(dotsArr[j].x, dotsArr[j].y); starsCtx.stroke();
      }
    }
  }
}
function renderStars() {
  starsCtx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);
  for (let st of starsArr) st.move();
  if (mouseMoving) { dotsArr.push(new Dot(mouseX, mouseY)); if (dotsArr.length > 50) dotsArr.shift(); }
  drawConnections();
  dotsArr = dotsArr.filter(d => d.move());
  requestAnimationFrame(renderStars);
}
function initStars() {
  starsCanvas.width  = window.innerWidth;
  starsCanvas.height = window.innerHeight;
  window.addEventListener('resize', () => { starsCanvas.width = window.innerWidth; starsCanvas.height = window.innerHeight; });
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY; mouseMoving = true;
    clearTimeout(mouseMoveTimer); mouseMoveTimer = setTimeout(() => mouseMoving = false, 100);
  });
  for (let i = 0; i < 150; i++) starsArr.push(new Star(Math.random()*starsCanvas.width, Math.random()*starsCanvas.height));
  renderStars();
}

initStars();
initFireworks();
