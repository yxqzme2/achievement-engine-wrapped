/* ===================================================
   Roster Page — Scripts
   The Sanctum Roster
=================================================== */

const RARITY_COLORS = {
    Common:    '#888888',
    Uncommon:  '#3bd26f',
    Rare:      '#4a9eff',
    Epic:      '#a335ee',
    Legendary: '#ff8c00'
};

function fmt(n) {
    return Number(n || 0).toLocaleString();
}

function buildCard(u, isLimbo) {
    const card = document.createElement('a');
    card.href = `/awards/character?userId=${encodeURIComponent(u.user_id)}`;
    card.className = 'roster-card' + (u.rank === 1 ? ' rank-1' : '');
    if (isLimbo) card.classList.add('limbo-card');

    // Rank badge
    const badge = document.createElement('div');
    badge.className = 'rank-badge';
    badge.textContent = `#${u.rank}`;
    card.appendChild(badge);

    // Avatar: username.gif → username.png → user_id.gif → user_id.png → ABS avatar → initials
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrap';
    const img = document.createElement('img');
    const uName = (u.username || u.user_id).toLowerCase();
    img.alt = u.username || u.user_id;

    img.onerror = function() {
        const cb = Date.now();
        if (this.dataset.step === '1') {
            this.dataset.step = '1.5';
            this.src = `/awards/api/portraits/${encodeURIComponent(uName)}.png?t=${cb}`;
        } else if (this.dataset.step === '1.5') {
            this.dataset.step = '2';
            this.src = `/awards/api/portraits/${encodeURIComponent(u.user_id)}.gif?t=${cb}`;
        } else if (this.dataset.step === '2') {
            this.dataset.step = '2.5';
            this.src = `/awards/api/portraits/${encodeURIComponent(u.user_id)}.png?t=${cb}`;
        } else if (this.dataset.step === '2.5') {
            this.dataset.step = '3';
            this.src = `/awards/api/avatar/${encodeURIComponent(u.user_id)}`;
        } else {
            const initial = (u.username || u.user_id || '?')[0].toUpperCase();
            avatarWrap.innerHTML = `<div class="avatar-fallback">${initial}</div>`;
        }
    };

    const cacheBuster = Date.now();
    img.dataset.step = '1';
    img.src = `/awards/api/portraits/${encodeURIComponent(uName)}.gif?t=${cacheBuster}`;
    avatarWrap.appendChild(img);
    card.appendChild(avatarWrap);

    // Username
    const uname = document.createElement('div');
    uname.className = 'card-username';
    uname.textContent = u.username || u.user_id;
    card.appendChild(uname);

    // Class title
    const cls = document.createElement('div');
    cls.className = 'card-class';
    cls.textContent = u.class_title || 'Novice Listener';
    card.appendChild(cls);

    // Level + CP
    const statsRow = document.createElement('div');
    statsRow.className = 'card-stats';
    statsRow.innerHTML = `<span class="lvl-pill">LVL ${u.level || 0}</span><span class="cp-value">&#9876; ${fmt(u.combat_power)}</span>`;
    card.appendChild(statsRow);

    // Top item
    const itemDiv = document.createElement('div');
    itemDiv.className = 'top-item';
    if (u.top_item) {
        const col  = RARITY_COLORS[u.top_item.rarity] || '#888';
        const name = u.top_item.item_name || u.top_item.item_id || 'Unknown';
        itemDiv.innerHTML = `<span style="color:${col}">${u.top_item.rarity}: ${name}</span>`;
    } else {
        itemDiv.innerHTML = `<span class="item-none">No gear equipped</span>`;
    }
    card.appendChild(itemDiv);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `<span>${u.inventory_count || 0} items</span><span class="view-hint">&rarr; View Sheet</span>`;
    card.appendChild(footer);

    return card;
}


async function loadRoster() {
    try {
        const res = await fetch('/awards/api/gear/roster');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data    = await res.json();
        const roster  = data.roster   || [];
        const boss    = data.boss     || {};
        const isLimbo = data.is_limbo || false;

        // Subtitle
        const avgCP = roster.length
            ? Math.round(roster.reduce((s, u) => s + (u.combat_power || 0), 0) / roster.length)
            : 0;
        document.getElementById('roster-subtitle').textContent =
            `${roster.length} adventurer${roster.length !== 1 ? 's' : ''}  \u2022  Server avg CP: ${fmt(avgCP)}  \u2022  Boss HP: ${fmt(boss.boss_hp || 0)}`;

        // Boss banner
        if (boss.boss_hp) {
            const banner = document.getElementById('boss-banner');
            banner.style.display = '';
            banner.innerHTML = `<strong>&#9876; Server Boss</strong> &mdash; HP: <strong>${fmt(boss.boss_hp)}</strong> &nbsp; ATK: <strong>${fmt(boss.boss_atk)}</strong> &nbsp; Players: <strong>${boss.player_count || roster.length}</strong>`;
        }

        const container = document.getElementById('roster-container');

        if (roster.length === 0) {
            container.innerHTML = '<div class="loading" style="animation:none">No adventurers found. The gear engine needs at least one poll to initialize.</div>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'roster-grid';
        roster.forEach(u => grid.appendChild(buildCard(u, isLimbo)));
        container.innerHTML = '';
        container.appendChild(grid);


    } catch (err) {
        document.getElementById('roster-container').innerHTML =
            `<div class="loading" style="animation:none">Failed to load roster: ${err.message}</div>`;
        document.getElementById('roster-subtitle').textContent = 'Error loading data';
    }
}

loadRoster();

