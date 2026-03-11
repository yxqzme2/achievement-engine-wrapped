const s = requireState();
initProgressBars(8);
initCombatUI();
initFireworks();

const slideContent = document.getElementById('slide-content');

if (s.win === false) {
  // ── LOSE STATE ─────────────────────────────────────────────────────────────
  document.getElementById('outro-lose').style.display = 'flex';

  const bossHP = s.bossCurrentHP || 0;
  const bossMax = s.bossMaxHP || 100000;
  const bossRemaining = Math.round((bossHP / bossMax) * 100);
  const cp = (s.userSheet || {}).combat_power || 0;
  const username = (s.username || 'Asset').toUpperCase();

  const desc = document.getElementById('lose-desc');
  if (desc) {

  const charBtn = document.getElementById('outro-character-btn');
  const qpUserId = new URLSearchParams(window.location.search).get('userId') || '';
  const resolvedUserId = (s && s.userId) || qpUserId;
  const charUrl = resolvedUserId
    ? `/character?userId=${encodeURIComponent(resolvedUserId)}`
    : '/wrapped';

  if (charBtn) {
    charBtn.setAttribute('href', charUrl);
  }
    let closeMsg = '';
    if (bossRemaining <= 5)       closeMsg = `The Administrator fell to its knees — then recovered. ${bossRemaining}% HP remained. A razor's edge.`;
    else if (bossRemaining <= 15) closeMsg = `The Administrator endured with ${bossRemaining}% HP intact. Agonizingly close.`;
    else if (bossRemaining <= 35) closeMsg = `${bossRemaining}% of the Administrator's HP survived the purge. The gap is closeable.`;
    else                          closeMsg = `The Administrator retained ${bossRemaining}% HP. Your configuration requires significant recalibration.`;

    desc.innerHTML =
      `The System has rendered its verdict on <strong style="color:#ff8888;">${username}</strong>. ` +
      `${closeMsg} ` +
      `With a Combat Power of <span style="color:#ffaa00;font-weight:bold;">${cp.toLocaleString()}</span>, ` +
      `your loadout was insufficient to complete the Purge Protocol. ` +
      `<br><br>` +
      `<span style="color:#aaaaaa;">Review your <strong>Character Sheet</strong> to inspect your build and gear, ` +
      `then invoke the Recursion Protocol to re-enter the simulation.</span>`;
  }

} else {
  // ── WIN STATE ───────────────────────────────────────────────────────────────
  document.getElementById('outro-win').style.display = 'flex';

  setTimeout(() => {
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        triggerFirework(
          100 + Math.random() * (window.innerWidth  - 200),
          100 + Math.random() * (window.innerHeight - 200)
        );
      }, i * 350);
    }
  }, 500);
}
