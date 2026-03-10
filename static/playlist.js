function fmtDate(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function loadPlaylists() {
  const root = document.getElementById("playlists");
  const realmEl = document.getElementById("realm-stats");
  root.innerHTML = "<div class='state-msg'>Loading…</div>";

  const res = await fetch("/awards/api/playlists", { cache: "no-store" });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API did not return JSON (HTTP ${res.status}). First 200 chars: ${text.slice(0,200)}`);
  }

  root.innerHTML = "";

  // --- Realm-wide stats ---
  let realmPlaylists = 0, realmTotal = 0, realmDone = 0;

  (data.users || []).forEach(u => {
    (u.playlists || []).forEach(pl => {
      realmPlaylists++;
      (pl.items || []).forEach(it => {
        realmTotal++;
        if (it.finished) realmDone++;
      });
    });
  });

  if (realmTotal > 0) {
    const realmPct = Math.round(realmDone / realmTotal * 100);
    realmEl.innerHTML = `
      <span class="realm-stat"><strong>${(data.users||[]).length}</strong> listener${(data.users||[]).length!==1?"s":""}</span>
      <span class="realm-stat"><strong>${realmPlaylists}</strong> playlist${realmPlaylists!==1?"s":""}</span>
      <span class="realm-stat"><strong>${realmDone}</strong> / <strong>${realmTotal}</strong> books complete</span>
      <span class="realm-stat"><strong>${realmPct}%</strong> realm completion</span>
    `;
  }

  // --- Per-user blocks ---
  (data.users || []).forEach(u => {
    // User aggregate counts
    let userTotal = 0, userDone = 0;
    (u.playlists || []).forEach(pl => {
      (pl.items || []).forEach(it => {
        userTotal++;
        if (it.finished) userDone++;
      });
    });
    const userPct = userTotal > 0 ? Math.round(userDone / userTotal * 100) : 0;

    const userBlock = document.createElement("div");
    userBlock.className = "user-block";

    const plCount = (u.playlists || []).length;
    userBlock.innerHTML = `
      <div class="user-block-header">
        <h2>${esc(u.username)}</h2>
        <span class="meta">${plCount} playlist${plCount !== 1 ? "s" : ""}</span>
        ${userTotal > 0 ? `
        <div class="user-progress-wrap">
          <div class="user-progress-track">
            <div class="user-progress-fill" style="width:${userPct}%"></div>
          </div>
          <div class="user-fraction">${userDone}/${userTotal} books &middot; ${userPct}%</div>
        </div>` : ""}
      </div>
      <div class="user-block-body"></div>
    `;

    const body = userBlock.querySelector(".user-block-body");

    (u.playlists || []).forEach(pl => {
      const items = pl.items || [];
      const total = items.length;
      const done = items.filter(it => it.finished).length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const complete = total > 0 && done === total;

      const updated = fmtDate(pl.updatedAt || pl.lastUpdate);

      const details = document.createElement("details");
      if (complete) details.classList.add("pl-complete");

      const badgeHtml = complete
        ? `<span class="pl-badge">✦ Complete</span>`
        : "";

      const barHtml = total > 0 ? `
        <div class="pl-bar-wrap">
          <div class="pl-bar-track">
            <div class="pl-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="pl-fraction">${done}/${total}</span>
      ` : "";

      const itemsHtml = total === 0
        ? `<div class="pl-empty">No items in this playlist.</div>`
        : `<ul>${items.map(it => {
            const cover = it.coverUrl ? esc(it.coverUrl) : "";
            const liClass = it.finished ? " item-done" : "";
            return `
            <li class="${liClass}">
              <div class="item-row">
                <span class="check ${it.finished ? "on" : ""}" title="${it.finished ? "Finished" : "Not yet finished"}"></span>
                ${cover ? `<img class="cover" loading="lazy" src="${cover}" alt="" onerror="this.style.display='none'" />` : ""}
                <div class="item-text">
                  <div class="title">${esc(it.title || "(untitled)")}</div>
                  ${it.author ? `<div class="author">${esc(it.author)}</div>` : ""}
                </div>
              </div>
            </li>`;
          }).join("")}</ul>`;

      details.innerHTML = `
        <summary>
          <span class="pl-chevron">&#9658;</span>
          <span class="pl-name">${esc(pl.name)}</span>
          ${barHtml}
          ${badgeHtml}
          ${updated ? `<span class="pl-meta">${esc(updated)}</span>` : ""}
        </summary>
        ${itemsHtml}
      `;

      body.appendChild(details);
    });

    if ((u.playlists || []).length === 0) {
      body.innerHTML = `<div class="pl-empty">No playlists found.</div>`;
    }

    root.appendChild(userBlock);
  });

  if ((data.users || []).length === 0) {
    root.innerHTML = `<div class="state-msg">No playlist data found.</div>`;
  }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  loadPlaylists().catch(err => {
    const playlistsEl = document.getElementById("playlists");
    if (playlistsEl) {
      playlistsEl.innerHTML = `<div class="state-msg">Failed to load playlists: ${esc(err?.message || String(err))}</div>`;
    }
  });
});
