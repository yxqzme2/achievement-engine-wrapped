/* ===================================================
   Landing Page — Scripts
   The Listener's Sanctum
=================================================== */

async function loadUiConfig() {
    try {
        const resp = await fetch('/api/ui-config', { cache: 'no-store' });
        if (!resp.ok) return {};
        return await resp.json();
    } catch (_) {
        return {};
    }
}

function applyWrappedVisibility(enabled) {
    const showWrapped = !!enabled;
    const navLink = document.getElementById('wrapped-nav-link');
    const card = document.getElementById('wrapped-portal-card');

    if (navLink) navLink.style.display = showWrapped ? '' : 'none';
    if (card) card.style.display = showWrapped ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    const uiConfig = await loadUiConfig();
    applyWrappedVisibility(uiConfig.wrapped_enabled);
    console.log("The Listener's Sanctum Initialized.");
});
