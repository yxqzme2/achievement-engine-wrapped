/* ===================================================
   Character Sheet — Logic
   Shared by pages/character_sheet.html and pages/test/character_sheet.html
   Admin flag is auto-detected from URL path (/test/).
=================================================== */

const RARITY_COLORS = {
    Common:    '#ffffff',
    Uncommon:  '#1eff00',
    Rare:      '#0070dd',
    Epic:      '#a335ee',
    Legendary: '#ff8000'
};

/* ---- Helpers ---- */
function fmt(n) { return Number(n || 0).toLocaleString(); }
function cleanItemText(value) {
    const s = String(value ?? '').trim();
    return !s || s.toLowerCase() === 'none' ? '' : s;
}

function buildTooltipHTML(item, emptyLabel) {
    if (!item) {
        return `<div class="tt-card tt-empty">${emptyLabel || 'Nothing equipped'}</div>`;
    }
    const col = RARITY_COLORS[item.rarity] || '#aaa';
    const glowMap = {
        Common: 'rgba(160,160,160,0.15)', Uncommon: 'rgba(30,255,0,0.12)',
        Rare: 'rgba(0,112,221,0.18)', Epic: 'rgba(163,53,238,0.22)', Legendary: 'rgba(255,128,0,0.28)'
    };
    const glow = glowMap[item.rarity] || 'rgba(0,0,0,0)';
    const slot = cleanItemText(item.slot) || 'Unknown Slot';
    const specialAbility = cleanItemText(item.special_ability);
    const flavorText = cleanItemText(item.flavor_text);
    const statLines = [];
    if (item.str > 0) statLines.push(`+${item.str} STR`);
    if (item.mag > 0) statLines.push(`+${item.mag} MAG`);
    if (item.def > 0) statLines.push(`+${item.def} DEF`);
    if (item.hp  > 0) statLines.push(`+${item.hp} HP`);
    return `
        <div class="tt-card" style="border-color:${col};box-shadow:0 6px 24px rgba(0,0,0,0.95),0 0 20px ${glow},inset 0 0 15px rgba(255,255,255,0.03)">
            <div class="tt-title" style="color:${col}">${item.item_name}</div>
            <div class="tt-type-row">
                <span>${slot}</span>
                <span>${item.rarity} &middot; iLvl ${item.item_level || 0}</span>
            </div>
            <div class="tt-stats">${statLines.join('<br>') || '—'}</div>
            ${specialAbility ? `<div class="tt-equip">Equip: ${specialAbility}</div>` : ''}
            ${flavorText ? `<div class="tt-flavor">"${flavorText}"</div>` : ''}
            ${item.series_tag      ? `<div class="tt-series">Series: ${item.series_tag}</div>` : ''}
        </div>
    `;
}

/* ---- Fill a single equipment slot ---- */
function fillSlot(slotKey, item) {
    const slotEl = document.getElementById('slot-' + slotKey);
    const tipEl  = document.getElementById('tip-'  + slotKey);
    if (!slotEl || !tipEl) return;

    // Clear previous state so this is safe to call multiple times
    slotEl.querySelectorAll('.slot-icon-img').forEach(img => img.remove());
    slotEl.classList.remove('equipped');
    slotEl.style.borderColor = ''; slotEl.style.borderStyle = ''; slotEl.style.boxShadow = '';
    const labelEl0 = slotEl.querySelector('.slot-label');
    if (labelEl0) { labelEl0.style.display = ''; labelEl0.style.color = ''; labelEl0.textContent = '---'; }
    tipEl.innerHTML = '';

    if (item) {
        const col = RARITY_COLORS[item.rarity] || 'var(--system-blue)';
        slotEl.style.borderColor = col;
        slotEl.style.borderStyle = 'solid';
        slotEl.style.boxShadow   = `0 0 10px ${col}55`;
        slotEl.classList.add('equipped');

        const labelEl = slotEl.querySelector('.slot-label');

        if (item.icon) {
            const img = document.createElement('img');
            const cb  = Date.now();
            const iconSrc = item.icon.startsWith('http') ? item.icon : `/icons/${item.icon}`;
            img.src       = iconSrc + (iconSrc.includes('?') ? '&' : '?') + 't=' + cb;
            img.alt       = item.item_name;
            img.className = 'slot-icon-img';
            img.onerror   = function() {
                this.style.display = 'none';
                if (labelEl) { labelEl.style.display = ''; labelEl.style.color = col; labelEl.textContent = '???'; }
            };
            slotEl.insertBefore(img, tipEl);
            if (labelEl) labelEl.style.display = 'none';
        } else {
            if (labelEl) labelEl.style.color = col;
        }

        tipEl.innerHTML = buildTooltipHTML(item);
    }
}


/* ---- Load character data ---- */
async function loadCharacter() {
    const params  = new URLSearchParams(window.location.search);
    const userId  = params.get('userId') || params.get('user_id');
    const isAdmin = true; // Forced admin mode for live deployment

    const overlay = document.getElementById('loading-overlay');
    const root    = document.getElementById('sheet-root');

    if (!userId) {
        overlay.innerHTML = '<div style="color:#ff5555">MISSING ?userId= PARAMETER</div><div style="margin-top:10px;font-size:0.85rem;color:#84ffff">Append ?userId=YOUR_USER_ID to the URL</div>';
        return;
    }

    try {
        const url = `/awards/api/character/${encodeURIComponent(userId)}` + (isAdmin ? '?admin=true' : '');
        const res = await fetch(url);
        if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`${res.status}: ${errText}`);
        }
        const d = await res.json();
        lastCharacterSheet = d;

        /* Header */
        document.getElementById('char-name').textContent          = (d.username || userId).toUpperCase();
        document.getElementById('char-level').textContent         = d.level;
        document.getElementById('class-title-header').textContent = 'Title: ' + (d.class_title || '---');

        /* Limbo */
        if (d.is_limbo) {
            const limboOverlay = document.getElementById('limbo-overlay');
            const limboTag     = document.getElementById('limbo-tag');
            const invBtn       = document.getElementById('inv-toggle-btn');
            if (limboOverlay) limboOverlay.style.display = 'block';
            if (limboTag)     limboTag.style.display     = 'block';
            if (invBtn)       invBtn.style.display       = 'none';
        }

        /* Avatar portrait: username.png → userId.png → ABS avatar API
           No ?t= cache-buster: let the browser cache portrait lookups so
           missing-portrait fallbacks don't re-fire on every reload. */
        const avatarFrame = document.getElementById('avatar-frame');
        const img   = document.createElement('img');
        const uName = (d.username || userId).toLowerCase();
        img.alt = d.username || '';

        img.onerror = function() {
            if (this.dataset.step === '1') {
                this.dataset.step = '2';
                this.src = `/awards/api/portraits/${encodeURIComponent(userId)}.png`;
            } else if (this.dataset.step === '2') {
                this.dataset.step = '3';
                this.src = `/awards/api/avatar/${encodeURIComponent(userId)}`;
            } else {
                this.remove();
            }
        };
        img.dataset.step = '1';
        img.src = `/awards/api/portraits/${encodeURIComponent(uName)}.png`;
        avatarFrame.appendChild(img);

        /* XP bar */
        const xpPct = d.xp_to_next > 0 ? Math.min(100, (d.current_xp / d.xp_to_next) * 100) : 100;
        document.getElementById('xp-bar').style.width  = xpPct.toFixed(1) + '%';
        document.getElementById('xp-text').textContent = fmt(d.current_xp) + ' / ' + fmt(d.xp_to_next) + ' EXP';

        const miniBar = document.getElementById('xp-mini-fill');
        if (miniBar) miniBar.style.width = xpPct.toFixed(1) + '%';

        /* Primary stats */
        const ts = d.total_stats || {};
        console.log('[Stats] Loading:', { cp: d.combat_power, ts });
        
        const setStat = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
            else console.warn(`[Stats] Element #${id} not found`);
        };

        setStat('stat-cp',  fmt(d.combat_power));
        setStat('stat-str', fmt(ts.str || 0));
        setStat('stat-mag', fmt(ts.mag || 0));
        setStat('stat-def', fmt(ts.def || 0));
        setStat('stat-hp',  fmt(ts.hp  || 0));

        /* Secondary stats */
        const hoursEl = document.getElementById('stat-hours');
        const booksEl = document.getElementById('stat-books');
        const xpEl    = document.getElementById('stat-xp');
        if (hoursEl) hoursEl.textContent = (d.listening_hours || 0).toFixed(1) + ' hrs';
        if (booksEl) booksEl.textContent = d.books_finished || 0;
        if (xpEl)    xpEl.textContent    = fmt(d.total_xp);

        /* Active quest / inventory widget */
        const widgetLabel = root.querySelector('.quest-label');
        const widgetTitle = document.getElementById('inventory-line');
        const widgetCover = root.querySelector('.quest-cover');
        const active      = d.active_quest;
        const inv         = d.inventory_count || 0;

        if (widgetLabel && widgetTitle && widgetCover) {
            if (active) {
                widgetLabel.textContent = 'Active Quest: ' + (active.quest_name || 'Reading');
                widgetTitle.textContent = active.title;
                if (miniBar) miniBar.style.width = active.progress + '%';
                if (active.cover_url) {
                    widgetCover.innerHTML = `<img src="${active.cover_url}" style="width:100%;height:100%;object-fit:cover;">`;
                } else {
                    widgetCover.textContent = '📖';
                }
            } else {
                widgetLabel.textContent = 'System Inventory';
                widgetTitle.textContent = inv + ' item' + (inv !== 1 ? 's' : '') + ' looted';
                widgetCover.textContent = '⚔';
            }
        }

        /* Equipment slots */
        const eq = d.equipped || {};
        equippedItems = eq;
        fillSlot('Head',    eq.Head);
        fillSlot('Chest',   eq.Chest);
        fillSlot('Neck',    eq.Neck);
        fillSlot('Weapon',  eq.Weapon);
        fillSlot('Ring',    eq.Ring);
        fillSlot('Trinket', eq.Trinket);

        /* Mini character sheet (inventory panel) */
        populateMiniSheet(d);

        /* Reveal */
        overlay.style.display = 'none';
        root.style.display    = '';

    } catch (err) {
        overlay.innerHTML = `
            <div style="color:#ff5555">SYSTEM ERROR</div>
            <div style="margin-top:10px;font-size:0.85rem;color:#84ffff;max-width:400px;text-align:center">${err.message}</div>
        `;
    }
}

/* ===================================================
   Mouse Tooltip
=================================================== */
const mTooltip = document.getElementById('mouse-tooltip');

function showMouseTooltip(item, e) {
    let compareHTML = '';
    if (item.slot === 'Accessory') {
        compareHTML = `
            <div class="tt-compare-col">
                <div class="tt-compare-header">▼ Equipped Accessories</div>
                <div class="tt-compare-cards">
                    ${buildTooltipHTML(equippedItems['Neck'],    'Neck — Empty')}
                    ${buildTooltipHTML(equippedItems['Ring'],    'Ring — Empty')}
                    ${buildTooltipHTML(equippedItems['Trinket'], 'Trinket — Empty')}
                </div>
            </div>`;
    } else if (item.slot) {
        compareHTML = `
            <div class="tt-compare-col">
                <div class="tt-compare-header">▼ Equipped: ${item.slot}</div>
                <div class="tt-compare-cards">
                    ${buildTooltipHTML(equippedItems[item.slot], 'Nothing equipped')}
                </div>
            </div>`;
    }
    mTooltip.innerHTML = buildTooltipHTML(item) + compareHTML;
    mTooltip.style.display = 'flex';
    mTooltip.style.opacity = '1';
    moveMouseTooltip(e);
}

function moveMouseTooltip(e) {
    const x = e.clientX + 16;
    const y = e.clientY + 16;
    const w = mTooltip.offsetWidth;
    const h = mTooltip.offsetHeight;
    const left = (x + w > window.innerWidth)  ? Math.max(4, x - w - 20) : x;
    const top  = (y + h > window.innerHeight) ? Math.max(4, y - h - 20) : y;
    mTooltip.style.left = left + 'px';
    mTooltip.style.top  = top  + 'px';
}

function hideMouseTooltip() {
    mTooltip.style.display = 'none';
    mTooltip.style.opacity = '0';
}

/* ===================================================
   WoW Inventory
=================================================== */
let allInventoryItems = [];
let currentInvTab     = 'All';
let userPin           = '';
let currentUserId     = '';
let equippedItems     = {};
let originalStats     = null;
let draggedItem       = null;
let lastCharacterSheet = null;
let currentSpentAllocation = { str: 0, mag: 0, def: 0, hp: 0 };
let workingSpentAllocation = { str: 0, mag: 0, def: 0, hp: 0 };
let currentUnspentPoints = 0;

async function openInventory() {
    const params = new URLSearchParams(window.location.search);
    currentUserId = params.get('userId') || params.get('user_id');
    if (!currentUserId) return;

    const modal    = document.getElementById('inventory-modal');
    const pinField = document.getElementById('pin-field');

    modal.style.display = 'flex';

    if (!pinField.dataset.hasListener) {
        pinField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('pin-submit-btn').click();
        });
        pinField.dataset.hasListener = '1';
    }

    try {
        const res  = await fetch(`/awards/api/inventory/${encodeURIComponent(currentUserId)}`);
        const data = await res.json();

        if (!data.pin_set && !userPin) {
            showPinOverlay('CREATE NEW SYSTEM PIN (4 DIGITS)', 'CREATE PIN', () => setPin());
        } else if (!userPin) {
            showPinOverlay('ENTER SYSTEM PIN', 'ACCESS', () => accessInventory());
        } else {
            renderWoWInventory(data.items);
        }

        pinField.focus();
    } catch (e) {
        console.error('Inventory error:', e);
    }
}

function showPinOverlay(instruction, btnLabel, btnAction) {
    const pinOverlay = document.getElementById('pin-overlay');
    const pinBtn     = document.getElementById('pin-submit-btn');
    document.getElementById('pin-instruction').textContent = instruction;
    pinBtn.textContent = btnLabel;
    pinBtn.onclick     = btnAction;
    pinOverlay.style.display = 'flex';
}

async function accessInventory() {
    userPin = document.getElementById('pin-field').value;
    document.getElementById('pin-overlay').style.display = 'none';
    try {
        const res  = await fetch(`/awards/api/inventory/${encodeURIComponent(currentUserId)}`);
        const data = await res.json();
        renderWoWInventory(data.items);
    } catch (e) { console.error('Access error:', e); }
}

function closeInventory() {
    document.getElementById('inventory-modal').style.display = 'none';
    document.getElementById('pin-overlay').style.display     = 'none';
    document.getElementById('pin-field').value               = '';
}

async function setPin() {
    const pin = document.getElementById('pin-field').value;
    if (pin.length < 4) { alert('PIN must be 4 digits.'); return; }
    try {
        const res = await fetch('/awards/api/gear/set-pin', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUserId, pin })
        });
        if (res.ok) {
            userPin = pin;
            document.getElementById('pin-overlay').style.display = 'none';
            openInventory();
        } else {
            const err = await res.json();
            alert(err.detail || 'Failed to set PIN.');
        }
    } catch (e) { alert('Network error.'); }
}

function renderWoWInventory(items) {
    allInventoryItems = items;
    currentInvTab = 'All';
    document.querySelectorAll('.inv-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'All');
    });
    applyInventoryFilter();
}

function applyInventoryFilter() {
    const search     = (document.getElementById('inv-search').value || '').toLowerCase();
    const ACC_TABS   = ['Neck', 'Ring', 'Trinket'];
    const statChecks = ['str', 'mag', 'def', 'hp'].filter(s => {
        const el = document.getElementById('filter-' + s);
        return el && el.checked;
    });

    let filtered = allInventoryItems.filter(item => {
        const slot = item.slot || '';
        const matchTab = currentInvTab === 'All'
            || slot === currentInvTab
            || (ACC_TABS.includes(currentInvTab) && slot === 'Accessory');
        const matchSearch = !search || (item.item_name || '').toLowerCase().includes(search);
        const matchStat   = statChecks.length === 0 || statChecks.some(s => (item[s] || 0) > 0);
        return matchTab && matchSearch && matchStat;
    });

    if (statChecks.length > 0) {
        filtered.sort((a, b) => {
            const sumA = statChecks.reduce((n, s) => n + (a[s] || 0), 0);
            const sumB = statChecks.reduce((n, s) => n + (b[s] || 0), 0);
            return sumB - sumA;
        });
    }

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    const INV_COLS = 10;
    const rows     = Math.max(4, Math.ceil(filtered.length / INV_COLS) + 1);
    const total    = rows * INV_COLS;

    for (let i = 0; i < total; i++) {
        const item = filtered[i];
        const card = document.createElement('div');

        if (item) {
            card.className = `inv-card rarity-${item.rarity || 'Common'}`;
            const cb      = Date.now();
            const iconSrc = item.icon ? (item.icon.startsWith('http') ? item.icon : `/icons/${item.icon}`) : '';
            if (iconSrc) {
                const img = document.createElement('img');
                img.src   = iconSrc + (iconSrc.includes('?') ? '&' : '?') + 't=' + cb;
                img.alt   = item.item_name;
                card.appendChild(img);
            }
            card.draggable    = true;
            card.ondragstart  = (e) => {
                draggedItem = item;
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
                // Highlight valid destination, dim everything else
                document.querySelectorAll('.mini-slot').forEach(s => {
                    if (s.dataset.accepts === item.slot) {
                        s.classList.add('drag-target');
                    } else {
                        s.classList.add('drag-locked');
                    }
                });
            };
            card.ondragend    = () => {
                draggedItem = null;
                card.classList.remove('dragging');
                document.querySelectorAll('.mini-slot').forEach(s =>
                    s.classList.remove('drag-valid', 'drag-invalid', 'drag-locked', 'drag-target')
                );
                restoreStats();
            };
            card.onclick      = ()  => equipItem(item.item_id, item.slot);
            card.onmouseenter = (e) => showMouseTooltip(item, e);
            card.onmousemove  = (e) => moveMouseTooltip(e);
            card.onmouseleave = ()  => hideMouseTooltip();
        } else {
            card.className = 'inv-card empty';
        }

        grid.appendChild(card);
    }

    const label = currentInvTab === 'All'
        ? `ALL ITEMS (${filtered.length})`
        : `${currentInvTab.toUpperCase()} (${filtered.length})`;
    document.getElementById('wow-inv-tab-title').textContent = label;
}

function filterInventory() { applyInventoryFilter(); }

function setInvTab(tab) {
    currentInvTab = tab;
    document.querySelectorAll('.inv-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    applyInventoryFilter();
}

let _pendingEquipItemId = null;

function equipItem(itemId, slot) {
    if (slot === 'Accessory') {
        _pendingEquipItemId = itemId;
        document.getElementById('slot-picker').style.display = 'flex';
        return;
    }
    _doEquip(itemId, slot);
}

function pickSlot(slot) {
    document.getElementById('slot-picker').style.display = 'none';
    if (_pendingEquipItemId) {
        _doEquip(_pendingEquipItemId, slot);
        _pendingEquipItemId = null;
    }
}

function cancelSlotPick() {
    document.getElementById('slot-picker').style.display = 'none';
    _pendingEquipItemId = null;
}

async function _doEquip(itemId, targetSlot) {
    console.log(`[Equip] item=${itemId} slot=${targetSlot} user=${currentUserId} pin_set=${!!userPin}`);
    try {
        const res = await fetch('/awards/api/gear/equip', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ user_id: currentUserId, item_id: itemId, slot: targetSlot, pin: userPin })
        });
        if (res.ok) {
            document.getElementById('slot-picker').style.display = 'none';
            _pendingEquipItemId = null;
            await refreshCharacterInline();
        } else {
            let errMsg = `HTTP ${res.status}`;
            try {
                const err = await res.json();
                errMsg = err.detail || errMsg;
            } catch (_) {
                // Server returned non-JSON (500 HTML) — log raw text for debugging
                const raw = await res.text().catch(() => '');
                console.error(`[Equip] Server returned non-JSON ${res.status}:`, raw.substring(0, 500));
                errMsg = `Server error ${res.status} — check container logs`;
            }
            console.error(`[Equip] Failed: ${errMsg}`);
            if (res.status === 401) { userPin = ''; openInventory(); }
            else { alert(errMsg); }
        }
    } catch (e) {
        console.error('[Equip] fetch threw:', e);
        alert('Network error: ' + e.message);
    }
}

/* ===================================================
   Mini Character Sheet (inside inventory panel)
=================================================== */

function populateMiniSheet(d) {
    const ts = d.total_stats || {};
    originalStats = {
        str: ts.str || 0, mag: ts.mag || 0,
        def: ts.def || 0, hp:  ts.hp  || 0,
        cp:  d.combat_power || 0
    };

    const nameEl  = document.getElementById('mini-cs-name');
    const levelEl = document.getElementById('mini-cs-level');
    if (nameEl)  nameEl.textContent  = (d.username || '').toUpperCase();
    if (levelEl) levelEl.textContent = 'LVL ' + d.level;

    const eq = d.equipped || {};
    ['Head', 'Chest', 'Neck', 'Weapon', 'Ring', 'Trinket'].forEach(slot => fillMiniSlot(slot, eq[slot]));
    updateMiniStats(originalStats, null);
    setPointAllocatorState(d);
}

function _sumAlloc(a) {
    return (a.str || 0) + (a.mag || 0) + (a.def || 0) + (a.hp || 0);
}

function _snapToFive(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n / 5) * 5;
}

function setAllocatorStatus(msg, kind = '') {
    const el = document.getElementById('mini-alloc-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('ok', 'error');
    if (kind) el.classList.add(kind);
}

function setPointAllocatorState(sheet) {
    const spent = (sheet && sheet.spent_stats) || { str: 0, mag: 0, def: 0, hp: 0 };
    currentSpentAllocation = {
        str: Number(spent.str || 0),
        mag: Number(spent.mag || 0),
        def: Number(spent.def || 0),
        hp: Number(spent.hp || 0),
    };
    workingSpentAllocation = { ...currentSpentAllocation };
    currentUnspentPoints = Number((sheet && sheet.unspent_points) || 0);
    updatePointAllocatorUI();
    setAllocatorStatus('Allocate in 5-point increments.');
}

function getProjectedUnspent() {
    const delta = _sumAlloc(workingSpentAllocation) - _sumAlloc(currentSpentAllocation);
    return currentUnspentPoints - delta;
}

function getAllocationAdjustedStats() {
    if (!originalStats) return null;
    const deltaStr = (workingSpentAllocation.str || 0) - (currentSpentAllocation.str || 0);
    const deltaMag = (workingSpentAllocation.mag || 0) - (currentSpentAllocation.mag || 0);
    const deltaDef = (workingSpentAllocation.def || 0) - (currentSpentAllocation.def || 0);
    const deltaHp  = (workingSpentAllocation.hp  || 0) - (currentSpentAllocation.hp  || 0);

    const s = {
        ...originalStats,
        str: (originalStats.str || 0) + deltaStr,
        mag: (originalStats.mag || 0) + deltaMag,
        def: (originalStats.def || 0) + deltaDef,
        hp:  (originalStats.hp  || 0) + deltaHp,
    };
    s.cp = Math.floor(s.str * 2 + s.mag * 2 + s.def * 1.5 + s.hp * 0.5);
    return s;
}

function updatePointAllocatorUI() {
    const unspentEl = document.getElementById('mini-unspent-points');
    if (unspentEl) {
        const projected = getProjectedUnspent();
        unspentEl.textContent = `Unspent: ${fmt(projected)}`;
        unspentEl.classList.toggle("has-points", projected > 0);
    }

    ['str', 'mag', 'def', 'hp'].forEach((stat) => {
        const valEl = document.getElementById(`mini-alloc-${stat}`);
        if (valEl) valEl.value = String(workingSpentAllocation[stat] || 0);
    });

    const canSpend5 = getProjectedUnspent() >= 5;
    ['str', 'mag', 'def', 'hp'].forEach((stat) => {
        const minusBtn = document.getElementById(`alloc-dec-${stat}`);
        const plusBtn = document.getElementById(`alloc-inc-${stat}`);
        if (minusBtn) minusBtn.disabled = (workingSpentAllocation[stat] || 0) < 5;
        if (plusBtn) plusBtn.disabled = !canSpend5;
    });

    const saveBtn = document.getElementById('mini-alloc-save');
    if (saveBtn) {
        const changed = ['str', 'mag', 'def', 'hp'].some((s) => (workingSpentAllocation[s] || 0) !== (currentSpentAllocation[s] || 0));
        saveBtn.disabled = !changed;
    }

    const allocPreview = getAllocationAdjustedStats();
    if (allocPreview) updateMiniStats(allocPreview, originalStats);
}

function setPointAllocationFromInput(stat, rawValue) {
    if (!['str', 'mag', 'def', 'hp'].includes(stat)) return;

    const previous = Number(workingSpentAllocation[stat] || 0);
    const text = String(rawValue ?? '').trim();
    const parsed = text === '' ? previous : Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
        updatePointAllocatorUI();
        setAllocatorStatus('Enter a non-negative number.', 'error');
        return;
    }

    const snapped = _snapToFive(parsed);
    workingSpentAllocation[stat] = snapped;

    if (getProjectedUnspent() < 0) {
        workingSpentAllocation[stat] = previous;
        updatePointAllocatorUI();
        setAllocatorStatus('Not enough unspent points for that amount.', 'error');
        return;
    }

    updatePointAllocatorUI();
    if (snapped !== parsed) {
        setAllocatorStatus('Rounded down to nearest 5-point value.');
    } else {
        setAllocatorStatus('Unsaved allocation changes.');
    }
}

function adjustPointAllocation(stat, delta) {
    if (!['str', 'mag', 'def', 'hp'].includes(stat)) return;
    const step = Number(delta || 0);
    if (step === 0 || Math.abs(step) !== 5) return;

    const next = Number(workingSpentAllocation[stat] || 0) + step;
    if (next < 0) return;
    if (step > 0 && getProjectedUnspent() < 5) return;

    workingSpentAllocation[stat] = next;
    updatePointAllocatorUI();
    setAllocatorStatus('Unsaved allocation changes.');
}

function resetPointAllocation() {
    workingSpentAllocation = { ...currentSpentAllocation };
    updatePointAllocatorUI();
    setAllocatorStatus('Allocation reset.');
}

async function savePointAllocation() {
    if (!currentUserId) {
        setAllocatorStatus('Missing user context.', 'error');
        return;
    }
    if (!userPin) {
        setAllocatorStatus('Enter PIN to save allocation.', 'error');
        return;
    }

    // Final validation: enforce 5-point increments.
    for (const stat of ['str', 'mag', 'def', 'hp']) {
        const val = Number(workingSpentAllocation[stat] || 0);
        if (val < 0 || (val % 5) !== 0) {
            setAllocatorStatus('All allocations must be 0 or multiples of 5.', 'error');
            return;
        }
    }

    const saveBtn = document.getElementById('mini-alloc-save');
    if (saveBtn) saveBtn.disabled = true;
    setAllocatorStatus('Saving allocation...');

    try {
        const res = await fetch('/awards/api/gear/allocate-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUserId,
                pin: userPin,
                stats: {
                    str: Number(workingSpentAllocation.str || 0),
                    mag: Number(workingSpentAllocation.mag || 0),
                    def: Number(workingSpentAllocation.def || 0),
                    hp: Number(workingSpentAllocation.hp || 0),
                }
            })
        });

        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
                const err = await res.json();
                msg = err.detail || msg;
            } catch (_) {}
            if (res.status === 401) {
                userPin = '';
                setAllocatorStatus('PIN expired. Re-enter PIN.', 'error');
                openInventory();
                return;
            }
            setAllocatorStatus(msg, 'error');
            return;
        }

        const out = await res.json();
        if (out && out.spent) {
            currentSpentAllocation = {
                str: Number(out.spent.str || 0),
                mag: Number(out.spent.mag || 0),
                def: Number(out.spent.def || 0),
                hp: Number(out.spent.hp || 0),
            };
            workingSpentAllocation = { ...currentSpentAllocation };
            currentUnspentPoints = Number(out.unspent_points || 0);
        }

        updatePointAllocatorUI();
        setAllocatorStatus('Allocation saved.', 'ok');
        await refreshCharacterInline();
    } catch (e) {
        setAllocatorStatus(`Network error: ${e.message}`, 'error');
    } finally {
        updatePointAllocatorUI();
    }
}
function fillMiniSlot(slotKey, item) {
    const el = document.getElementById('mini-slot-' + slotKey);
    if (!el) return;

    el.querySelectorAll('img').forEach(img => img.remove());
    el.style.borderColor = ''; el.style.borderStyle = 'dashed'; el.style.boxShadow = '';

    if (item) {
        const col = RARITY_COLORS[item.rarity] || '#555';
        el.style.borderColor = col; el.style.borderStyle = 'solid';
        el.style.boxShadow   = `0 0 8px ${col}44`;
        if (item.icon) {
            const iconSrc = item.icon.startsWith('http') ? item.icon : `/icons/${item.icon}`;
            const img = document.createElement('img');
            img.src = iconSrc;
            img.alt = item.item_name;
            img.onerror = () => img.remove();
            el.appendChild(img);
        }
    }
}

function updateMiniStats(stats, prevStats) {
    ['str', 'mag', 'def', 'hp', 'cp'].forEach(stat => {
        const el = document.getElementById('mini-stat-' + stat);
        if (!el) return;
        el.textContent = fmt(stats[stat] || 0);
        el.className = '';
        if (prevStats !== null) {
            const delta = (stats[stat] || 0) - (prevStats[stat] || 0);
            if (delta > 0) el.className = 'stat-up';
            else if (delta < 0) el.className = 'stat-down';
        }
    });
}

function previewStats(targetSlot, newItem) {
    if (!originalStats) return;
    const prev = equippedItems[targetSlot];
    const p = { ...originalStats };
    if (prev) { p.str -= prev.str||0; p.mag -= prev.mag||0; p.def -= prev.def||0; p.hp -= prev.hp||0; }
    p.str += newItem.str||0; p.mag += newItem.mag||0; p.def += newItem.def||0; p.hp += newItem.hp||0;
    p.cp = Math.floor(p.str*2 + p.mag*2 + p.def*1.5 + p.hp*0.5);
    updateMiniStats(p, originalStats);
}

function restoreStats() {
    if (originalStats) updateMiniStats(originalStats, null);
}

/* ===================================================
   Drag & Drop handlers (inventory → mini sheet)
=================================================== */

function miniDragOver(e, el) {
    e.preventDefault();
    if (!draggedItem) return;
    const valid = draggedItem.slot === el.dataset.accepts;
    if (valid) {
        el.classList.add('drag-valid');
        previewStats(el.id.replace('mini-slot-', ''), draggedItem);
    }
    e.dataTransfer.dropEffect = valid ? 'move' : 'none';
}

function miniDragLeave(e, el) {
    if (el.contains(e.relatedTarget)) return;
    el.classList.remove('drag-valid');  // keep drag-target; only remove the hover highlight
    restoreStats();
}

function miniDrop(e, slotKey) {
    e.preventDefault();
    const el = document.getElementById('mini-slot-' + slotKey);
    el.classList.remove('drag-valid', 'drag-invalid');
    restoreStats();
    if (!draggedItem) return;
    if (draggedItem.slot !== el.dataset.accepts) return;
    const item = draggedItem;
    draggedItem = null;
    _doEquip(item.item_id, slotKey);
}

/* ===================================================
   Refresh character in place (after equip, no reload)
=================================================== */

async function refreshCharacterInline() {
    if (!currentUserId) return;
    const isAdmin = true; // Forced admin mode for live deployment
    const url = `/awards/api/character/${encodeURIComponent(currentUserId)}` + (isAdmin ? '?admin=true' : '');
    try {
        const res = await fetch(url);
        if (!res.ok) return;
        const d = await res.json();
        lastCharacterSheet = d;

        equippedItems = d.equipped || {};

        ['Head','Chest','Neck','Weapon','Ring','Trinket'].forEach(s => fillSlot(s, equippedItems[s]));

        const ts = d.total_stats || {};
        document.getElementById('stat-cp').textContent  = fmt(d.combat_power);
        document.getElementById('stat-str').textContent = fmt(ts.str || 0);
        document.getElementById('stat-mag').textContent = fmt(ts.mag || 0);
        document.getElementById('stat-def').textContent = fmt(ts.def || 0);
        document.getElementById('stat-hp').textContent  = fmt(ts.hp  || 0);

        const xpPct = d.xp_to_next > 0 ? Math.min(100, (d.current_xp / d.xp_to_next) * 100) : 100;
        document.getElementById('xp-bar').style.width  = xpPct.toFixed(1) + '%';
        document.getElementById('xp-text').textContent = fmt(d.current_xp) + ' / ' + fmt(d.xp_to_next) + ' EXP';

        populateMiniSheet(d);

    } catch (e) { console.error('refreshCharacterInline failed:', e); }
}

/* ===================================================
   Loadout Optimizer
   Scores based on damage_calc.md formulas:
     CP  = STR*2 + MAG*2 + DEF*1.5 + HP*0.5
     STR = physical bonus (STR*450 per slot + STR*100 per book)
     MAG = magic damage (MAG*400 summon + MAG*200 poison)
     DEF = reduces boss retaliation (Total_DEF * 3)
     HP  = survivability against liquidation
=================================================== */
const OPTIMIZE_SCORE = {
    cp:  item => (item.str||0)*2   + (item.mag||0)*2 + (item.def||0)*1.5 + (item.hp||0)*0.5,
    str: item => (item.str||0),
    mag: item => (item.mag||0),
    def: item => (item.def||0),
    hp:  item => (item.hp ||0),
};

async function optimizeLoadout(preset) {
    if (!currentUserId || !userPin) {
        alert('Enter your PIN first to enable auto-equip.');
        return;
    }

    const scoreFn = OPTIMIZE_SCORE[preset];
    const SLOTS   = ['Head', 'Chest', 'Weapon', 'Neck', 'Ring', 'Trinket'];

    // Find the highest-scoring item for each slot
    const best = {};
    SLOTS.forEach(slot => {
        const candidates = allInventoryItems.filter(it => it.slot === slot && scoreFn(it) > 0);
        if (candidates.length) {
            best[slot] = candidates.reduce((a, b) => scoreFn(a) >= scoreFn(b) ? a : b);
        }
    });

    const entries = Object.entries(best);
    if (!entries.length) { alert('No items found to optimize.'); return; }

    // Dim the buttons while working
    document.querySelectorAll('.opt-btn').forEach(b => b.classList.add('optimizing'));

    let failed = 0;
    for (const [slot, item] of entries) {
        try {
            const res = await fetch('/awards/api/gear/equip', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id: currentUserId, item_id: item.item_id, slot, pin: userPin })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error(`[Optimize] ${slot} failed:`, err.detail);
                if (res.status === 401) {
                    userPin = '';
                    document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('optimizing'));
                    openInventory();
                    return;
                }
                failed++;
            }
        } catch (e) {
            console.error(`[Optimize] ${slot} network error:`, e);
            failed++;
        }
    }

    // Single refresh after all equips
    await refreshCharacterInline();
    document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('optimizing'));
    if (failed) alert(`${failed} slot(s) failed — check console for details.`);
}

/* ===================================================
   Boot
=================================================== */
loadCharacter();

/* (effects section removed) */
void 0;




