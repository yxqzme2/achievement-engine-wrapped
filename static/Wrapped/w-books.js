const s = requireState();
initProgressBars(2);
const hp = initCombatUI();

const stats          = s.stats || {};
const totalStatChips = ((s.userSheet || {}).total_stats) || {};
const str            = totalStatChips.str || 0;
const totalBooks     = (stats.totalBooks || 0);

// damage_calc.md §2B: Math.min(62500, (Books * 400) + (STR * 22))
const rawBooksDmg = totalBooks * 400;
const rawStrDmg   = str * 22;
const totalPotential = rawBooksDmg + rawStrDmg;
const finalBooksDmg  = Math.min(62500, totalPotential);

// Pro-rate the damage if we hit the cap
const capRatio   = totalPotential > 62500 ? (62500 / totalPotential) : 1.0;
const dmgBooks   = rawBooksDmg * capRatio;
const dmgStr     = rawStrDmg * capRatio;

// Get this year's books for the visual shelf
const yearBooks   = (stats.books || []).slice(-30); // Show up to 30 spines
const numCovers   = yearBooks.length;
const perBookHit  = numCovers > 0 ? Math.round(dmgBooks / numCovers) : 0;

// Varied spine colors
const SPINE_COLORS = [
  '#7A1F1F','#1F3D7A','#1A5C35','#5C1F7A','#8B5510',
  '#0F5C5C','#7A3A10','#2A1F7A','#5C6B10','#7A1F4A',
  '#1A3D6B','#3A6B10','#7A1028','#10585A','#4A3A10',
  '#6B3A1F','#1F4A6B','#4A6B1F','#6B1F5C','#3A5C10',
];

function buildSpineHtml(book, index) {
  const color  = SPINE_COLORS[index % SPINE_COLORS.length];
  const title  = (book.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const authors    = (book.authors    || []).join(', ') || '—';
  const narrators  = (book.narrators  || []).join(', ') || '—';
  const durH       = book.durationHours || 0;
  const durStr     = durH > 0 ? `${Math.floor(durH)}h ${Math.round((durH % 1) * 60)}m` : '—';
  const finDate    = book.finishedAt
    ? new Date(book.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  return `<div class="mock-cover s3-cov-item" style="background-color:${color}"` +
    ` data-title="${book.title || ''}"` +
    ` data-authors="${authors}"` +
    ` data-narrators="${narrators}"` +
    ` data-dur="${durStr}"` +
    ` data-finished="${finDate}">` +
    `<span class="book-title">${title}</span></div>`;
}

// Group into two rows visually
const mid = Math.ceil(yearBooks.length / 2);
const row1Html = yearBooks.slice(0, mid).map((b, i) => buildSpineHtml(b, i)).join('');
const row2Html = yearBooks.slice(mid).map((b, i) => buildSpineHtml(b, i + mid)).join('');

document.getElementById('s-books-covers').innerHTML =
  `<div class="s3-shelf" id="s3-row1">${row1Html}</div>` +
  `<div class="s3-shelf s3-shelf-new" id="s3-row2">${row2Html}</div>`;

document.getElementById('s-books-combat-text').textContent = `${totalBooks}-BOOK ARSENAL!`;

const statusText = document.getElementById('s3-status');
const comboText  = document.getElementById('s-books-combat-text');
const glass      = document.querySelector('.s3-content');
comboText.style.opacity = '0';
statusText.innerText = 'Manifesting the arsenal...';

const bossFill = document.getElementById('boss-hp-fill');
if (bossFill) bossFill.classList.add('rapid');

const covers     = document.querySelectorAll('.s3-cov-item');
const chargeDuration = 3000;

// 1. Charging
setTimeout(() => {
  for (let i = 0; i < covers.length; i++) {
    setTimeout(() => {
      if (!covers[i]) return;
      covers[i].classList.add('pop');
      const col = covers[i].style.backgroundColor;
      covers[i].style.boxShadow = `0 0 14px 3px ${col}, inset 3px 0 6px rgba(255,255,255,0.18)`;
      if (i === covers.length - 1) {
        glass.classList.add('extreme-shake');
        statusText.innerText = 'ARSENAL FULLY CHARGED...';
      }
    }, i * (chargeDuration / Math.max(1, covers.length)));
  }
}, 1000);

// 2. Barrage
const barrageStart = 1000 + chargeDuration + 500;
setTimeout(() => {
  glass.classList.remove('extreme-shake');
  statusText.innerText = 'RELEASING ARSENAL!';

  for (let i = 0; i < covers.length; i++) {
    setTimeout(() => {
      const hitX   = window.innerWidth  * (0.2 + Math.random() * 0.6);
      const hitY   = window.innerHeight * (0.15 + Math.random() * 0.3);
      triggerFirework(hitX, hitY);
      spawnDamageText(`-${perBookHit.toLocaleString()}`, 'boss', '#00e5ff', hitX, hitY);
      triggerShake('light');
      updateHP('boss', getState().bossCurrentHP - perBookHit);
      if (covers[i]) covers[i].style.opacity = '0.2';
    }, i * 100);
  }
}, barrageStart);

// 3. STR bonus
const strHitTime = barrageStart + covers.length * 100 + 700;
setTimeout(() => {
  if (dmgStr > 0) {
    const hitX = window.innerWidth  * (0.5);
    const hitY = window.innerHeight * 0.3;
    triggerFirework(hitX, hitY);
    spawnDamageText(`-${Math.round(dmgStr).toLocaleString()} [STR]`, 'boss', '#ff9f0a', hitX, hitY);
    triggerShake('heavy');
    updateHP('boss', getState().bossCurrentHP - dmgStr);
  }
  comboText.style.opacity = '1';
  statusText.innerText = 'TARGET CRITICALLY DAMAGED';
}, strHitTime);

const totalTime = strHitTime + 1500;
setTimeout(() => unlockSlide('books'), totalTime);

// ── Spine tooltips ────────────────────────────────────────────────────────────
const tooltip = document.getElementById('spine-tooltip');
document.getElementById('s-books-covers').addEventListener('mouseover', e => {
  const spine = e.target.closest('.s3-cov-item');
  if (!spine || !tooltip) return;
  tooltip.innerHTML =
    `<div class="tt-title">${spine.dataset.title || '—'}</div>` +
    `<div class="tt-row"><span class="tt-label">Author</span><span class="tt-val">${spine.dataset.authors || '—'}</span></div>` +
    `<div class="tt-row"><span class="tt-label">Narrator</span><span class="tt-val">${spine.dataset.narrators || '—'}</span></div>` +
    `<div class="tt-row"><span class="tt-label">Length</span><span class="tt-val">${spine.dataset.dur || '—'}</span></div>` +
    `<div class="tt-row"><span class="tt-label">Finished</span><span class="tt-val">${spine.dataset.finished || '—'}</span></div>`;
  tooltip.style.display = 'block';
});
document.getElementById('s-books-covers').addEventListener('mousemove', e => {
  if (!tooltip || tooltip.style.display === 'none') return;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tooltip.offsetWidth  > window.innerWidth)  x = e.clientX - tooltip.offsetWidth  - pad;
  if (y + tooltip.offsetHeight > window.innerHeight) y = e.clientY - tooltip.offsetHeight - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
});
document.getElementById('s-books-covers').addEventListener('mouseout', e => {
  if (!e.target.closest('.s3-cov-item') && tooltip) tooltip.style.display = 'none';
});

initFireworks();
