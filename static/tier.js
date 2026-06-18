const tiers = [
  { id: 'S', name: 'S', desc: 'The Gold Standard', color: 's' },
  { id: 'A', name: 'A', desc: 'Excellent',        color: 'a' },
  { id: 'B', name: 'B', desc: 'Very Good',        color: 'b' },
  { id: 'C', name: 'C', desc: 'Average',          color: 'c' },
  { id: 'D', name: 'D', desc: 'Poor',             color: 'd' },
  { id: 'E', name: 'E', desc: 'Dropped',          color: 'e' },
  { id: 'F', name: 'F', desc: 'Did Not Finish',   color: 'f' }
];

const board = document.getElementById('board');
if (board) {
    tiers.forEach(t => {
      board.innerHTML += `
        <div class="tier-row">
          <div class="tier-header ${t.color}">
            <div class="label">${t.name}</div>
            <div class="description">${t.desc}</div>
          </div>
          <div class="items" id="tier-${t.id}"></div>
        </div>`;
    });
}

const _statusEl = () => document.getElementById('status');
function setStatus(msg, isBad = false) {
  const el = _statusEl();
  if (!el) return;
  el.textContent = msg;
  el.style.color = isBad ? '#ffb3b3' : '#b7ffb7';
}

function attachLongPressToReturn(el) {
  let timer = null;
  let moved = false;

  const start = (e) => {
    moved = false;
    if (e.pointerType === 'mouse') return;
    timer = setTimeout(() => {
      if (!moved) sendToLibrary(el);
    }, 600);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  el.addEventListener('pointerdown', (e) => start(e));
  el.addEventListener('pointermove', () => { moved = true; cancel(); });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
}

function sendToLibrary(el) {
  const lib = document.getElementById('library');
  if (lib) lib.appendChild(el);
  clearPicked();
}

// Series-progress badge counts: filename -> number
let _seriesProgress = {};

function applyBadges() {
  document.querySelectorAll('.book-wrap').forEach(wrap => {
    const fname = wrap.dataset._fname || '';
    const count = _seriesProgress[fname] || 0;
    let badge = wrap.querySelector('.book-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'book-badge';
        wrap.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

async function loadSeriesProgress(userId) {
  if (!userId) {
    _seriesProgress = {};
    applyBadges();
    return;
  }
  try {
    const res = await fetch(`/awards/api/tier/series-progress?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object') {
      _seriesProgress = data;
      applyBadges();
    }
  } catch (_) {}
}

async function populateBadgeUserSelect() {
  const sel = document.getElementById('badge-user-select');
  if (!sel) return;
  try {
    const res = await fetch(API_TIER_USERS, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const users = Array.isArray(data?.users) ? data.users : [];
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.username;
      sel.appendChild(opt);
    });
    // Auto-select if userId already in URL
    const urlUserId = new URLSearchParams(window.location.search).get('userId') || '';
    if (urlUserId && users.find(u => u.user_id === urlUserId)) {
      sel.value = urlUserId;
    }
  } catch (_) {}
}

function onBadgeUserChange(userId) {
  loadSeriesProgress(userId);
}

async function loadLibrary() {
  const lib = document.getElementById('library');
  if (!lib) return;
  try {
    setStatus('Loading covers…');
    const response = await fetch('/awards/covers/', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bodyText = await response.text();
    let files = [];

    try {
      const json = JSON.parse(bodyText);
      if (Array.isArray(json)) files = json;
      else if (json && Array.isArray(json.files)) files = json.files;
    } catch (_) {
      const doc = new DOMParser().parseFromString(bodyText, 'text/html');
      const links = Array.from(doc.querySelectorAll('a[href]'))
        .map(a => (a.getAttribute('href') || '').split('?')[0].split('#')[0]);

      const names = links
        .map(h => { try { return decodeURIComponent(h); } catch(e) { return h; } })
        .filter(h => h && !h.startsWith('../') && !h.startsWith('..'))
        .filter(h => /\.(webp|png|jpg|jpeg)$/i.test(h))
        .map(h => h.replace(/^\.?\//, ''));

      files = names.map(name => ({ name }));
    }

    lib.innerHTML = '';
    const imgFiles = files
      .map(f => (typeof f === 'string' ? { name: f } : f))
      .filter(f => f && f.name && /\.(webp|png|jpg|jpeg)$/i.test(f.name));

    if (imgFiles.length === 0) {
      setStatus('No images found in ./covers/', true);
      return;
    }

    imgFiles.forEach(file => {
      // Wrapper div is the drag/click target
      const wrap = document.createElement('div');
      wrap.className = 'book-wrap';
      wrap.draggable = true;
      wrap.id = btoa(unescape(encodeURIComponent(file.name)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      wrap.dataset.name = file.name
        .replace(/\.(webp|png|jpg|jpeg)$/i, '')
        .replace(/_/g, ' ')
        .toLowerCase();
      wrap.dataset._fname = file.name;

      const img = document.createElement('img');
      const encoded = encodeURIComponent(file.name).replace(/%2F/g, '/');
      img.src = `/awards/covers/${encoded}`;
      img.alt = wrap.dataset.name;
      img.draggable = false;
      wrap.appendChild(img);

      wrap.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', wrap.id);
      });

      wrap.addEventListener('contextmenu', e => {
        e.preventDefault();
        sendToLibrary(wrap);
      });

      attachLongPressToReturn(wrap);
      lib.appendChild(wrap);
    });

    setStatus(`Loaded ${imgFiles.length} covers.`);

    // Augment wrappers with book titles from meta (for search)
    try {
      const metaRes = await fetch('/awards/api/covers-meta', { cache: 'no-store' });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        document.querySelectorAll('#library .book-wrap').forEach(wrap => {
          const entry = meta[wrap.dataset._fname] || null;
          if (entry && Array.isArray(entry.books)) {
            wrap.dataset.books = entry.books.map(t => t.toLowerCase()).join(' | ');
          }
        });
      }
    } catch (_) {}

    parseUrlParams();

    // Load badges if userId is in URL
    const userId = new URLSearchParams(window.location.search).get('userId') || '';
    if (userId) await loadSeriesProgress(userId);

  } catch (err) {
    console.error('Covers scan failed:', err);
    setStatus('Cover scan failed (check ./covers/).', true);
  }
}

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  params.forEach((value, key) => {
    if (key === 'userId') return;
    const zone = document.getElementById(`tier-${key}`);
    const bookIds = value.split(',');
    bookIds.forEach(id => {
      const book = document.getElementById(id);
      if (book && zone) zone.appendChild(book);
    });
  });
}

function _bookMatches(wrap, query) {
  if (!query) return true;
  if ((wrap.dataset.name || '').includes(query)) return true;
  if ((wrap.dataset.books || '').includes(query)) return true;
  return false;
}

function filterLibrary() {
  const input = document.getElementById('search-bar');
  const query = (input.value || '').toLowerCase().trim();
  document.querySelectorAll('#library .book-wrap').forEach(wrap => {
    wrap.style.display = _bookMatches(wrap, query) ? 'flex' : 'none';
  });
  renderSearchPopover(query);
}

function niceNameFromDataset(dsName) {
  const s = (dsName || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.split(' ').slice(0, 6).map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
}

function renderSearchPopover(query) {
  const pop = document.getElementById('search-results');
  const grid = document.getElementById('sr-grid');
  if (!pop || !grid) return;

  if (!query) {
    pop.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  const all = Array.from(document.querySelectorAll('.book-wrap'));
  const matches = all.filter(wrap => _bookMatches(wrap, query));
  const MAX = 24;
  const shown = matches.slice(0, MAX);

  grid.innerHTML = '';
  shown.forEach(wrap => {
    const item = document.createElement('div');
    item.className = 'sr-item';
    item.setAttribute('role', 'option');
    const thumb = document.createElement('img');
    thumb.className = 'sr-thumb';
    const innerImg = wrap.querySelector('img');
    thumb.src = innerImg ? innerImg.src : '';
    thumb.alt = '';
    const name = document.createElement('div');
    name.className = 'sr-name';
    name.textContent = niceNameFromDataset(wrap.dataset.name);
    item.appendChild(thumb);
    item.appendChild(name);
    item.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      setPicked(wrap, window.innerWidth / 2, 100);
      const target = document.getElementById('capture-area');
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY + 55;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
    grid.appendChild(item);
  });

  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#888'; empty.style.fontSize = '12px'; empty.style.padding = '8px 2px';
    empty.textContent = 'No matches.';
    grid.appendChild(empty);
  }
  pop.style.display = 'block';
}

function closeSearchPopover() {
  const pop = document.getElementById('search-results');
  const grid = document.getElementById('sr-grid');
  if (pop) pop.style.display = 'none';
  if (grid) grid.innerHTML = '';
}

function generateShareLink() {
  const params = new URLSearchParams();
  document.querySelectorAll('.items').forEach(zone => {
    if (zone.id === 'library') return;
    const bookIds = Array.from(zone.children).map(el => el.id).filter(Boolean);
    if (bookIds.length > 0) params.set(zone.id.replace('tier-', ''), bookIds.join(','));
  });
  const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  navigator.clipboard.writeText(shareUrl).then(() => alert('Share link copied!'));
}

function clearProgress() {
  if (confirm('Reset board?')) window.location.href = window.location.pathname;
}

// --- SAVED LISTS LOGIC ---
const API_TIER_LISTS = '/api/tier-lists';
const API_TIER_USERS = '/api/tier-users';
const API_SET_PIN = '/awards/api/gear/set-pin';
let _savedLists = [];
let _tierUsersCache = [];
let _pendingSaveQuery = '';

function getCurrentUserToken() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('userId') ||
    params.get('user') ||
    params.get('username') ||
    params.get('uid') ||
    ''
  ).trim();
}

function _norm(s) {
  return String(s || '').trim().toLowerCase();
}

async function fetchSavedLists() {
  const res = await fetch(API_TIER_LISTS, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _savedLists = Array.isArray(data?.lists) ? data.lists : [];
  return _savedLists;
}

async function loadTierUsers() {
  if (_tierUsersCache.length) return _tierUsersCache;
  const res = await fetch(API_TIER_USERS, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _tierUsersCache = Array.isArray(data?.users) ? data.users : [];
  return _tierUsersCache;
}

async function saveCurrentList() {
  const params = new URLSearchParams();
  document.querySelectorAll('.items').forEach(zone => {
    if (zone.id === 'library') return;
    const bookIds = Array.from(zone.children).map(el => el.id).filter(Boolean);
    if (bookIds.length > 0) params.set(zone.id.replace('tier-', ''), bookIds.join(','));
  });

  const query = params.toString();
  if (!query) {
    alert('List is empty! Add some books first.');
    return;
  }

  _pendingSaveQuery = query;
  await openSaveModal();
}

async function openSaveModal() {
  const modal = document.getElementById('save-modal');
  const userSel = document.getElementById('save-user-select');
  const nameEl = document.getElementById('save-list-name');
  const pinEl = document.getElementById('save-user-pin');
  if (!modal || !userSel || !nameEl || !pinEl) return;

  try {
    const users = await loadTierUsers();
    userSel.innerHTML = '';
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.username;
      userSel.appendChild(opt);
    });
    if (!users.length) throw new Error('No users available');

    const applyName = () => {
      const selected = users.find(x => x.user_id === userSel.value);
      nameEl.value = selected ? `${selected.username} Tier List` : 'Tier List';
    };
    userSel.onchange = applyName;
    applyName();

    pinEl.value = '';
    modal.style.display = 'flex';
    setTimeout(() => pinEl.focus(), 20);
  } catch (e) {
    setStatus(`Unable to load users: ${e.message}`, true);
  }
}

function closeSaveModal() {
  const modal = document.getElementById('save-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmSaveModal() {
  const userSel = document.getElementById('save-user-select');
  const nameEl = document.getElementById('save-list-name');
  const pinEl = document.getElementById('save-user-pin');
  const user_id = (userSel?.value || '').trim();
  const name = (nameEl?.value || '').trim();
  const pin = (pinEl?.value || '').trim();

  if (!user_id || !_pendingSaveQuery) {
    setStatus('Missing save payload.', true);
    return;
  }
  if (!pin) {
    setStatus('PIN is required.', true);
    return;
  }

  const payload = { user_id, name, query: _pendingSaveQuery, pin };

  const trySave = async () => {
    const res = await fetch(API_TIER_LISTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  try {
    let attempt = await trySave();

    if (!attempt.res.ok) {
      const detail = String(attempt.data?.detail || '');
      const pinMissing = attempt.res.status === 403 && /pin not set/i.test(detail);

      if (pinMissing) {
        const createPin = confirm('No PIN found for this user. Create a new PIN with the one you entered now?');
        if (!createPin) throw new Error('PIN required for this user.');

        const setRes = await fetch(API_SET_PIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, pin }),
        });
        const setData = await setRes.json().catch(() => ({}));
        if (!setRes.ok) throw new Error(setData?.detail || `HTTP ${setRes.status}`);

        attempt = await trySave();
        if (!attempt.res.ok) {
          throw new Error(attempt.data?.detail || `HTTP ${attempt.res.status}`);
        }
      } else {
        throw new Error(detail || `HTTP ${attempt.res.status}`);
      }
    }

    closeSaveModal();
    _pendingSaveQuery = '';
    await renderSavedLists();
    setStatus('List saved to server.');
  } catch (e) {
    setStatus(`Save failed: ${e.message}`, true);
  }
}

function loadSavedListByQuery(save) {
  if (!save || !save.query) return;

  const lib = document.getElementById('library');
  document.querySelectorAll('.tier-row .items .book-wrap').forEach(wrap => {
    lib.appendChild(wrap);
  });

  const params = new URLSearchParams(save.query);
  params.forEach((value, key) => {
    if (key === 'userId') return;
    const zone = document.getElementById(`tier-${key}`);
    const bookIds = value.split(',');
    bookIds.forEach(id => {
      const book = document.getElementById(id);
      if (book && zone) zone.appendChild(book);
    });
  });

  const newUrl = window.location.pathname + '?' + save.query;
  window.history.pushState({ path: newUrl }, '', newUrl);
  setStatus(`Loaded: ${save.name} (${save.username})`);
}

async function deleteSavedList(e, ownerUserId) {
  e.stopPropagation();
  const pin = (prompt('Enter PIN to delete this saved list:') || '').trim();
  if (!pin) return;

  try {
    const q = encodeURIComponent(ownerUserId);
    const res = await fetch(`${API_TIER_LISTS}/${q}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
    await renderSavedLists();
    setStatus('Saved list deleted.');
  } catch (e2) {
    console.error('deleteSavedList failed:', e2);
    setStatus(`Delete failed: ${e2.message}`, true);
  }
}

async function renderSavedLists() {
  const container = document.getElementById('saved-lists');
  if (!container) return;

  try {
    const saves = await fetchSavedLists();
    if (saves.length === 0) {
      container.innerHTML = '<div class="no-saves">No saved lists yet.</div>';
      return;
    }

    container.innerHTML = '';
    saves.forEach((save) => {
      const dateStr = save.updated_at ? new Date(save.updated_at * 1000).toLocaleDateString() : '';

      const item = document.createElement('div');
      item.className = 'save-item';
      item.onclick = () => loadSavedListByQuery(save);

      item.innerHTML = `
        <div class="save-item-name">${save.name}</div>
        <div class="save-item-meta">${save.username} • ${dateStr}</div>
        <div class="save-item-actions">
          <button class="mini-btn delete" onclick="deleteSavedList(event, '${save.user_id}')">Delete</button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (e) {
    console.error('renderSavedLists failed:', e);
    container.innerHTML = '<div class="no-saves">Failed to load saved lists.</div>';
    setStatus(`Saved-list load failed: ${e.message}`, true);
  }
}

let picked = null;
const ghost = document.getElementById('picked-ghost');

function clearPicked() {
  if (picked) picked.classList.remove('selected');
  picked = null;
  if (ghost) {
    ghost.style.display = 'none';
    ghost.src = '';
  }
}

function setPicked(el, x, y) {
  if (picked) picked.classList.remove('selected');
  picked = el;
  picked.classList.add('selected');
  if (ghost) {
    const innerImg = el.querySelector('img');
    ghost.src = innerImg ? innerImg.src : '';
    ghost.style.display = 'block';
    ghost.style.left = x + 'px';
    ghost.style.top = y + 'px';
  }
}

function exportTierList() {
  html2canvas(document.getElementById('capture-area'), { useCORS: true, backgroundColor: '#1a1a1b' })
    .then(canvas => {
      const link = document.createElement('a');
      link.download = 'My-LitRPG-Tier-List.png';
      link.href = canvas.toDataURL();
      link.click();
    });
}

let _syncPoll = null;
async function syncCovers() {
  const btn = document.getElementById('sync-btn');
  if (btn) btn.disabled = true;
  setStatus('Starting cover sync…');
  try {
    const res = await fetch('/awards/api/sync-covers', { method: 'POST' });
    const data = await res.json();
    if (res.status === 409) {
      setStatus('Sync already running…');
      _startSyncPoll(btn);
      return;
    }
    if (!res.ok || !data.started) {
      setStatus('Sync failed: ' + (data.message || 'unknown error'), true);
      if (btn) btn.disabled = false;
      return;
    }
    setStatus('Syncing…');
    _startSyncPoll(btn);
  } catch (err) {
    setStatus('Sync error: ' + err.message, true);
    if (btn) btn.disabled = false;
  }
}

function _startSyncPoll(btn) {
  if (_syncPoll) clearInterval(_syncPoll);
  _syncPoll = setInterval(async () => {
    try {
      const sr = await fetch('/awards/api/sync-covers/status');
      const sd = await sr.json();
      const progress = sd.total > 0 ? ` (${sd.synced + sd.skipped + sd.errors}/${sd.total})` : '';
      setStatus(sd.message + progress);
      if (sd.done) {
        clearInterval(_syncPoll);
        _syncPoll = null;
        if (btn) btn.disabled = false;
        if (sd.synced > 0) setTimeout(() => loadLibrary(), 1200);
      }
    } catch (e) {
      clearInterval(_syncPoll);
      _syncPoll = null;
      if (btn) btn.disabled = false;
      setStatus('Status check failed', true);
    }
  }, 1500);
}

// Global exposure
window.onBadgeUserChange = onBadgeUserChange;
window.filterLibrary = filterLibrary;
window.generateShareLink = generateShareLink;
window.exportTierList = exportTierList;
window.syncCovers = syncCovers;
window.clearProgress = clearProgress;
window.saveCurrentList = saveCurrentList;
window.deleteSavedList = deleteSavedList;
window.closeSaveModal = closeSaveModal;
window.confirmSaveModal = confirmSaveModal;

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();
    renderSavedLists();
    populateBadgeUserSelect();
    const _sb = document.getElementById('search-bar');
    if (_sb) {
        _sb.addEventListener('focus', () => {
            const q = (_sb.value || '').toLowerCase().trim();
            if (q) renderSearchPopover(q);
        });
        _sb.addEventListener('input', () => filterLibrary(), { passive: true });
    }
    document.addEventListener('mousemove', (e) => {
      if (!picked || !ghost || ghost.style.display !== 'block') return;
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
    }, { passive: true });
    document.addEventListener('click', (e) => {
      // Find the nearest .book-wrap ancestor (covers clicks on inner img or badge)
      const wrap = e.target.closest ? e.target.closest('.book-wrap') : null;
      if (!wrap) {
        if (picked) {
            const zone = e.target.closest && e.target.closest('.items');
            if (zone && zone.id !== 'library' && !e.target.closest('.book-wrap')) {
                zone.appendChild(picked);
                clearPicked();
            }
        }
        const searchWrap = document.querySelector('.search-wrap');
        if (searchWrap && !searchWrap.contains(e.target)) closeSearchPopover();
        return;
      }
      if (picked && picked === wrap) { clearPicked(); return; }
      setPicked(wrap, e.clientX, e.clientY);
      const lib = document.getElementById('library');
      if (lib && lib.contains(wrap)) {
        const target = document.getElementById('capture-area');
        if (target) {
          const y = target.getBoundingClientRect().top + window.scrollY + 55;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { clearPicked(); closeSearchPopover(); if (_sb) _sb.blur(); }
    });
    document.addEventListener('dragover', (e) => {
      const zone = e.target.closest && e.target.closest('.items');
      if (zone && (zone.closest('#capture-area') || zone.closest('#library-section'))) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      const zone = e.target.closest && e.target.closest('.items');
      if (zone && (zone.closest('#capture-area') || zone.closest('#library-section'))) {
        e.preventDefault();
        const id = e.dataTransfer.getData('text');
        const el = document.getElementById(id);
        if (el) zone.appendChild(el);
        clearPicked();
      }
    });
});
