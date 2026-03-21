let currentQuests = [];
let currentFilters = {
    rarity: 'all',
    type: 'all',
};

function getQuestType(q) {
    const tags = String(q?.tags || '').toLowerCase();
    const category = String(q?.category || '').toLowerCase();
    const directive = String(q?.directive_type || '').toLowerCase();

    if (
        tags.includes('series') ||
        ['campaign', 'series_complete', 'milestone_series', 'series_shape'].includes(category) ||
        directive.includes('world quest')
    ) {
        return 'series';
    }

    if (
        tags.includes('book') ||
        tags.includes('books') ||
        ['quest', 'milestone_books', 'milestone_yearly'].includes(category) ||
        directive.includes('side quest')
    ) {
        return 'book';
    }

    return 'other';
}

function setQuestFilter(type, value) {
    currentFilters[type] = value;

    const containerId = type === 'rarity' ? 'rarity-filters' : 'type-filters';
    const pills = document.querySelectorAll(`#${containerId} .filter-pill`);
    pills.forEach((p) => {
        const val = p.getAttribute(`data-${type}`);
        if (val === value) p.classList.add('active');
        else p.classList.remove('active');
    });

    renderQuests();
}

function renderQuests() {
    const list = document.getElementById('quest-list');
    if (!list) return;

    const filtered = currentQuests.filter((q) => {
        const rarity = String(q?.rarity || 'common');
        const type = getQuestType(q);

        const rarityOk = currentFilters.rarity === 'all' || rarity === currentFilters.rarity;
        const typeOk = currentFilters.type === 'all' || type === currentFilters.type;

        return rarityOk && typeOk;
    });

    list.innerHTML = '';

    if (!filtered.length) {
        list.innerHTML = '<div style="color:var(--gold-accent); font-family:var(--font-title); padding: 20px;">NO QUESTS MATCH CURRENT FILTERS.</div>';
        return;
    }

    filtered.forEach((q) => {
        const post = document.createElement('div');
        post.className = 'quest-post';

        const rarity = String(q.rarity || 'common').toLowerCase();
        post.style.borderLeftColor = `var(--r-${rarity})`;

        const typeLabel = q.directive_type || 'Directive';
        const xpVal = q.display_xp || 0;
        const id = q.id || q.quest_id;

        post.onclick = () => showQuestCovers(id);
        post.onmouseenter = (e) => showQuestTooltip(q.trigger, e);
        post.onmousemove = (e) => moveQuestTooltip(e);
        post.onmouseleave = () => hideQuestTooltip();

        const rewardLabel = q.rarity === 'Legendary' ? 'Artifact Manifest' : 'System Bounty';

        post.innerHTML = `
            <span class="q-type">${typeLabel}</span>
            <span class="q-name">${q.achievement || q.quest_name}</span>
            <span class="q-target">${q.title}</span>
            <p class="q-desc">"${q.flavorText || q.description}"</p>
            <div class="q-rewards">
                <span class="q-xp" style="color: ${xpVal >= 5000 ? '#ff8000' : xpVal >= 2000 ? '#a335ee' : '#00e5ff'}">${xpVal.toLocaleString()} XP</span>
                <span class="q-loot">${rewardLabel}</span>
            </div>
        `;
        list.appendChild(post);
    });
}

async function loadQuests() {
    const list = document.getElementById('quest-list');
    if (!list) return;

    list.innerHTML = '<div style="color:var(--gold-accent); font-family:var(--font-title); padding: 20px;">SCANNING DATABASE...</div>';

    try {
        const res = await fetch('/awards/api/gear/quests');
        currentQuests = await res.json();

        // Server sends series quests first, then books, each group sorted by XP desc.
        // Preserve that ordering — do not re-sort by name here.

        renderQuests();
    } catch (err) {
        list.innerHTML = '<div style="color:#ff5555; padding: 20px;">ERROR: ACCESS DENIED</div>';
    }
}

function showQuestTooltip(trigger, e) {
    const tip = document.getElementById('quest-tooltip');
    if (!trigger || !tip) return;

    tip.innerHTML = `
        <span class="q-tooltip-title">Quest Requirement</span>
        <span class="q-tooltip-trigger">${trigger}</span>
    `;
    tip.style.opacity = '1';
    moveQuestTooltip(e);
}

function moveQuestTooltip(e) {
    const tip = document.getElementById('quest-tooltip');
    if (!tip) return;
    const x = e.clientX + 15;
    const y = e.clientY + 15;

    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const finalX = (x + width > window.innerWidth) ? e.clientX - width - 15 : x;
    const finalY = (y + height > window.innerHeight) ? e.clientY - height - 15 : y;

    tip.style.left = finalX + 'px';
    tip.style.top = finalY + 'px';
}

function hideQuestTooltip() {
    const tip = document.getElementById('quest-tooltip');
    if (tip) tip.style.opacity = '0';
}

function showQuestCovers(questId) {
    const q = currentQuests.find(x => String(x.id || x.quest_id) === String(questId));
    if (!q) return;

    const overlay = document.getElementById('cover-overlay');
    const carousel = document.getElementById('carousel');
    const title = document.getElementById('cover-title');
    if (!overlay || !carousel || !title) return;

    const books = Array.isArray(q.books) ? q.books.filter(b => b && b.title) : [];
    if (!books.length) return;

    carousel.innerHTML = '';
    title.textContent = q.title || q.target_name || 'Quest Books';

    const count = books.length;
    carousel.style.setProperty('--n', count);
    carousel.classList.toggle('single-card', count === 1);

    books.forEach((book, idx) => {
        const div = document.createElement('div');
        div.className = 'carousel-card';
        div.style.setProperty('--i', idx);
        div.title = book.title;

        const img = document.createElement('img');
        img.alt = book.title;
        img.src = `/awards/covers/${encodeURIComponent(book.cover || `${book.title}.jpg`)}`;

        div.appendChild(img);
        carousel.appendChild(div);
    });

    overlay.style.display = 'flex';
}

function closeCovers(e) {
    if (e) e.stopPropagation();
    const overlay = document.getElementById('cover-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCovers();
    }
});

window.setQuestFilter = setQuestFilter;
document.addEventListener('DOMContentLoaded', loadQuests);
