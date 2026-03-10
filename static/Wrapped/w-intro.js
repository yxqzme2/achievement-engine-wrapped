const s = requireState();
initProgressBars(0);

// Set username
const slamEl = document.getElementById('slam-name');
if (slamEl) slamEl.textContent = s.username || 'LISTENER';

// Init combat UI, then override to start at 0 and count up
const hp = initCombatUI();
const bossFill = document.getElementById('boss-hp-fill');
const userFill = document.getElementById('user-hp-fill');
if (bossFill) { bossFill.style.transition = 'none'; bossFill.style.width = '0%'; }
if (userFill) { userFill.style.transition = 'none'; userFill.style.width = '0%'; }
document.getElementById('boss-hp-text').innerText = `0 / ${hp.bossMaxHP.toLocaleString()}`;
document.getElementById('user-hp-text').innerText = `0 / ${hp.userMaxHP.toLocaleString()}`;

// Show bars
setTimeout(() => {
  document.getElementById('boss-hp-container').style.opacity = '1';
  document.getElementById('user-hp-container').style.opacity = '1';
}, 300);

// Count up HP bars after a short delay
setTimeout(() => {
  if (bossFill) bossFill.style.transition = 'width 1.5s cubic-bezier(0.25,1,0.5,1)';
  if (userFill) userFill.style.transition = 'width 1.5s cubic-bezier(0.25,1,0.5,1)';
  if (bossFill) bossFill.style.width = '100%';
  if (userFill) userFill.style.width = '100%';
  countUpHP('boss-hp-text', hp.bossMaxHP, hp.bossMaxHP, 1500);
  countUpHP('user-hp-text', hp.userMaxHP, hp.userMaxHP, 1500);
}, 1500);

// Name slam
setTimeout(() => {
  if (slamEl) {
    slamEl.classList.remove('name-slam');
    void slamEl.offsetWidth;
    slamEl.classList.add('name-slam');
  }
}, 600);

setTimeout(() => unlockSlide('intro'), 3500);

// ── LONG SHADOW BACKGROUND ────────────────────────────────────────────────────
const lsCanvas = document.getElementById('ls-canvas');
const lsCtx = lsCanvas.getContext('2d');
let lsBoxes = [];
const lsColors = ['#4a0000','#ff2a2a','#8b0000','#ff5500'];
let lsLight = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lsActive = true;

function resizeLS() {
  lsCanvas.width  = window.innerWidth;
  lsCanvas.height = window.innerHeight;
}
function drawLSLight() {
  lsCtx.beginPath();
  lsCtx.arc(lsLight.x, lsLight.y, 1000, 0, 2 * Math.PI);
  let g = lsCtx.createRadialGradient(lsLight.x, lsLight.y, 0, lsLight.x, lsLight.y, 1000);
  g.addColorStop(0, '#2a0000'); g.addColorStop(1, '#0a0000');
  lsCtx.fillStyle = g; lsCtx.fill();
  lsCtx.beginPath();
  lsCtx.arc(lsLight.x, lsLight.y, 20, 0, 2 * Math.PI);
  g = lsCtx.createRadialGradient(lsLight.x, lsLight.y, 0, lsLight.x, lsLight.y, 5);
  g.addColorStop(0, '#ff5555'); g.addColorStop(1, '#2a0000');
  lsCtx.fillStyle = g; lsCtx.fill();
}
function LSBox() {
  this.half_size = Math.floor(Math.random() * 50 + 1);
  this.x = Math.floor(Math.random() * lsCanvas.width + 1);
  this.y = Math.floor(Math.random() * lsCanvas.height + 1);
  this.r = Math.random() * Math.PI;
  this.shadow_length = 2000;
  this.color = lsColors[Math.floor(Math.random() * lsColors.length)];
  this.getDots = function() {
    const f = (Math.PI * 2) / 4;
    return {
      p1: { x: this.x + this.half_size * Math.sin(this.r),         y: this.y + this.half_size * Math.cos(this.r) },
      p2: { x: this.x + this.half_size * Math.sin(this.r + f),     y: this.y + this.half_size * Math.cos(this.r + f) },
      p3: { x: this.x + this.half_size * Math.sin(this.r + f * 2), y: this.y + this.half_size * Math.cos(this.r + f * 2) },
      p4: { x: this.x + this.half_size * Math.sin(this.r + f * 3), y: this.y + this.half_size * Math.cos(this.r + f * 3) }
    };
  };
  this.rotate = function() {
    const sp = (60 - this.half_size) / 20; this.r += sp * 0.002; this.x += sp; this.y += sp;
  };
  this.draw = function() {
    const d = this.getDots();
    lsCtx.beginPath(); lsCtx.moveTo(d.p1.x, d.p1.y); lsCtx.lineTo(d.p2.x, d.p2.y);
    lsCtx.lineTo(d.p3.x, d.p3.y); lsCtx.lineTo(d.p4.x, d.p4.y);
    lsCtx.fillStyle = this.color; lsCtx.fill();
    if (this.y - this.half_size > lsCanvas.height) this.y -= lsCanvas.height + 100;
    if (this.x - this.half_size > lsCanvas.width)  this.x -= lsCanvas.width  + 100;
  };
  this.drawShadow = function() {
    const d = this.getDots(); const pts = [];
    for (let k in d) {
      const dot = d[k]; const angle = Math.atan2(lsLight.y - dot.y, lsLight.x - dot.x);
      pts.push({ endX: dot.x + this.shadow_length * Math.sin(-angle - Math.PI/2), endY: dot.y + this.shadow_length * Math.cos(-angle - Math.PI/2), startX: dot.x, startY: dot.y });
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const n = i === 3 ? 0 : i + 1;
      lsCtx.beginPath(); lsCtx.moveTo(pts[i].startX, pts[i].startY); lsCtx.lineTo(pts[n].startX, pts[n].startY);
      lsCtx.lineTo(pts[n].endX, pts[n].endY); lsCtx.lineTo(pts[i].endX, pts[i].endY);
      lsCtx.fillStyle = '#0a0000'; lsCtx.fill();
    }
  };
}
function renderLS() {
  if (lsActive) {
    lsCtx.clearRect(0, 0, lsCanvas.width, lsCanvas.height);
    drawLSLight();
    for (let i = 0; i < lsBoxes.length; i++) { lsBoxes[i].rotate(); lsBoxes[i].drawShadow(); }
    for (let i = 0; i < lsBoxes.length; i++) {
      for (let j = lsBoxes.length - 1; j >= 0; j--) {
        if (i !== j) {
          const dx = (lsBoxes[j].x + lsBoxes[j].half_size) - (lsBoxes[i].x + lsBoxes[i].half_size);
          const dy = (lsBoxes[j].y + lsBoxes[j].half_size) - (lsBoxes[i].y + lsBoxes[i].half_size);
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < lsBoxes[j].half_size + lsBoxes[i].half_size) {
            lsBoxes[j].half_size = lsBoxes[j].half_size > 1 ? lsBoxes[j].half_size - 1 : 1;
            lsBoxes[i].half_size = lsBoxes[i].half_size > 1 ? lsBoxes[i].half_size - 1 : 1;
          }
        }
      }
      lsBoxes[i].draw();
    }
  }
  requestAnimationFrame(renderLS);
}
function initLS() {
  resizeLS(); window.addEventListener('resize', resizeLS);
  document.addEventListener('mousemove', e => { lsLight.x = e.clientX; lsLight.y = e.clientY; });
  while (lsBoxes.length < 15) lsBoxes.push(new LSBox());
  renderLS();
}

initLS();
initFireworks();
