const statusEl = document.getElementById('rec-status');
const listEl = document.getElementById('rec-list');
const selectEl = document.getElementById('user-select');
const tagPanel = document.getElementById('tag-panel');
const seriesDatalist = document.getElementById('series-datalist');
const tagSeriesInput = document.getElementById('tag-series-input');
const tagValueInput = document.getElementById('tag-value-input');
const tagSubmitBtn = document.getElementById('tag-submit-btn');
const tagFormStatus = document.getElementById('tag-form-status');
const tagChecklistEl = document.getElementById('tag-checklist');
const tagClearBtn = document.getElementById('tag-clear-btn');
const popoverEl = document.getElementById('cover-popover');
const popoverImg = document.getElementById('cover-popover-img');
const popoverTitle = document.getElementById('cover-popover-title');
const popoverDesc = document.getElementById('cover-popover-desc');
const tagPopoverEl = document.getElementById('tag-popover');
const tagPopoverTitle = document.getElementById('tag-popover-title');
const tagPopoverDesc = document.getElementById('tag-popover-desc');
const freshToggle = document.getElementById('fresh-toggle-input');

const checkedBoostTags = new Set();
let recsByKey = {};
let tagDefinitions = {};

function setStatus(msg, isError) {
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('error', !!isError);
}

function currentUserId() {
  return selectEl.value || '';
}

async function loadUsers() {
  try {
    const resp = await fetch('/awards/api/usernames');
    const data = await resp.json();
    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) {
      selectEl.innerHTML = '<option value="">No users found</option>';
      return;
    }
    selectEl.innerHTML = users
      .map(u => `<option value="${u.id}">${u.username}</option>`)
      .join('');
    tagPanel.style.display = 'block';
    loadRecommendations();
  } catch (e) {
    selectEl.innerHTML = '<option value="">Failed to load users</option>';
    setStatus('Could not load the user list.', true);
  }
}

async function loadSeriesDatalist() {
  try {
    const resp = await fetch('/awards/api/series-names');
    const data = await resp.json();
    const names = Array.isArray(data.series) ? data.series : [];
    seriesDatalist.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');
  } catch (e) {
    // Non-critical — the tag form still works with free typing, just no autocomplete.
  }
}

async function loadRecommendations() {
  const uid = currentUserId();
  if (!uid) return;
  listEl.innerHTML = '';
  setStatus('Loading recommendations…');
  const fresh = freshToggle.checked;
  if (fresh && !checkedBoostTags.size) {
    listEl.innerHTML = '';
    setStatus('Check at least one tag on the right to discover something new.');
    return;
  }

  try {
    const params = new URLSearchParams();
    if (checkedBoostTags.size) params.set('boost', Array.from(checkedBoostTags).join(','));
    if (fresh) params.set('fresh', '1');
    const qs = params.toString() ? `?${params.toString()}` : '';
    const resp = await fetch(`/awards/api/recommendations/${encodeURIComponent(uid)}${qs}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const recs = Array.isArray(data.recommendations) ? data.recommendations : [];

    if (data.reason === 'no_tier_list') {
      setStatus('This user has no saved Tier List yet — rate some series first, or check "Start from scratch" to browse by tag instead.');
      return;
    }
    if (!recs.length) {
      setStatus(fresh
        ? 'No series found with all the checked tags — try unchecking a few.'
        : 'No recommendations yet — not enough tag data overlaps with this Tier List.');
      return;
    }

    setStatus('');
    recsByKey = {};
    recs.forEach(r => { recsByKey[r.series_key] = r; });

    listEl.innerHTML = recs.map((r, i) => {
      const boosted = new Set(r.boosted_tags || []);
      return `
      <div class="rec-card">
        <div class="rec-rank">#${i + 1}</div>
        <img class="rec-cover" src="${r.cover_url}" alt="" loading="lazy"
             data-series-key="${r.series_key}"
             onerror="this.style.visibility='hidden'">
        <div class="rec-body">
          <div class="rec-series-name">${r.series_name}</div>
          <div class="rec-tags">
            ${r.matching_tags.map(t => `<span class="rec-tag-chip${boosted.has(t) ? ' boosted' : ''}">${t}</span>`).join('')}
          </div>
        </div>
        <div class="rec-score">match score ${r.score}</div>
      </div>
    `;
    }).join('');
  } catch (e) {
    setStatus('Could not load recommendations: ' + e.message, true);
  }
}

async function loadTagChecklist() {
  try {
    const resp = await fetch('/awards/api/tags/all');
    const data = await resp.json();
    const tags = Array.isArray(data.tags) ? data.tags : [];
    if (!tags.length) {
      tagChecklistEl.innerHTML = '<div class="tag-sidebar-hint">No tags yet — run the admin tag backfill first.</div>';
      return;
    }
    tagDefinitions = {};
    tags.forEach(t => { tagDefinitions[t.tag] = t.description; });

    tagChecklistEl.innerHTML = tags.map(t => `
      <label data-tag="${t.tag}">
        <input type="checkbox" value="${t.tag}">
        <span>${t.tag}</span>
      </label>
    `).join('');

    tagChecklistEl.addEventListener('change', (e) => {
      if (e.target.tagName !== 'INPUT') return;
      if (e.target.checked) checkedBoostTags.add(e.target.value);
      else checkedBoostTags.delete(e.target.value);
      loadRecommendations();
    });

    tagChecklistEl.addEventListener('mouseover', (e) => {
      const label = e.target.closest('label[data-tag]');
      if (label) showTagPopover(label);
    });
    tagChecklistEl.addEventListener('mouseout', (e) => {
      const label = e.target.closest('label[data-tag]');
      if (label) hideTagPopover();
    });
  } catch (e) {
    tagChecklistEl.innerHTML = '<div class="tag-sidebar-hint">Could not load tags.</div>';
  }
}

function showTagPopover(label) {
  const tag = label.dataset.tag;
  tagPopoverTitle.textContent = tag;
  tagPopoverDesc.textContent = tagDefinitions[tag] || 'No description available.';
  tagPopoverEl.style.display = 'block';

  const rect = label.getBoundingClientRect();
  tagPopoverEl.style.visibility = 'hidden';
  tagPopoverEl.style.display = 'block';
  const popRect = tagPopoverEl.getBoundingClientRect();
  let left = rect.left - popRect.width - 14;
  if (left < 10) left = rect.left; // not enough room to the left either — overlap slightly rather than vanish
  let top = rect.top - 4;
  if (top + popRect.height > window.innerHeight - 10) top = window.innerHeight - popRect.height - 10;
  if (top < 10) top = 10;
  tagPopoverEl.style.left = left + 'px';
  tagPopoverEl.style.top = top + 'px';
  tagPopoverEl.style.visibility = 'visible';
}

function hideTagPopover() {
  tagPopoverEl.style.display = 'none';
}

freshToggle.addEventListener('change', loadRecommendations);

function showCoverPopover(coverImg) {
  const key = coverImg.dataset.seriesKey;
  const r = recsByKey[key];
  if (!r) return;

  popoverImg.src = r.cover_url;
  popoverTitle.textContent = r.series_name;
  popoverDesc.textContent = r.description && r.description.trim()
    ? r.description.trim()
    : 'No description available yet for this series.';

  popoverEl.style.display = 'flex';
  positionPopover(coverImg);
}

function positionPopover(coverImg) {
  const rect = coverImg.getBoundingClientRect();
  const popRect = popoverEl.getBoundingClientRect();
  let left = rect.right + 14;
  let top = rect.top;

  // Flip to the left of the cover if there's not enough room on the right
  // (the fixed tag sidebar occupies the far right, so this matters here
  // more than on a typical page).
  if (left + popRect.width > window.innerWidth - 20) {
    left = rect.left - popRect.width - 14;
  }
  if (left < 10) left = 10;

  // Clamp vertically so it never runs off the bottom of the viewport.
  if (top + popRect.height > window.innerHeight - 10) {
    top = window.innerHeight - popRect.height - 10;
  }
  if (top < 10) top = 10;

  popoverEl.style.left = left + 'px';
  popoverEl.style.top = top + 'px';
}

function hideCoverPopover() {
  popoverEl.style.display = 'none';
}

listEl.addEventListener('mouseenter', (e) => {
  if (e.target.classList && e.target.classList.contains('rec-cover')) {
    showCoverPopover(e.target);
  }
}, true);

listEl.addEventListener('mouseleave', (e) => {
  if (e.target.classList && e.target.classList.contains('rec-cover')) {
    hideCoverPopover();
  }
}, true);

tagClearBtn.addEventListener('click', () => {
  checkedBoostTags.clear();
  tagChecklistEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  loadRecommendations();
});

async function submitTag() {
  const uid = currentUserId();
  const seriesName = tagSeriesInput.value.trim();
  const tag = tagValueInput.value.trim();
  tagFormStatus.className = '';
  if (!uid || !seriesName || !tag) {
    tagFormStatus.textContent = 'Pick a user, a series, and a tag.';
    tagFormStatus.className = 'error';
    return;
  }
  tagSubmitBtn.disabled = true;
  try {
    const resp = await fetch('/awards/api/series-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, series_name: seriesName, tag }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      tagFormStatus.textContent = data.detail || `Could not add tag (HTTP ${resp.status}).`;
      tagFormStatus.className = 'error';
      return;
    }
    tagFormStatus.textContent = data.already_existed
      ? 'You already tagged this series with that tag.'
      : `Tagged "${seriesName}" with "${tag}".`;
    tagFormStatus.className = 'ok';
    tagValueInput.value = '';
    loadRecommendations();
  } catch (e) {
    tagFormStatus.textContent = 'Network error: ' + e.message;
    tagFormStatus.className = 'error';
  } finally {
    tagSubmitBtn.disabled = false;
  }
}

selectEl.addEventListener('change', loadRecommendations);
tagSubmitBtn.addEventListener('click', submitTag);

loadUsers();
loadSeriesDatalist();
loadTagChecklist();
