let allItems = [];
let currentFilters = {
    slot: 'all',
    rarity: 'all',
    search: ''
};

function cleanItemText(value) {
    const s = String(value ?? '').trim();
    return !s || s.toLowerCase() === 'none' ? '' : s;
}

async function loadLoot() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div class="loader">Opening the Vault...</div>';

    try {
        const response = await fetch('/awards/api/gear/catalog');
        const data = await response.json();
        allItems = data.sort((a, b) => (a.item_name || '').localeCompare(b.item_name || ''));
        renderItems();
    } catch (error) {
        grid.innerHTML = '<div class="loader" style="color:red">Failed to load artifacts.</div>';
        console.error('Error loading loot:', error);
    }
}

function setFilter(type, value) {
    currentFilters[type] = value;

    // Update UI pills
    const containerId = type === 'slot' ? 'slot-filters' : 'rarity-filters';
    const pills = document.querySelectorAll(`#${containerId} .filter-pill`);
    pills.forEach(p => {
        const val = p.getAttribute(`data-${type}`);
        if (val === value) p.classList.add('active');
        else p.classList.remove('active');
    });

    renderItems();
}

function filterItems() {
    currentFilters.search = document.getElementById('search').value.toLowerCase();
    renderItems();
}

function renderItems() {
    const grid = document.getElementById('grid');
    const filtered = allItems.filter(item => {
        const matchesSlot = currentFilters.slot === 'all' || item.slot === currentFilters.slot;
        const matchesRarity = currentFilters.rarity === 'all' || item.rarity === currentFilters.rarity;
        const matchesSearch = !currentFilters.search ||
            (item.item_name || '').toLowerCase().includes(currentFilters.search) ||
            (item.flavor_text || '').toLowerCase().includes(currentFilters.search);

        return matchesSlot && matchesRarity && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="no-results">No artifacts found matching your search criteria.</div>';
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const rarityClass = `rarity-${(item.rarity || 'common').toLowerCase()}`;
        const icon = item.icon ? (item.icon.startsWith('/') ? item.icon : '/icons/' + item.icon) : '/icons/chests.png';
        const slot = cleanItemText(item.slot) || 'Unknown Slot';
        const rarity = cleanItemText(item.rarity) || 'Unknown';
        const specialAbility = cleanItemText(item.special_ability);

        let statsHtml = '';
        if (item.str) statsHtml += `+${item.str} STR<br>`;
        if (item.mag) statsHtml += `+${item.mag} MAG<br>`;
        if (item.def) statsHtml += `+${item.def} DEF<br>`;
        if (item.hp) statsHtml += `+${item.hp} HP<br>`;

        return `
            <div class="loot-card-wrap">
                <div class="loot-card ${rarityClass}">
                    <img class="loot-icon" src="${icon}" onerror="this.src='/icons/chests.png'">
                    <div class="item-name">${item.item_name}</div>
                    <div class="item-type-line">
                        <span>${slot}</span>
                        <span>${rarity}</span>
                    </div>
                    <div class="item-stats">${statsHtml}</div>
                    ${specialAbility ? `<div class="item-effect">Equip: ${specialAbility}</div>` : ''}
                    ${item.flavor_text ? `<div class="item-flavor">"${item.flavor_text}"</div>` : ''}
                    <div class="item-source">Series: ${item.series_tag || 'Unknown'}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Global exposure
window.setFilter = setFilter;
window.filterItems = filterItems;

document.addEventListener('DOMContentLoaded', loadLoot);
