const s = requireState();
initProgressBars(7);
initFireworks();

const stats     = s.stats     || {};
const userSheet = s.userSheet || {};
const ts        = userSheet.total_stats || {};
const cp        = userSheet.combat_power || 0;

// ── Identity ─────────────────────────────────────────────────────────────────
const username = s.username || s.userId || '—';
document.getElementById('wc-username').textContent = username.toUpperCase();
document.getElementById('wc-level').textContent    = userSheet.level || '—';
document.getElementById('wc-cp').textContent       = cp.toLocaleString();

// ── Hero Avatar (win-{username}.png naming convention) ────────────────────────
const avatarEl = document.getElementById('wc-avatar');
const heroBg   = document.getElementById('wc-hero-bg');
if (avatarEl && username && username !== '—') {
  const winFile = `win-${username.toLowerCase()}.png`;
  avatarEl.style.opacity    = '0';
  avatarEl.style.transition = 'opacity 0.6s';
  avatarEl.src = `/awards/api/portraits/${encodeURIComponent(winFile)}`;
  avatarEl.onload  = () => { avatarEl.style.opacity = '1'; };
  avatarEl.onerror = () => {
    // fallback 1: standard portrait
    avatarEl.src = `/awards/api/portraits/${encodeURIComponent(username)}.png`;
    avatarEl.onerror = () => {
      // fallback 2: generated avatar
      avatarEl.src = `/awards/api/avatar/${encodeURIComponent(s.userId || username)}`;
      avatarEl.onerror = () => {
        avatarEl.style.display = 'none';
        if (heroBg) heroBg.textContent = username.charAt(0).toUpperCase();
      };
    };
  };
}

// ── Stat chips ────────────────────────────────────────────────────────────────
const statGrid = document.getElementById('wc-stat-grid');
if (statGrid) {
  statGrid.innerHTML =
    `<div class="wc-stat-chip str">STR&nbsp;${ts.str || 0}</div>` +
    `<div class="wc-stat-chip mag">MAG&nbsp;${ts.mag || 0}</div>` +
    `<div class="wc-stat-chip def">DEF&nbsp;${ts.def || 0}</div>` +
    `<div class="wc-stat-chip hp">HP&nbsp;${ts.hp  || 0}</div>`;
}

// ── Item Tooltip (matches character sheet) ────────────────────────────────────
const RARITY_COLORS = {
  Common: '#ffffff', Uncommon: '#1eff00', Rare: '#0070dd',
  Epic: '#a335ee', Legendary: '#ff8000'
};
const RARITY_GLOW = {
  Common: 'rgba(160,160,160,0.15)', Uncommon: 'rgba(30,255,0,0.12)',
  Rare: 'rgba(0,112,221,0.18)', Epic: 'rgba(163,53,238,0.22)', Legendary: 'rgba(255,128,0,0.28)'
};

const wcTooltip = document.getElementById('wc-tooltip');

function buildItemTooltip(it) {
  const col  = RARITY_COLORS[it.rarity] || '#aaa';
  const glow = RARITY_GLOW[it.rarity]   || 'rgba(0,0,0,0)';
  const statLines = [];
  if (it.str > 0) statLines.push(`+${it.str} STR`);
  if (it.mag > 0) statLines.push(`+${it.mag} MAG`);
  if (it.def > 0) statLines.push(`+${it.def} DEF`);
  if (it.hp  > 0) statLines.push(`+${it.hp} HP`);
  const flavorText = it.flavor_text || it.flavor || '';
  return `
    <div class="tt-card" style="border-color:${col};box-shadow:0 6px 24px rgba(0,0,0,0.95),0 0 20px ${glow},inset 0 0 15px rgba(255,255,255,0.03)">
      <div class="tt-title" style="color:${col}">${it.item_name}</div>
      <div class="tt-type-row">
        <span>${it.slot}</span>
        <span>${it.rarity} &middot; iLvl ${it.item_level || 0}</span>
      </div>
      <div class="tt-stats">${statLines.join('<br>') || '—'}</div>
      ${it.special_ability ? `<div class="tt-equip">Equip: ${it.special_ability}</div>` : ''}
      ${flavorText         ? `<div class="tt-flavor">"${flavorText}"</div>` : ''}
      ${it.series_tag      ? `<div class="tt-series">Series: ${it.series_tag}</div>` : ''}
    </div>`;
}

function showGearTooltip(it, e) {
  wcTooltip.innerHTML = buildItemTooltip(it);
  wcTooltip.style.display = 'flex';
  moveGearTooltip(e);
}
function moveGearTooltip(e) {
  const x = e.clientX + 16, y = e.clientY + 16;
  const w = wcTooltip.offsetWidth, h = wcTooltip.offsetHeight;
  wcTooltip.style.left = ((x + w > window.innerWidth)  ? Math.max(4, x - w - 20) : x) + 'px';
  wcTooltip.style.top  = ((y + h > window.innerHeight) ? Math.max(4, y - h - 20) : y) + 'px';
}
function hideGearTooltip() {
  wcTooltip.style.display = 'none';
}

// ── Equipped Gear (from userSheet.equipped — a slot→item dict) ────────────────
const SLOT_ORDER  = ['Head','Chest','Weapon','Neck','Ring','Trinket'];
const SLOT_LABELS = { Head:'HEAD', Chest:'CHEST', Weapon:'WEAPON', Neck:'NECK', Ring:'RING', Trinket:'TRINKET' };

const equippedMap = userSheet.equipped || {};

const gearSlots = document.getElementById('wc-gear-slots');
if (gearSlots) {
  gearSlots.innerHTML = '';
  for (const slot of SLOT_ORDER) {
    const it  = equippedMap[slot];
    const row = document.createElement('div');
    if (it) {
      row.className = `wc-gear-row wc-r-${it.rarity || 'Common'}`;
      row.innerHTML =
        `<span class="wc-gear-slot-lbl">${SLOT_LABELS[slot]}</span>` +
        `<span class="wc-gear-name">${it.item_name || it.item_id || '—'}</span>` +
        `<span class="wc-gear-ilvl">iLvl ${it.item_level || 0}</span>`;
      row.style.cursor = 'help';
      row.addEventListener('mouseover', e => showGearTooltip(it, e));
      row.addEventListener('mousemove',  e => moveGearTooltip(e));
      row.addEventListener('mouseout',   () => hideGearTooltip());
    } else {
      row.className = 'wc-gear-row wc-gear-empty';
      row.innerHTML =
        `<span class="wc-gear-slot-lbl">${SLOT_LABELS[slot]}</span>` +
        `<span class="wc-gear-name">— unequipped —</span>`;
    }
    gearSlots.appendChild(row);
  }
}

// ── Year Chronicle ────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function activeMonth() {
  const m = stats.mostActiveMonth;
  if (m == null) return '—';
  if (typeof m === 'number') return MONTHS[m] || '—';
  return String(m);
}

function fmt(n, unit = '') {
  if (n == null || n === 0) return '—';
  return n.toLocaleString() + (unit ? ' ' + unit : '');
}

const seriesCount   = Array.isArray(stats.seriesCompleted) ? stats.seriesCompleted.length : (stats.seriesCompleted || 0);
const topAuthorName = stats.topAuthor?.name  || '—';
const topAuthorHrs  = stats.topAuthor?.hours ? ` (${stats.topAuthor.hours}h)` : '';
const topNarratorName = stats.topNarrator?.name || '—';
const topNarratorHrs  = stats.topNarrator?.hours ? ` (${stats.topNarrator.hours}h)` : '';

const chronicle = document.getElementById('wc-chronicle');

if (chronicle) {
  const rows = [
    ['⏱ Hours Listened',    fmt(stats.totalHours, 'hrs'),           'gold'],
    ['📚 Books Completed',  fmt(stats.totalBooks),                  'gold'],
    seriesCount > 0 
      ? ['✅ Series Cleared', `${seriesCount} series`,              'highlight'] 
      : null,
    ['🔥 Longest Streak',   fmt(stats.longestStreak, 'days'),       'highlight'],
    ['⚡ Binge Sessions',   fmt(stats.bingeSessionCount),           ''],
    ['📅 Peak Month',       activeMonth(),                          ''],
    ['🏆 Achievements',     fmt(stats.questsCompleted),             ''],
    ['✍ Distinct Authors', fmt(stats.distinctAuthors),             ''],
    ['📖 Top Author',       topAuthorName + topAuthorHrs,           ''],
    ['🎙 Top Narrator',     topNarratorName + topNarratorHrs,       '']
  ].filter(Boolean); // Correctly filters out the 'null' if seriesCount is 0

  chronicle.innerHTML = rows.map(([label, value, cls]) =>
    `<div class="wc-stat-row">` +
      `<span class="wc-stat-label">${label}</span>` +
      `<span class="wc-stat-value ${cls || ''}">${value}</span>` +
    `</div>`
  ).join('');
}

// ── Personality footer ────────────────────────────────────────────────────────
const pers   = stats.personality || {};
const persEl = document.getElementById('wc-personality');
if (persEl && pers.name) {
  persEl.textContent = `${pers.icon || ''}  ${pers.name.toUpperCase()}`;
}

// ── Character sheet link ──────────────────────────────────────────────────────
const charLink = document.getElementById('gear-char-link');
if (charLink && s.userId) charLink.href = `/character?userId=${encodeURIComponent(s.userId)}`;

// ── Screenshot Button ─────────────────────────────────────────────────────────
document.getElementById('wc-screenshot-btn').addEventListener('click', () => {
  const card = document.getElementById('win-card');
  const btn = document.getElementById('wc-screenshot-btn');
  btn.disabled = true;
  btn.textContent = '⌛ PROCESSING...';

  // Use html2canvas to capture the card
  // We specify useCORS: true to allow capturing cross-origin images (like the avatar)
  html2canvas(card, {
    useCORS: true,
    backgroundColor: '#07080f',
    scale: 2, // Higher quality
    logging: false
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = `Sanctum_Wrapped_2026_${username}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    btn.disabled = false;
    btn.textContent = '📸 SCREENSHOT';
  }).catch(err => {
    console.error('Screenshot failed:', err);
    btn.disabled = false;
    btn.textContent = '❌ FAILED';
    setTimeout(() => { btn.textContent = '📸 SCREENSHOT'; }, 2000);
  });
});

// ── Continue button ───────────────────────────────────────────────────────────
document.getElementById('wc-continue-btn').addEventListener('click', () => navigate('outro'));

// Overwrite the default tap-to-continue if it exists in w-shared.js
// We only want navigation via the continue button on this slide.
if (window.removeEventListener) {
  // Try to find if w-shared.js added a listener we can neutralize
  // Since we can't easily remove anonymous listeners from w-shared, 
  // we'll just ensure navigate() doesn't fire globally if possible.
  // Actually, better to just let the button handle it and avoid global clicks.
}

// ── Animate in ───────────────────────────────────────────────────────────────
const actions = document.getElementById('wc-actions');
setTimeout(() => {
  if (actions) actions.style.opacity = '1';
  // Legendary fireworks
  const legendaries = Object.values(equippedMap).filter(it => it && it.rarity === 'Legendary');
  for (let i = 0; i < legendaries.length && i < 4; i++) {
    setTimeout(() => {
      triggerFirework(
        150 + Math.random() * (window.innerWidth  - 300),
        100 + Math.random() * (window.innerHeight - 250)
      );
    }, i * 400);
  }
  // Always at least one firework on victory
  if (!legendaries.length) {
    triggerFirework(window.innerWidth * 0.3, window.innerHeight * 0.4);
    setTimeout(() => triggerFirework(window.innerWidth * 0.7, window.innerHeight * 0.3), 500);
  }
}, 600);

unlockSlide('gear');

// ── Disable global tap-to-continue for this specific slide ──────────────────
// We want to force the use of the "Continue" button or the Character Sheet link.
// unlockSlide adds a one-time click listener to document, we remove it immediately.
setTimeout(() => {
  document.removeEventListener('click', () => goNext('gear'));
  // Since unlockSlide uses an anonymous function, the above might not work.
  // We'll use a more aggressive approach: stop propagation on the slide content
  // to prevent it from reaching the document click listener.
  document.getElementById('slide-content').addEventListener('click', (e) => {
    e.stopPropagation();
  });
}, 10);
