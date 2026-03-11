
  // ══════════════════════ SIMULATION STATE
  const SLIDE_IDS = ['s-intro','s-hours','s-books','s-author','s-months','s-personality','s-execute','s-gear','s-outro'];
  let currentIdx = 0;
  let isSlideLocked = true; 
  
  let bossMaxHP = 15000;
  let bossCurrentHP = 15000;
  let userMaxHP = 2000;
  let userCurrentHP = 2000;

  let wrappedUserId = new URLSearchParams(window.location.search).get('userId') || '';
  let userInventory = [];
  let wrappedStats  = null; // Populated from /awards/api/wrapped

  const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                       'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

  // Fetch promises — reassigned by selectUser() or pre-fired if URL param is present
  let _bossStatsPromise  = Promise.resolve(null);
  let _wrappedDataPromise = Promise.resolve(null);

  if (wrappedUserId) {
    _bossStatsPromise  = fetch(`/awards/api/gear/boss-stats?user_id=${encodeURIComponent(wrappedUserId)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    _wrappedDataPromise = fetch(`/awards/api/wrapped?user_id=${encodeURIComponent(wrappedUserId)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
  }

  function selectUser(userId) {
    wrappedUserId       = userId;
    _bossStatsPromise  = fetch(`/awards/api/gear/boss-stats?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    _wrappedDataPromise = fetch(`/awards/api/wrapped?user_id=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    startSimulation();
  }

  // ══════════════════════ CORE FUNCTIONS
  async function startSimulation() {
    document.getElementById('picker').style.display = 'none';
    document.getElementById('experience').style.display = 'block';

    // Apply live boss & character data
    try {
      const bossResult = await _bossStatsPromise;
      if (bossResult && bossResult.boss) {
        bossMaxHP     = bossResult.boss.boss_hp;
        bossCurrentHP = bossMaxHP;
      }
      if (bossResult && bossResult.inventory) {
        userInventory = bossResult.inventory;
      }
      if (bossResult && bossResult.user_sheet) {
        const ts = bossResult.user_sheet.total_stats || {};
        const cp = bossResult.user_sheet.combat_power || 0;
        userMaxHP     = Math.max(1200, (ts.hp || 300) * 5);
        userCurrentHP = userMaxHP;

        // Populate stats bar
        const statsBar = document.getElementById('user-stats-bar');
        if (statsBar) {
          statsBar.innerHTML =
            `<span class="stat-chip str">STR ${ts.str||0}</span>` +
            `<span class="stat-chip mag">MAG ${ts.mag||0}</span>` +
            `<span class="stat-chip def">DEF ${ts.def||0}</span>` +
            `<span class="stat-chip hp">HP ${ts.hp||0}</span>`  +
            `<span class="stat-chip cp">CP ${cp}</span>`;
          statsBar.style.display = 'flex';
        }
      }
    } catch(e) { /* use defaults */ }

    // Apply live wrapped stats
    try {
      const wResult = await _wrappedDataPromise;
      if (wResult) {
        wrappedStats = wResult;
        const s = wResult.stats || {};
        const username = wResult.username || 'LISTENER';

        // Slide 1: username
        const slamEl = document.getElementById('slam-name');
        if (slamEl) slamEl.textContent = username;
        const hpLabel = document.getElementById('hp-user-label');
        if (hpLabel) hpLabel.textContent = username.toUpperCase();

        // Slide 3: combo text
        const comboEl = document.getElementById('s-books-combat-text');
        if (comboEl) comboEl.textContent = `${s.totalBooks || '?'}-HIT COMBO!`;

        // Slide 4: author & narrator names (centre panel + RPG nameplates)
        const authorName    = (s.topAuthor   || {}).name || '???';
        const narratorName  = (s.topNarrator || {}).name || '???';
        const authorEl      = document.getElementById('s4-author-name');
        const narratorEl    = document.getElementById('s4-narrator-name');
        const npLeft        = document.getElementById('s4-rpg-nameplate-left');
        const npRight       = document.getElementById('s4-rpg-nameplate-right');
        if (authorEl)   authorEl.textContent   = authorName.toUpperCase();
        if (narratorEl) narratorEl.textContent = narratorName.toUpperCase();
        if (npLeft)     npLeft.textContent     = authorName;
        if (npRight)    npRight.textContent    = narratorName;

        // Slide 5: peak month
        const monthEl = document.getElementById('s5-l4');
        if (monthEl) monthEl.textContent = MONTH_NAMES[s.mostActiveMonth || 0];

        // Slide 6: personality class name
        const personalityEl = document.getElementById('s6-l2');
        if (personalityEl && s.personality) personalityEl.innerHTML = `<center>${s.personality.name}</center>`;
      }
    } catch(e) { /* use defaults */ }

    // Build story progress bars (one per slide)
    document.getElementById('story-bars').innerHTML =
      SLIDE_IDS.map(() => `<div class="story-bar"><div class="story-fill"></div></div>`).join('');

    // Generate book covers (real count from wrappedStats or fallback to 18)
    const totalBooks = (wrappedStats && wrappedStats.stats) ? (wrappedStats.stats.totalBooks || 18) : 18;
    const perBookDmg = 150;
    let coversHtml = '';
    for(let i=0; i<totalBooks; i++) {
        coversHtml += `
        <div class="mock-cover s3-cov-item">
            Q${i+1}
            <div class="tooltip">
                <span class="tt-title">Quest Complete</span>
                Target: Book ${i+1}<br>
                Damage: <span class="tt-dmg">${perBookDmg}</span>
            </div>
        </div>`;
    }
    document.getElementById('s-books-covers').innerHTML = coversHtml;
      
    initLS();
    initSpiral();
    initFireworks();
    initStars();
    initGrass();
    initCrowdSim();
    showSlide(0);
  }

  function lockSlide() {
      isSlideLocked = true;
      document.getElementById('nav-left').classList.remove('visible');
      document.getElementById('nav-right').classList.remove('visible');
  }

  function unlockSlide() {
      isSlideLocked = false;
      if (currentIdx > 0) document.getElementById('nav-left').classList.add('visible');
      if (currentIdx < SLIDE_IDS.length - 1) document.getElementById('nav-right').classList.add('visible');
  }

  function nextSlide() {
    if (isSlideLocked) return; 
    if (currentIdx < SLIDE_IDS.length - 1) {
      currentIdx++;
      showSlide(currentIdx);
    }
  }

  function prevSlide() {
    if (isSlideLocked) return; 
    if (currentIdx > 0) {
      currentIdx--;
      showSlide(currentIdx);
    }
  }

  window.addEventListener('keydown', function(e) {
      if(document.getElementById('experience').style.display !== 'block') return;
      if(e.key === 'ArrowRight') nextSlide();
      if(e.key === 'ArrowLeft') prevSlide();
  });

  function showSlide(idx) {
    document.querySelectorAll('.slide').forEach((el, i) => {
      if (i === idx) {
          el.classList.add('active');
          el.style.pointerEvents = 'auto'; 
      } else {
          el.classList.remove('active');
          el.style.pointerEvents = 'none';
      }
    });
    
    const fills = document.querySelectorAll('.story-fill');
    fills.forEach((f, i) => { f.style.width = (i <= idx) ? '100%' : '0%'; });

    triggerCombatAction(idx);
  }

  // ══════════════════════ COMBAT ENGINE
  function updateHP(target, newHP) {
    if(target === 'boss') {
        bossCurrentHP = Math.max(0, newHP);
        let pct = (bossCurrentHP / bossMaxHP) * 100;
        document.getElementById('boss-hp-fill').style.width = pct + '%';
        document.getElementById('boss-hp-text').innerText = `${bossCurrentHP.toLocaleString()} / ${bossMaxHP.toLocaleString()}`;
    } else {
        userCurrentHP = Math.max(0, Math.min(userMaxHP, newHP));
        let pct = (userCurrentHP / userMaxHP) * 100;
        document.getElementById('user-hp-fill').style.width = pct + '%';
        document.getElementById('user-hp-text').innerText = `${userCurrentHP.toLocaleString()} / ${userMaxHP.toLocaleString()}`;
    }
  }

  function countUpHP(elementId, targetHP, maxHP, duration) {
    const el = document.getElementById(elementId);
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(ease * targetHP);
      el.innerText = `${current.toLocaleString()} / ${maxHP.toLocaleString()}`;
      if (progress < 1) requestAnimationFrame(step);
      else el.innerText = `${targetHP.toLocaleString()} / ${maxHP.toLocaleString()}`;
    };
    requestAnimationFrame(step);
  }

  function countUpSimple(elementId, targetNum, duration) {
    const el = document.getElementById(elementId);
    let start = null;
    const step = (ts) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(ease * targetNum);
        el.innerText = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
        else el.innerText = targetNum.toLocaleString();
    };
    requestAnimationFrame(step);
  }

  // Modified to take specific X/Y pixel coordinates
  function spawnDamageText(text, target, color, fixedX, fixedY) {
    const ui = document.getElementById('combat-ui');
    const dmg = document.createElement('div');
    dmg.className = 'floating-text';
    dmg.innerText = text;
    dmg.style.color = color;
    
    if(fixedX && fixedY) {
        dmg.style.left = fixedX + 'px';
        dmg.style.top = fixedY + 'px';
    } else {
        if(target === 'boss') {
            dmg.style.top = '30%';
            dmg.style.left = (40 + Math.random() * 20) + '%';
        } else {
            dmg.style.bottom = '30%';
            dmg.style.left = (40 + Math.random() * 20) + '%';
        }
    }
    
    ui.appendChild(dmg);
    setTimeout(() => dmg.remove(), 1500); 
  }

  function triggerShake(intensity = 'light') {
    const el = document.getElementById('experience'); 
    let offset = intensity === 'heavy' ? 18 : 6; 
    el.style.transform = `translate(${offset}px, ${offset}px)`;
    setTimeout(() => el.style.transform = `translate(-${offset}px, -${offset}px)`, 40);
    setTimeout(() => el.style.transform = `translate(${offset}px, -${offset}px)`, 80);
    setTimeout(() => el.style.transform = `translate(-${offset}px, ${offset}px)`, 120);
    setTimeout(() => el.style.transform = `translate(0, 0)`, 160);
  }

  // ══════════════════════ NARRATIVE TIMELINE
  function triggerCombatAction(idx) {
    const ui = document.getElementById('combat-ui');
    lockSlide(); 
    
    // Reset rapid-fire bar setting
    document.getElementById('boss-hp-fill').classList.remove('rapid');

    if(idx === 0) {
        ui.style.display = 'block';
        document.getElementById('boss-hp-fill').style.width = '0%';
        document.getElementById('user-hp-fill').style.width = '0%';
        document.getElementById('boss-hp-text').innerText = `0 / ${bossMaxHP.toLocaleString()}`;
        document.getElementById('user-hp-text').innerText = `0 / ${userMaxHP.toLocaleString()}`;

        setTimeout(() => {
            document.getElementById('boss-hp-container').style.opacity = '1';
            document.getElementById('user-hp-container').style.opacity = '1';
            const statsBar = document.getElementById('user-stats-bar');
            if (statsBar) {
                statsBar.style.display = 'flex';
                // Trigger reflow for transition
                void statsBar.offsetWidth;
                statsBar.style.opacity = '1';
            }
        }, 500);

        setTimeout(() => {
            document.getElementById('boss-hp-fill').style.width = '100%';
            document.getElementById('user-hp-fill').style.width = '100%';
            countUpHP('boss-hp-text', bossMaxHP, bossMaxHP, 1500);
            countUpHP('user-hp-text', userMaxHP, userMaxHP, 1500);
        }, 2000);

        let slamEl = document.getElementById('slam-name');
        if(slamEl) {
            slamEl.classList.remove('name-slam');
            void slamEl.offsetWidth; 
            slamEl.classList.add('name-slam');
        }
        setTimeout(unlockSlide, 3800); 
    }
    else if(idx === 1) {
        const totalHours = (wrappedStats && wrappedStats.stats) ? Math.round(wrappedStats.stats.totalHours) : 342;
        const hoursDmg   = totalHours * 10;
        document.getElementById('s-hours-num').innerText = '0';
        document.getElementById('s-hours-combat-text').style.opacity = '0';
        countUpSimple('s-hours-num', totalHours, 2000);

        setTimeout(() => {
            document.getElementById('s-hours-combat-text').style.opacity = '1';
            spawnDamageText(`-${hoursDmg.toLocaleString()}`, 'boss', '#ffffff');
            triggerShake('heavy');
            updateHP('boss', bossCurrentHP - hoursDmg);
        }, 3500);
        setTimeout(unlockSlide, 4200);
    }
    else if(idx === 2) {
        // Slide 3: Quest Bar Charging Phase
        const statusText = document.getElementById('s3-status');
        const comboText = document.getElementById('s-books-combat-text');
        const glass = document.querySelector('.s3-content');
        
        comboText.style.opacity = '0';
        document.getElementById('boss-hp-fill').classList.add('rapid'); 
        
        const covers = document.querySelectorAll('.s3-cov-item');
        covers.forEach(c => {
            c.classList.remove('pop');
            c.classList.remove('extreme-shake');
            c.style.backgroundColor = '#00ff00'; // Reset to Green
        });

        // 1. CHARGING PHASE (3 Seconds)
        const numCovers = covers.length;
        let chargeDuration = 3000;
        setTimeout(() => {
            for(let i=0; i<numCovers; i++) {
                setTimeout(() => {
                    if(covers[i]) {
                        covers[i].classList.add('pop');
                        
                        // COLOR SHIFT: Moves from Green (120) to Red (0)
                        let hue = 120 - (i * (120 / Math.max(1, numCovers - 1)));
                        covers[i].style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
                        covers[i].style.boxShadow = `0 0 15px hsl(${hue}, 100%, 50%)`;

                        // SHAKE INTENSITY: Starts shaking when 70% full
                        if (i > Math.floor(numCovers * 0.7)) {
                            glass.classList.add('extreme-shake');
                            statusText.innerText = "CRITICAL POWER REACHED...";
                            statusText.style.color = "#ff0000";
                        }
                    }
                }, i * (chargeDuration / Math.max(1, numCovers)));
            }
        }, 1000);

        // 2. BARRAGE PHASE
        setTimeout(() => {
            glass.classList.remove('extreme-shake');
            statusText.innerText = "RELEASING ARSENAL!";

            for(let i=0; i<numCovers; i++) {
                setTimeout(() => {
                    let hitX = window.innerWidth * (0.2 + Math.random() * 0.6);
                    let hitY = window.innerHeight * (0.2 + Math.random() * 0.6);

                    triggerFirework(hitX, hitY);
                    spawnDamageText('-150', 'boss', '#00e5ff', hitX, hitY);
                    triggerShake('light');
                    updateHP('boss', bossCurrentHP - 150);

                    if(covers[i]) covers[i].style.opacity = '0.2';
                    if (i === numCovers - 1) comboText.style.opacity = '1';
                }, i * 150);
            }
        }, 1000 + chargeDuration + 500);

        setTimeout(unlockSlide, 1000 + chargeDuration + 500 + numCovers * 150 + 1500);
    }
    else if(idx === 3) {
        // Slide 4: Double Battle Summon
        const centerText = document.getElementById('s4-summon-center');
        const boxLeft = document.getElementById('s4-rpg-ui-left');
        const boxRight = document.getElementById('s4-rpg-ui-right');
        const pLeft = document.getElementById('proj-left');
        const pRight = document.getElementById('proj-right');

        // Reset
        if(centerText) centerText.style.opacity = '0';
        if(boxLeft) boxLeft.style.display = 'none';
        if(boxRight) boxRight.style.display = 'none';
        pLeft.style.opacity = '0';
        pRight.style.opacity = '0';

        // 1. Initial Double Summon Flash
        setTimeout(() => { if(centerText) centerText.style.opacity = '1'; }, 800);

        // 2. Clear center and show Battle Boxes
        setTimeout(() => {
            if(centerText) centerText.style.opacity = '0';
            setTimeout(() => {
                if(boxLeft) boxLeft.style.display = 'block';
                if(boxRight) boxRight.style.display = 'block';
                
                // Declare attacks using real data
                const authorHrs  = wrappedStats ? Math.round((wrappedStats.stats.topAuthor   || {}).hours || 0) : 0;
                const narratorBk = wrappedStats ? ((wrappedStats.stats.topNarrator || {}).bookCount || 0)       : 0;
                const authorLine   = authorHrs  ? `Casts ${authorHrs} hours of pure magic!`              : 'Unleashes a devastating assault!';
                const narratorLine = narratorBk ? `Narrated ${narratorBk} of your books this year!`      : 'Weaponizes their voice for maximum damage!';
                typeWriter(authorLine,   's4-rpg-text-left',  40);
                typeWriter(narratorLine, 's4-rpg-text-right', 40);
            }, 600);
        }, 2200);

        // 3. Fire the Attack Lines (Anime.js)
        setTimeout(() => {
            pLeft.style.opacity = '1';
            pRight.style.opacity = '1';
            
            const targetX = window.innerWidth / 2; // Top center of screen
            const targetY = 80; // Height of the boss HP bar

            // Left Beam (Author) - Flies up and right
            anime({
                targets: '#proj-left',
                translateX: [window.innerWidth * 0.2, targetX - 40],
                translateY: [window.innerHeight - 150, targetY],
                rotate: ['45deg', '45deg'], // Pointing up-right
                duration: 1200, // SLOWED DOWN (was 600)
                easing: 'easeInSine',
                complete: function() { pLeft.style.opacity = '0'; }
            });

            // Right Beam (Narrator) - Flies up and left
            anime({
                targets: '#proj-right',
                translateX: [window.innerWidth * 0.8, targetX + 40],
                translateY: [window.innerHeight - 150, targetY],
                rotate: ['-45deg', '-45deg'], // Pointing up-left
                duration: 1200, // SLOWED DOWN (was 600)
                easing: 'easeInSine',
                complete: function() { pRight.style.opacity = '0'; }
            });
        }, 5000); // Waits for typing to finish

        // 4. Impact & Damage
        // Changed from 5600 to 6200 to accommodate the slower 1.2-second flight time
        setTimeout(() => {
            spawnDamageText('-2,400', 'boss', '#00e5ff', window.innerWidth/2 - 50, 150);
            spawnDamageText('-1,800', 'boss', '#ffaa00', window.innerWidth/2 + 50, 180);
            triggerShake('heavy'); 
            updateHP('boss', bossCurrentHP - 4200);
        }, 6200); 

        // 5. Post-Damage Result (Appended to boxes)
        // Changed to 6800 so it types out right after the damage is dealt
        setTimeout(() => {
            typeWriter(" It's super effective!", 's4-rpg-text-left', 40, true);
            typeWriter(" A critical hit!", 's4-rpg-text-right', 40, true);
        }, 6800);
        
        // 6. UNLOCK
        setTimeout(unlockSlide, 9500);
    }

    else if(idx === 4) {
    // 1. Reset Text & Shield
    for(let i=1; i<=6; i++) {
        document.getElementById(`s5-l${i}`).classList.remove('s5-show');
    }
    const shield = document.getElementById('user-shield');
    shield.classList.remove('shield-active');

    // 2. CHOREOGRAPHED TEXT REVEAL
    // Sequence starts when the slide finishes its transition
    setTimeout(() => document.getElementById('s5-l1').classList.add('s5-show'), 500);
    setTimeout(() => document.getElementById('s5-l2').classList.add('s5-show'), 1200);
    setTimeout(() => document.getElementById('s5-l3').classList.add('s5-show'), 2000);
    setTimeout(() => document.getElementById('s5-l4').classList.add('s5-show'), 2800);
    setTimeout(() => document.getElementById('s5-l5').classList.add('s5-show'), 3800);
    setTimeout(() => document.getElementById('s5-l6').classList.add('s5-show'), 4800);

    // 3. DAMAGE DELAY: Strike happens 1.5s after the final warning text
    const STRIKE_TIME = 6300;
    const hoursByMonth  = wrappedStats ? (wrappedStats.stats.hoursByMonth || []) : [];
    const peakMonthHrs  = hoursByMonth.length ? Math.max(...hoursByMonth) : 90;
    const peakStrikeDmg = Math.max(300, Math.round(peakMonthHrs * 10));

    setTimeout(() => {
        shield.classList.add('shield-active'); // Activate Shield

        spawnDamageText(`-${peakStrikeDmg.toLocaleString()}`, 'user', '#ff0000');
        triggerShake('heavy');
        updateHP('user', Math.max(100, userCurrentHP - peakStrikeDmg));

        setTimeout(() => shield.classList.remove('shield-active'), 1500);
    }, STRIKE_TIME);

    // 4. UNLOCK: Total sequence time + buffer
    setTimeout(unlockSlide, STRIKE_TIME + 2000);
    }
    else if(idx === 5) {
        // Reset Text
        for(let i=1; i<=3; i++) {
            document.getElementById(`s6-l${i}`).classList.remove('text-visible');
        }

        setTimeout(() => document.getElementById('s6-l1').classList.add('text-visible'), 500);
        setTimeout(() => document.getElementById('s6-l2').classList.add('text-visible'), 1200);
        setTimeout(() => {
            document.getElementById('s6-l3').classList.add('text-visible');
            
            // Trigger Lifesteal & Poison
            spawnDamageText('+400 HP', 'user', '#00ff00');
            updateHP('user', 1000);
            
            setTimeout(() => {
                spawnDamageText('-1,500 [POISON]', 'boss', '#00ff00');
                triggerShake('light'); 
                updateHP('boss', 4980);
            }, 800);
        }, 2200);

        setTimeout(unlockSlide, 4500);
     }
    else if(idx === 6) {
        // Slide 7: Execute Range Phase
        const l1 = document.getElementById('s7-l1');
        const l2 = document.getElementById('s7-l2');
        const l3 = document.getElementById('s7-l3');
        const fx = document.getElementById('screen-fx');
        
        [l1, l2, l3].forEach(el => el.classList.remove('text-visible'));
        
        // Reset crowd speed (in case of a simulation restart)
        gsap.globalTimeline.timeScale(1);

        // 1. TEXT REVEAL
        setTimeout(() => l1.classList.add('text-visible'), 500);
        setTimeout(() => l2.classList.add('text-visible'), 1200);
        setTimeout(() => l3.classList.add('text-visible'), 2500);

        // 2. DELAYED IMPACT: Wait 4.5 seconds after text before striking
        setTimeout(() => {
            const EXECUTE_DMG = 5000;
            
            spawnDamageText(`-${EXECUTE_DMG.toLocaleString()} [EXECUTION]`, 'boss', '#ffaa00');
            triggerShake('heavy'); 
            updateHP('boss', Math.max(0, bossCurrentHP - EXECUTE_DMG));

            // SLOW MOTION: GSAP smoothly slows the crowd to 10% speed over 0.5s
            gsap.to(gsap.globalTimeline, { timeScale: 0.1, duration: 0.5, ease: "power2.out" });

            // 3. BRANCHING LOGIC: Check if the boss is dead
            if (bossCurrentHP <= 0) {
                // ---> WIN CONDITION: RED FLASH
                fx.style.transition = 'opacity 0.1s';
                fx.style.backgroundColor = '#ff0000';
                fx.style.opacity = '0.5';
                
                // Fade the red flash out quickly
                setTimeout(() => {
                    fx.style.transition = 'opacity 2s ease-out';
                    fx.style.opacity = '0';
                }, 150);

                // Auto-advance to gear reveal slide after 3 seconds of slow-mo
                setTimeout(() => {
                    currentIdx = 7;
                    showSlide(currentIdx);
                }, 3000);

            } else {
                // ---> LOSE CONDITION: FADE TO BLACK & AUTO-ADVANCE
                
                // Change Outro Text to Defeat
                document.getElementById('outro-glass').style.borderColor = '#ff0000';
                document.getElementById('outro-glass').style.boxShadow = '0 0 30px rgba(255,0,0,0.3)';
                document.getElementById('outro-lbl').style.color = '#ff0000';
                document.getElementById('outro-lbl').innerText = 'SYSTEM PURGE';
                document.getElementById('outro-title').innerText = 'You were unworthy.';
                document.getElementById('outro-desc').innerText = 'Defeat recorded. Your next chapter holds the strength you’re missing — keep listening.. Your avatar has been liquidated.';

                // Fade screen to black over 2.5 seconds
                fx.style.transition = 'opacity 2.5s ease-in-out';
                fx.style.backgroundColor = '#000000';
                fx.style.opacity = '1';

                // Warp to outro (defeat) while the screen is black, skip gear reveal
                setTimeout(() => {
                    currentIdx = 8;
                    showSlide(currentIdx);

                    // Fade the black overlay away to reveal the Defeat screen
                    setTimeout(() => {
                        fx.style.opacity = '0';
                    }, 500);
                }, 3000);
            }
        }, 7000); // 7000ms total = 2500ms (text reveal) + 4500ms (reading delay)
    }
    else if(idx === 7) {
        // Gear Reveal Slide
        const grid   = document.getElementById('gear-reveal-grid');
        const count  = document.getElementById('gear-reveal-count');
        const footer = document.getElementById('gear-reveal-footer');
        const link   = document.getElementById('gear-char-link');

        if (grid)   grid.innerHTML = '';
        if (footer) footer.style.opacity = '0';
        if (link && wrappedUserId) link.href = `/awards/character?userId=${encodeURIComponent(wrappedUserId)}`;

        const RARITY_COLORS = {
            Common: '#888', Uncommon: '#69f0ae', Rare: '#42a5f5', Epic: '#b388ff', Legendary: '#ffc107'
        };

        const items = userInventory.filter(it => it.item_id && it.item_id !== 'loot_000a');
        if (count) count.textContent = `${items.length} item${items.length !== 1 ? 's' : ''} in your collection`;

        if (items.length === 0) {
            if (grid) grid.innerHTML = '<div style="color:var(--muted); font-style:italic; padding:20px;">No gear acquired yet — keep listening!</div>';
            setTimeout(unlockSlide, 2000);
            return;
        }

        items.forEach((item, i) => {
            const rarity = item.rarity || 'Common';
            const card   = document.createElement('div');
            card.className = `gear-card rarity-${rarity}`;
            card.innerHTML = `
                <div class="gc-slot">${item.slot || '?'}</div>
                <div class="gc-name">${item.item_name || item.item_id}</div>
                <div class="gc-rarity">${rarity}</div>
                <div class="gc-ilvl">iLvl ${item.item_level || 0}</div>
            `;
            if (grid) grid.appendChild(card);
            setTimeout(() => {
                card.classList.add('revealed');
                if (rarity === 'Legendary') {
                    triggerFirework(
                        150 + Math.random() * (window.innerWidth - 300),
                        150 + Math.random() * (window.innerHeight - 300)
                    );
                }
            }, 400 + i * 130);
        });

        const totalMs = 400 + items.length * 130 + 800;
        setTimeout(() => { if (footer) footer.style.opacity = '1'; }, totalMs);
        setTimeout(unlockSlide, totalMs + 800);
    }
    else if(idx === 8) {
        // Outro (Permanently Locked)
        document.getElementById('boss-hp-container').style.opacity = '0';
        document.getElementById('boss-hp-container').style.transform = 'translateY(-50px)';

        lockSlide();
    }
  }

  // ══════════════════════ BACKGROUND EFFECTS
  // [Long Shadow Code Snipped for brevity, but kept intact]
  const lsCanvas = document.getElementById("ls-canvas");
  const lsCtx = lsCanvas.getContext("2d");
  let lsBoxes = [];
  const lsColors = ["#4a0000", "#ff2a2a", "#8b0000", "#ff5500"];
  let lsLight = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function resizeLS() {
      if(!lsCanvas) return;
      const box = lsCanvas.parentElement.getBoundingClientRect();
      lsCanvas.width = box.width;
      lsCanvas.height = box.height;
  }
  function drawLSLight() {
      lsCtx.beginPath();
      lsCtx.arc(lsLight.x, lsLight.y, 1000, 0, 2 * Math.PI);
      let gradient = lsCtx.createRadialGradient(lsLight.x, lsLight.y, 0, lsLight.x, lsLight.y, 1000);
      gradient.addColorStop(0, "#2a0000"); gradient.addColorStop(1, "#0a0000"); lsCtx.fillStyle = gradient; lsCtx.fill();
      lsCtx.beginPath();
      lsCtx.arc(lsLight.x, lsLight.y, 20, 0, 2 * Math.PI);
      gradient = lsCtx.createRadialGradient(lsLight.x, lsLight.y, 0, lsLight.x, lsLight.y, 5);
      gradient.addColorStop(0, "#ff5555"); gradient.addColorStop(1, "#2a0000"); lsCtx.fillStyle = gradient; lsCtx.fill();
  }
  function LSBox() {
      this.half_size = Math.floor((Math.random() * 50) + 1); this.x = Math.floor((Math.random() * lsCanvas.width) + 1);
      this.y = Math.floor((Math.random() * lsCanvas.height) + 1); this.r = Math.random() * Math.PI; this.shadow_length = 2000;
      this.color = lsColors[Math.floor((Math.random() * lsColors.length))];
      this.getDots = function() {
          const full = (Math.PI * 2) / 4;
          return {
              p1: { x: this.x + this.half_size * Math.sin(this.r), y: this.y + this.half_size * Math.cos(this.r) },
              p2: { x: this.x + this.half_size * Math.sin(this.r + full), y: this.y + this.half_size * Math.cos(this.r + full) },
              p3: { x: this.x + this.half_size * Math.sin(this.r + full * 2), y: this.y + this.half_size * Math.cos(this.r + full * 2) },
              p4: { x: this.x + this.half_size * Math.sin(this.r + full * 3), y: this.y + this.half_size * Math.cos(this.r + full * 3) }
          };
      }
      this.rotate = function() {
          const speed = (60 - this.half_size) / 20; this.r += speed * 0.002; this.x += speed; this.y += speed;
      }
      this.draw = function() {
          const dots = this.getDots();
          lsCtx.beginPath(); lsCtx.moveTo(dots.p1.x, dots.p1.y); lsCtx.lineTo(dots.p2.x, dots.p2.y);
          lsCtx.lineTo(dots.p3.x, dots.p3.y); lsCtx.lineTo(dots.p4.x, dots.p4.y); lsCtx.fillStyle = this.color; lsCtx.fill();
          if (this.y - this.half_size > lsCanvas.height) this.y -= lsCanvas.height + 100;
          if (this.x - this.half_size > lsCanvas.width) this.x -= lsCanvas.width + 100;
      }
      this.drawShadow = function() {
          const dots = this.getDots(); const points = [];
          for (let key in dots) {
              const dot = dots[key]; const angle = Math.atan2(lsLight.y - dot.y, lsLight.x - dot.x);
              points.push({ endX: dot.x + this.shadow_length * Math.sin(-angle - Math.PI / 2), endY: dot.y + this.shadow_length * Math.cos(-angle - Math.PI / 2), startX: dot.x, startY: dot.y });
          }
          for (let i = points.length - 1; i >= 0; i--) {
              const n = i == 3 ? 0 : i + 1;
              lsCtx.beginPath(); lsCtx.moveTo(points[i].startX, points[i].startY); lsCtx.lineTo(points[n].startX, points[n].startY);
              lsCtx.lineTo(points[n].endX, points[n].endY); lsCtx.lineTo(points[i].endX, points[i].endY); lsCtx.fillStyle = "#0a0000"; lsCtx.fill();
          }
      }
  }
  function renderLS() {
      if (currentIdx === 0 && document.getElementById('experience').style.display === 'block') {
          lsCtx.clearRect(0, 0, lsCanvas.width, lsCanvas.height); drawLSLight();
          for (let i = 0; i < lsBoxes.length; i++) { lsBoxes[i].rotate(); lsBoxes[i].drawShadow(); }
          for (let i = 0; i < lsBoxes.length; i++) {
              for (let j = lsBoxes.length - 1; j >= 0; j--) {
                  if(i != j){	
                      const dx = (lsBoxes[j].x + lsBoxes[j].half_size) - (lsBoxes[i].x + lsBoxes[i].half_size);
                      const dy = (lsBoxes[j].y + lsBoxes[j].half_size) - (lsBoxes[i].y + lsBoxes[i].half_size);
                      const d = Math.sqrt(dx * dx + dy * dy);
                      if (d < lsBoxes[j].half_size + lsBoxes[i].half_size) {
                          lsBoxes[j].half_size = lsBoxes[j].half_size > 1 ? lsBoxes[j].half_size - 1 : 1;
                          lsBoxes[i].half_size = lsBoxes[i].half_size > 1 ? lsBoxes[i].half_size - 1 : 1;
                      }
                  }
              }
              lsBoxes[i].draw();
          }
      }
      requestAnimationFrame(renderLS);
  }
  function initLS() {
      resizeLS(); window.addEventListener('resize', resizeLS);
      document.addEventListener('mousemove', function(e) { if (currentIdx === 0) { lsLight.x = e.clientX; lsLight.y = e.clientY; }});
      while (lsBoxes.length < 15) { lsBoxes.push(new LSBox()); }
      renderLS();
  }

  const spiralCanvas = document.getElementById('spiral-canvas');
  const spiralCtx = spiralCanvas.getContext('2d');
  const SPIN_SPEED = 0.08; 
  let spTime = 0, spW, spH;
  const SP_MAX_OFFSET = 400, SP_SPACING = 4, SP_POINTS = SP_MAX_OFFSET / SP_SPACING;
  const SP_PEAK = SP_MAX_OFFSET * 0.25, SP_PPL = 6, SP_SHADOW = 6;
  function resizeSpiral() {
      if(!spiralCanvas) return; const box = spiralCanvas.parentElement.getBoundingClientRect();
      spW = spiralCanvas.width = box.width; spH = spiralCanvas.height = box.height;
  }
  function renderSpiral() {
      if (currentIdx === 1 && document.getElementById('experience').style.display === 'block') {
          spTime += SPIN_SPEED; spiralCtx.clearRect(0, 0, spW, spH);
          let x, y, cx = spW/2, cy = spH/2;
          spiralCtx.globalCompositeOperation = 'lighter'; spiralCtx.strokeStyle = '#00e5ff'; spiralCtx.shadowColor = '#00e5ff';
          spiralCtx.lineWidth = 2; spiralCtx.beginPath();
          for(let i = SP_POINTS; i > 0; i--) {
              let value = i * SP_SPACING + (spTime % SP_SPACING);
              let ax = Math.sin(value/SP_PPL) * Math.PI, ay = Math.cos(value/SP_PPL) * Math.PI;
              x = ax * value; y = ay * value * 0.35;
              let o = 1 - (Math.min(value, SP_PEAK) / SP_PEAK);
              y -= Math.pow(o, 2) * 200; y += 200 * value / SP_MAX_OFFSET; y += x / cx * spW * 0.1;
              spiralCtx.globalAlpha = 1 - (value / SP_MAX_OFFSET); spiralCtx.shadowBlur = SP_SHADOW * o;
              spiralCtx.lineTo(cx + x, cy + y); spiralCtx.stroke(); spiralCtx.beginPath(); spiralCtx.moveTo(cx + x, cy + y);
          }
          spiralCtx.lineTo(cx, cy - 200); spiralCtx.lineTo(cx, 0); spiralCtx.stroke();
      }
      requestAnimationFrame(renderSpiral);
  }
  function initSpiral() { resizeSpiral(); window.addEventListener('resize', resizeSpiral); renderSpiral(); }

  // ══════════════════════ FIREWORKS ENGINE (SLIDE 3)
  const fwCanvas = document.getElementById('fireworks-canvas');
  const fwCtx = fwCanvas.getContext('2d');
  const fwColors = ['#00e5ff', '#18FF92', '#5A87FF', '#FBF38C']; // Tuned to System colors

  function initFireworks() {
      setFwSize();
      window.addEventListener('resize', setFwSize, false);
      anime({ duration: Infinity, update: function() { fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height); }});
  }

  function setFwSize() {
      fwCanvas.width = window.innerWidth * 2;
      fwCanvas.height = window.innerHeight * 2;
      fwCtx.scale(2, 2);
  }

  function setParticuleDirection(p) {
      var angle = anime.random(0, 360) * Math.PI / 180;
      var value = anime.random(50, 180);
      var radius = [-1, 1][anime.random(0, 1)] * value;
      return { x: p.x + radius * Math.cos(angle), y: p.y + radius * Math.sin(angle) };
  }

  function createParticule(x,y) {
      var p = {}; p.x = x; p.y = y; p.color = fwColors[anime.random(0, fwColors.length - 1)];
      p.radius = anime.random(16, 32); p.endPos = setParticuleDirection(p);
      p.draw = function() {
          fwCtx.beginPath(); fwCtx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
          fwCtx.fillStyle = p.color; fwCtx.fill();
      }
      return p;
  }

  function createCircle(x,y) {
      var p = {}; p.x = x; p.y = y; p.color = '#FFF'; p.radius = 0.1; p.alpha = .5; p.lineWidth = 6;
      p.draw = function() {
          fwCtx.globalAlpha = p.alpha; fwCtx.beginPath(); fwCtx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
          fwCtx.lineWidth = p.lineWidth; fwCtx.strokeStyle = p.color; fwCtx.stroke(); fwCtx.globalAlpha = 1;
      }
      return p;
  }

  function renderParticule(anim) {
      for (var i = 0; i < anim.animatables.length; i++) { anim.animatables[i].target.draw(); }
  }

  function triggerFirework(x, y) {
      var circle = createCircle(x, y);
      var particules = [];
      for (var i = 0; i < 30; i++) { particules.push(createParticule(x, y)); }
      anime.timeline().add({
          targets: particules, x: function(p) { return p.endPos.x; }, y: function(p) { return p.endPos.y; },
          radius: 0.1, duration: anime.random(1200, 1800), easing: 'easeOutExpo', update: renderParticule
      }).add({
          targets: circle, radius: anime.random(80, 160), lineWidth: 0,
          alpha: { value: 0, easing: 'linear', duration: anime.random(600, 800) },
          duration: anime.random(1200, 1800), easing: 'easeOutExpo', update: renderParticule, offset: 0
      });
  }
// ══════════════════════ STARS & CONSTELLATIONS (SLIDE 4)
  const starsCanvas = document.getElementById('stars-canvas');
  const starsCtx = starsCanvas.getContext('2d');
  let starsArr = [], dotsArr = [];
  let mouseX = 0, mouseY = 0, mouseMoving = false, mouseMoveTimer;

  function Star(x, y) {
      this.x = x; this.y = y;
      this.r = Math.random() * 2 + 1;
      this.color = "rgba(255,255,255," + (Math.random() * 0.5) + ")";
      this.move = function() {
          this.y -= 0.15; // Slow drift
          if (this.y <= -10) this.y = starsCanvas.height + 10;
          starsCtx.fillStyle = this.color;
          starsCtx.beginPath();
          starsCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
          starsCtx.fill();
      }
  }

  function Dot(x, y) {
      this.x = x; this.y = y;
      this.r = Math.random() * 5 + 1;
      this.speed = 0.5;
      this.a = 0.5; // Opacity
      this.move = function() {
          this.a -= 0.005; // Fade out over time
          if (this.a <= 0) return false;
          starsCtx.fillStyle = "rgba(255,255,255," + this.a + ")";
          starsCtx.beginPath();
          starsCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
          starsCtx.fill();
          return true;
      }
  }

  function drawConnections() {
      for (let i = 0; i < dotsArr.length; i++) {
          for (let j = i + 1; j < dotsArr.length; j++) {
              let dist = Math.sqrt(Math.pow(dotsArr[i].x - dotsArr[j].x, 2) + Math.pow(dotsArr[i].y - dotsArr[j].y, 2));
              if (dist < 150) { // Max distance for constellation lines
                  starsCtx.strokeStyle = "rgba(255,255,255," + (dotsArr[i].a * 0.2) + ")";
                  starsCtx.lineWidth = 1;
                  starsCtx.beginPath();
                  starsCtx.moveTo(dotsArr[i].x, dotsArr[i].y);
                  starsCtx.lineTo(dotsArr[j].x, dotsArr[j].y);
                  starsCtx.stroke();
              }
          }
      }
  }

  function renderStars() {
      if (currentIdx === 3 && document.getElementById('experience').style.display === 'block') {
          starsCtx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);
          
          // Move background stars
          for (let s of starsArr) { s.move(); }

          // Handle interactive dots (constellations)
          if (mouseMoving) {
              dotsArr.push(new Dot(mouseX, mouseY));
              if (dotsArr.length > 50) dotsArr.shift();
          }
          
          drawConnections();
          dotsArr = dotsArr.filter(dot => dot.move());
      }
      requestAnimationFrame(renderStars);
  }

  function initStars() {
      resizeStars();
      window.addEventListener('resize', resizeStars);
      
      // Tracking Mouse for Constellations
      document.addEventListener('mousemove', (e) => {
          if (currentIdx === 3) {
              mouseX = e.clientX;
              mouseY = e.clientY;
              mouseMoving = true;
              clearTimeout(mouseMoveTimer);
              mouseMoveTimer = setTimeout(() => { mouseMoving = false; }, 100);
          }
      });

      for (let i = 0; i < 150; i++) {
          starsArr.push(new Star(Math.random() * starsCanvas.width, Math.random() * starsCanvas.height));
      }
      renderStars();
  }

  function resizeStars() {
      starsCanvas.width = window.innerWidth;
      starsCanvas.height = window.innerHeight;
  }
// ══════════════════════ MECHANICAL GRASS ENGINE (SELF-CONTAINED)
let grassCanvas, grassCtx;
let worms = [];

function initGrass() {
    grassCanvas = document.getElementById("grass-canvas");
    if (!grassCanvas) return;
    grassCtx = grassCanvas.getContext("2d");
    grassCanvas.width = window.innerWidth;
    grassCanvas.height = window.innerHeight;
    renderGrass();
}

function createWorm() {
    // Corruption starts at the bottom and crawls up/sideways
    return {
        x: Math.random() * grassCanvas.width,
        y: grassCanvas.height,
        angle: -Math.PI / 2 + (Math.random() - 0.5),
        segments: 0,
        maxSegments: 40 + Math.random() * 40,
        width: 2 + Math.random() * 3
    };
}

function renderGrass() {
    // Only run if we are on Slide 5
    if (currentIdx === 4 && document.getElementById('experience').style.display === 'block') {
        // Create new corruption "worms" randomly
        if (Math.random() > 0.8) worms.push(createWorm());

        for (let i = 0; i < worms.length; i++) {
            let w = worms[i];
            
            grassCtx.beginPath();
            grassCtx.strokeStyle = "#ff2a2a"; // System Red
            grassCtx.lineWidth = w.width;
            grassCtx.moveTo(w.x, w.y);

            // Calculate next segment position
            w.angle += (Math.random() - 0.5) * 0.5;
            w.x += Math.cos(w.angle) * 8;
            w.y += Math.sin(w.angle) * 8;
            w.width *= 0.98; // Tapers off

            grassCtx.lineTo(w.x, w.y);
            grassCtx.stroke();

            w.segments++;
            if (w.segments > w.maxSegments || w.y < 0) {
                worms.splice(i, 1);
                i--;
            }
        }
    } else {
        // Clear canvas when leaving slide to save performance
        if (grassCtx) grassCtx.clearRect(0, 0, grassCanvas.width, grassCanvas.height);
        worms = [];
    }
    requestAnimationFrame(renderGrass);
}
// ══════════════════════ TYPEWRITER UTILITY
function typeWriter(text, elementId, speed, append = false) {
    let i = 0;
    const el = document.getElementById(elementId);
    if (!el) return; 
    
    // If append is false, clear it. If true, keep existing text.
    if (!append) el.textContent = ''; 
    
    function type() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}
// ══════════════════════ SPIDER PHYSICS ENGINE
!function(e,t,n){function i(n,s){if(!t[n]){if(!e[n]){var o=typeof require=="function"&&require;if(!s&&o)return o(n,!0);if(r)return r(n,!0);throw new Error("Cannot find module '"+n+"'")}var u=t[n]={exports:{}};e[n][0].call(u.exports,function(t){var r=e[n][1][t];return i(r?r:t)},u,u.exports)}return t[n].exports}var r=typeof require=="function"&&require;for(var s=0;s<n.length;s++)i(n[s]);return i}({1:[function(require,module,exports){var VerletJS=require("./verlet");var constraint=require("./constraint");require("./objects");window.Vec2=require("./vec2");window.VerletJS=VerletJS;window.Particle=VerletJS.Particle;window.DistanceConstraint=constraint.DistanceConstraint;window.PinConstraint=constraint.PinConstraint;window.AngleConstraint=constraint.AngleConstraint},{"./verlet":2,"./constraint":3,"./objects":4,"./vec2":5}],3:[function(require,module,exports){exports.DistanceConstraint=DistanceConstraint;exports.PinConstraint=PinConstraint;exports.AngleConstraint=AngleConstraint;function DistanceConstraint(a,b,stiffness,distance){this.a=a;this.b=b;this.distance=typeof distance!="undefined"?distance:a.pos.sub(b.pos).length();this.stiffness=stiffness}DistanceConstraint.prototype.relax=function(stepCoef){var normal=this.a.pos.sub(this.b.pos);var m=normal.length2();normal.mutableScale((this.distance*this.distance-m)/m*this.stiffness*stepCoef);this.a.pos.mutableAdd(normal);this.b.pos.mutableSub(normal)};DistanceConstraint.prototype.draw=function(ctx){ctx.beginPath();ctx.moveTo(this.a.pos.x,this.a.pos.y);ctx.lineTo(this.b.pos.x,this.b.pos.y);ctx.strokeStyle="#d8dde2";ctx.stroke()};function PinConstraint(a,pos){this.a=a;this.pos=(new Vec2).mutableSet(pos)}PinConstraint.prototype.relax=function(stepCoef){this.a.pos.mutableSet(this.pos)};PinConstraint.prototype.draw=function(ctx){ctx.beginPath();ctx.arc(this.pos.x,this.pos.y,6,0,2*Math.PI);ctx.fillStyle="rgba(0,153,255,0.1)";ctx.fill()};function AngleConstraint(a,b,c,stiffness){this.a=a;this.b=b;this.c=c;this.angle=this.b.pos.angle2(this.a.pos,this.c.pos);this.stiffness=stiffness}AngleConstraint.prototype.relax=function(stepCoef){var angle=this.b.pos.angle2(this.a.pos,this.c.pos);var diff=angle-this.angle;if(diff<=-Math.PI)diff+=2*Math.PI;else if(diff>=Math.PI)diff-=2*Math.PI;diff*=stepCoef*this.stiffness;this.a.pos=this.a.pos.rotate(this.b.pos,diff);this.c.pos=this.c.pos.rotate(this.b.pos,-diff);this.b.pos=this.b.pos.rotate(this.a.pos,diff);this.b.pos=this.b.pos.rotate(this.c.pos,-diff)};AngleConstraint.prototype.draw=function(ctx){ctx.beginPath();ctx.moveTo(this.a.pos.x,this.a.pos.y);ctx.lineTo(this.b.pos.x,this.b.pos.y);ctx.lineTo(this.c.pos.x,this.c.pos.y);var tmp=ctx.lineWidth;ctx.lineWidth=5;ctx.strokeStyle="rgba(255,255,0,0.2)";ctx.stroke();ctx.lineWidth=tmp}},{}],5:[function(require,module,exports){module.exports=Vec2;function Vec2(x,y){this.x=x||0;this.y=y||0}Vec2.prototype.add=function(v){return new Vec2(this.x+v.x,this.y+v.y)};Vec2.prototype.sub=function(v){return new Vec2(this.x-v.x,this.y-v.y)};Vec2.prototype.mul=function(v){return new Vec2(this.x*v.x,this.y*v.y)};Vec2.prototype.div=function(v){return new Vec2(this.x/v.x,this.y/v.y)};Vec2.prototype.scale=function(coef){return new Vec2(this.x*coef,this.y*coef)};Vec2.prototype.mutableSet=function(v){this.x=v.x;this.y=v.y;return this};Vec2.prototype.mutableAdd=function(v){this.x+=v.x;this.y+=v.y;return this};Vec2.prototype.mutableSub=function(v){this.x-=v.x;this.y-=v.y;return this};Vec2.prototype.mutableMul=function(v){this.x*=v.x;this.y*=v.y;return this};Vec2.prototype.mutableDiv=function(v){this.x/=v.x;this.y/=v.y;return this};Vec2.prototype.mutableScale=function(coef){this.x*=coef;this.y*=coef;return this};Vec2.prototype.equals=function(v){return this.x==v.x&&this.y==v.y};Vec2.prototype.epsilonEquals=function(v,epsilon){return Math.abs(this.x-v.x)<=epsilon&&Math.abs(this.y-v.y)<=epsilon};Vec2.prototype.length=function(v){return Math.sqrt(this.x*this.x+this.y*this.y)};Vec2.prototype.length2=function(v){return this.x*this.x+this.y*this.y};Vec2.prototype.dist=function(v){return Math.sqrt(this.dist2(v))};Vec2.prototype.dist2=function(v){var x=v.x-this.x;var y=v.y-this.y;return x*x+y*y};Vec2.prototype.normal=function(){var m=Math.sqrt(this.x*this.x+this.y*this.y);return new Vec2(this.x/m,this.y/m)};Vec2.prototype.dot=function(v){return this.x*v.x+this.y*v.y};Vec2.prototype.angle=function(v){return Math.atan2(this.x*v.y-this.y*v.x,this.x*v.x+this.y*v.y)};Vec2.prototype.angle2=function(vLeft,vRight){return vLeft.sub(this).angle(vRight.sub(this))};Vec2.prototype.rotate=function(origin,theta){var x=this.x-origin.x;var y=this.y-origin.y;return new Vec2(x*Math.cos(theta)-y*Math.sin(theta)+origin.x,x*Math.sin(theta)+y*Math.cos(theta)+origin.y)};Vec2.prototype.toString=function(){return"("+this.x+", "+this.y+")"};function test_Vec2(){var assert=function(label,expression){console.log("Vec2("+label+"): "+(expression==true?"PASS":"FAIL"));if(expression!=true)throw"assertion failed"};assert("equality",new Vec2(5,3).equals(new Vec2(5,3)));assert("epsilon equality",new Vec2(1,2).epsilonEquals(new Vec2(1.01,2.02),.03));assert("epsilon non-equality",!new Vec2(1,2).epsilonEquals(new Vec2(1.01,2.02),.01));assert("addition",new Vec2(1,1).add(new Vec2(2,3)).equals(new Vec2(3,4)));assert("subtraction",new Vec2(4,3).sub(new Vec2(2,1)).equals(new Vec2(2,2)));assert("multiply",new Vec2(2,4).mul(new Vec2(2,1)).equals(new Vec2(4,4)));assert("divide",new Vec2(4,2).div(new Vec2(2,2)).equals(new Vec2(2,1)));assert("scale",new Vec2(4,3).scale(2).equals(new Vec2(8,6)));assert("mutable set",new Vec2(1,1).mutableSet(new Vec2(2,3)).equals(new Vec2(2,3)));assert("mutable addition",new Vec2(1,1).mutableAdd(new Vec2(2,3)).equals(new Vec2(3,4)));assert("mutable subtraction",new Vec2(4,3).mutableSub(new Vec2(2,1)).equals(new Vec2(2,2)));assert("mutable multiply",new Vec2(2,4).mutableMul(new Vec2(2,1)).equals(new Vec2(4,4)));assert("mutable divide",new Vec2(4,2).mutableDiv(new Vec2(2,2)).equals(new Vec2(2,1)));assert("mutable scale",new Vec2(4,3).mutableScale(2).equals(new Vec2(8,6)));assert("length",Math.abs(new Vec2(4,4).length()-5.65685)<=1e-5);assert("length2",new Vec2(2,4).length2()==20);assert("dist",Math.abs(new Vec2(2,4).dist(new Vec2(3,5))-1.4142135)<=1e-6);assert("dist2",new Vec2(2,4).dist2(new Vec2(3,5))==2);var normal=new Vec2(2,4).normal();assert("normal",Math.abs(normal.length()-1)<=1e-5&&normal.epsilonEquals(new Vec2(.4472,.89443),1e-4));assert("dot",new Vec2(2,3).dot(new Vec2(4,1))==11);assert("angle",new Vec2(0,-1).angle(new Vec2(1,0))*(180/Math.PI)==90);assert("angle2",new Vec2(1,1).angle2(new Vec2(1,0),new Vec2(2,1))*(180/Math.PI)==90);assert("rotate",new Vec2(2,0).rotate(new Vec2(1,0),Math.PI/2).equals(new Vec2(1,1)));assert("toString",new Vec2(2,4)=="(2, 4)")}},{}],4:[function(require,module,exports){var VerletJS=require("./verlet");var Particle=VerletJS.Particle;var constraints=require("./constraint");var DistanceConstraint=constraints.DistanceConstraint;VerletJS.prototype.point=function(pos){var composite=new this.Composite;composite.particles.push(new Particle(pos));this.composites.push(composite);return composite};VerletJS.prototype.lineSegments=function(vertices,stiffness){var i;var composite=new this.Composite;for(i in vertices){composite.particles.push(new Particle(vertices[i]));if(i>0)composite.constraints.push(new DistanceConstraint(composite.particles[i],composite.particles[i-1],stiffness))}this.composites.push(composite);return composite};VerletJS.prototype.cloth=function(origin,width,height,segments,pinMod,stiffness){var composite=new this.Composite;var xStride=width/segments;var yStride=height/segments;var x,y;for(y=0;y<segments;++y){for(x=0;x<segments;++x){var px=origin.x+x*xStride-width/2+xStride/2;var py=origin.y+y*yStride-height/2+yStride/2;composite.particles.push(new Particle(new Vec2(px,py)));if(x>0)composite.constraints.push(new DistanceConstraint(composite.particles[y*segments+x],composite.particles[y*segments+x-1],stiffness));if(y>0)composite.constraints.push(new DistanceConstraint(composite.particles[y*segments+x],composite.particles[(y-1)*segments+x],stiffness))}}for(x=0;x<segments;++x){if(x%pinMod==0)composite.pin(x)}this.composites.push(composite);return composite};VerletJS.prototype.tire=function(origin,radius,segments,spokeStiffness,treadStiffness){var stride=2*Math.PI/segments;var i;var composite=new this.Composite;for(i=0;i<segments;++i){var theta=i*stride;composite.particles.push(new Particle(new Vec2(origin.x+Math.cos(theta)*radius,origin.y+Math.sin(theta)*radius)))}var center=new Particle(origin);composite.particles.push(center);for(i=0;i<segments;++i){composite.constraints.push(new DistanceConstraint(composite.particles[i],composite.particles[(i+1)%segments],treadStiffness));composite.constraints.push(new DistanceConstraint(composite.particles[i],center,spokeStiffness));composite.constraints.push(new DistanceConstraint(composite.particles[i],composite.particles[(i+5)%segments],treadStiffness))}this.composites.push(composite);return composite}},{"./verlet":2,"./constraint":3}],2:[function(require,module,exports){window.requestAnimFrame=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame||function(callback){window.setTimeout(callback,1e3/60)};var Vec2=require("./vec2");exports=module.exports=VerletJS;exports.Particle=Particle;exports.Composite=Composite;function Particle(pos){this.pos=(new Vec2).mutableSet(pos);this.lastPos=(new Vec2).mutableSet(pos)}Particle.prototype.draw=function(ctx){ctx.beginPath();ctx.arc(this.pos.x,this.pos.y,2,0,2*Math.PI);ctx.fillStyle="#2dad8f";ctx.fill()};function VerletJS(width,height,canvas){this.width=width;this.height=height;this.canvas=canvas;this.ctx=canvas.getContext("2d");this.mouse=new Vec2(0,0);this.mouseDown=false;this.draggedEntity=null;this.selectionRadius=20;this.highlightColor="#4f545c";this.bounds=function(particle){if(particle.pos.y>this.height-1)particle.pos.y=this.height-1;if(particle.pos.x<0)particle.pos.x=0;if(particle.pos.x>this.width-1)particle.pos.x=this.width-1};var _this=this;this.canvas.oncontextmenu=function(e){e.preventDefault()};this.canvas.onmousedown=function(e){_this.mouseDown=true;var nearest=_this.nearestEntity();if(nearest){_this.draggedEntity=nearest}};this.canvas.onmouseup=function(e){_this.mouseDown=false;_this.draggedEntity=null};this.canvas.onmousemove=function(e){var rect=_this.canvas.getBoundingClientRect();_this.mouse.x=e.clientX-rect.left;_this.mouse.y=e.clientY-rect.top};this.gravity=new Vec2(0,.2);this.friction=.99;this.groundFriction=.8;this.composites=[]}VerletJS.prototype.Composite=Composite;function Composite(){this.particles=[];this.constraints=[];this.drawParticles=null;this.drawConstraints=null}Composite.prototype.pin=function(index,pos){pos=pos||this.particles[index].pos;var pc=new PinConstraint(this.particles[index],pos);this.constraints.push(pc);return pc};VerletJS.prototype.frame=function(step){var i,j,c;for(c in this.composites){for(i in this.composites[c].particles){var particles=this.composites[c].particles;var velocity=particles[i].pos.sub(particles[i].lastPos).scale(this.friction);if(particles[i].pos.y>=this.height-1&&velocity.length2()>1e-6){var m=velocity.length();velocity.x/=m;velocity.y/=m;velocity.mutableScale(m*this.groundFriction)}particles[i].lastPos.mutableSet(particles[i].pos);particles[i].pos.mutableAdd(this.gravity);particles[i].pos.mutableAdd(velocity)}}if(this.draggedEntity)this.draggedEntity.pos.mutableSet(this.mouse);var stepCoef=1/step;for(c in this.composites){var constraints=this.composites[c].constraints;for(i=0;i<step;++i)for(j in constraints)constraints[j].relax(stepCoef)}for(c in this.composites){var particles=this.composites[c].particles;for(i in particles)this.bounds(particles[i])}};VerletJS.prototype.draw=function(){var i,c;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);for(c in this.composites){if(this.composites[c].drawConstraints){this.composites[c].drawConstraints(this.ctx,this.composites[c])}else{var constraints=this.composites[c].constraints;for(i in constraints)constraints[i].draw(this.ctx)}if(this.composites[c].drawParticles){this.composites[c].drawParticles(this.ctx,this.composites[c])}else{var particles=this.composites[c].particles;for(i in particles)particles[i].draw(this.ctx)}}var nearest=this.draggedEntity||this.nearestEntity();if(nearest){this.ctx.beginPath();this.ctx.arc(nearest.pos.x,nearest.pos.y,8,0,2*Math.PI);this.ctx.strokeStyle=this.highlightColor;this.ctx.stroke()}};VerletJS.prototype.nearestEntity=function(){var c,i;var d2Nearest=0;var entity=null;var constraintsNearest=null;for(c in this.composites){var particles=this.composites[c].particles;for(i in particles){var d2=particles[i].pos.dist2(this.mouse);if(d2<=this.selectionRadius*this.selectionRadius&&(entity==null||d2<d2Nearest)){entity=particles[i];constraintsNearest=this.composites[c].constraints;d2Nearest=d2}}}for(i in constraintsNearest)if(constraintsNearest[i]instanceof PinConstraint&&constraintsNearest[i].a==entity)entity=constraintsNearest[i];return entity}},{"./vec2":5}]},{},[1]);

function getViewport() {

 var viewPortWidth;
 var viewPortHeight;

 // the more standards compliant browsers (mozilla/netscape/opera/IE7) use window.innerWidth and window.innerHeight
 if (typeof window.innerWidth != 'undefined') {
   viewPortWidth = window.innerWidth,
   viewPortHeight = window.innerHeight
 }

// IE6 in standards compliant mode (i.e. with a valid doctype as the first line in the document)
 else if (typeof document.documentElement != 'undefined'
 && typeof document.documentElement.clientWidth !=
 'undefined' && document.documentElement.clientWidth != 0) {
    viewPortWidth = document.documentElement.clientWidth,
    viewPortHeight = document.documentElement.clientHeight
 }

 // older versions of IE
 else {
   viewPortWidth = document.getElementsByTagName('body')[0].clientWidth,
   viewPortHeight = document.getElementsByTagName('body')[0].clientHeight
 }
 return [viewPortWidth, viewPortHeight];
}

VerletJS.prototype.spider = function(origin) {
		var i;
		var legSeg1Stiffness = 0.99;
		var legSeg2Stiffness = 0.99;
		var legSeg3Stiffness = 0.99;
		var legSeg4Stiffness = 0.99;
		
		var joint1Stiffness = 1;
		var joint2Stiffness = 0.4;
		var joint3Stiffness = 0.9;
		
		var bodyStiffness = 1;
		var bodyJointStiffness = 1;
		
		var composite = new this.Composite();
		composite.legs = [];
		
		
		composite.thorax = new Particle(origin);
		composite.head = new Particle(origin.add(new Vec2(0,-5)));
		composite.abdomen = new Particle(origin.add(new Vec2(0,10)));
		
		composite.particles.push(composite.thorax);
		composite.particles.push(composite.head);
		composite.particles.push(composite.abdomen);
		
		composite.constraints.push(new DistanceConstraint(composite.head, composite.thorax, bodyStiffness));
		
		
		composite.constraints.push(new DistanceConstraint(composite.abdomen, composite.thorax, bodyStiffness));
		composite.constraints.push(new AngleConstraint(composite.abdomen, composite.thorax, composite.head, 0.4));
		
		
		// legs
		for (i=0;i<4;++i) {
			composite.particles.push(new Particle(composite.particles[0].pos.add(new Vec2(3,(i-1.5)*3))));
			composite.particles.push(new Particle(composite.particles[0].pos.add(new Vec2(-3,(i-1.5)*3))));
			
			var len = composite.particles.length;
			
			composite.constraints.push(new DistanceConstraint(composite.particles[len-2], composite.thorax, legSeg1Stiffness));
			composite.constraints.push(new DistanceConstraint(composite.particles[len-1], composite.thorax, legSeg1Stiffness));
			
			
			var lenCoef = 1;
			if (i == 1 || i == 2)
				lenCoef = 0.7;
			else if (i == 3)
				lenCoef = 0.9;
			
			composite.particles.push(new Particle(composite.particles[len-2].pos.add((new Vec2(20,(i-1.5)*30)).normal().mutableScale(20*lenCoef))));
			composite.particles.push(new Particle(composite.particles[len-1].pos.add((new Vec2(-20,(i-1.5)*30)).normal().mutableScale(20*lenCoef))));
			
			len = composite.particles.length;
			composite.constraints.push(new DistanceConstraint(composite.particles[len-4], composite.particles[len-2], legSeg2Stiffness));
			composite.constraints.push(new DistanceConstraint(composite.particles[len-3], composite.particles[len-1], legSeg2Stiffness));
			
			composite.particles.push(new Particle(composite.particles[len-2].pos.add((new Vec2(20,(i-1.5)*50)).normal().mutableScale(20*lenCoef))));
			composite.particles.push(new Particle(composite.particles[len-1].pos.add((new Vec2(-20,(i-1.5)*50)).normal().mutableScale(20*lenCoef))));
			
			len = composite.particles.length;
			composite.constraints.push(new DistanceConstraint(composite.particles[len-4], composite.particles[len-2], legSeg3Stiffness));
			composite.constraints.push(new DistanceConstraint(composite.particles[len-3], composite.particles[len-1], legSeg3Stiffness));
			
			
			var rightFoot = new Particle(composite.particles[len-2].pos.add((new Vec2(20,(i-1.5)*100)).normal().mutableScale(12*lenCoef)));
			var leftFoot = new Particle(composite.particles[len-1].pos.add((new Vec2(-20,(i-1.5)*100)).normal().mutableScale(12*lenCoef)))
			composite.particles.push(rightFoot);
			composite.particles.push(leftFoot);
			
			composite.legs.push(rightFoot);
			composite.legs.push(leftFoot);
			
			len = composite.particles.length;
			composite.constraints.push(new DistanceConstraint(composite.particles[len-4], composite.particles[len-2], legSeg4Stiffness));
			composite.constraints.push(new DistanceConstraint(composite.particles[len-3], composite.particles[len-1], legSeg4Stiffness));
			
			
			composite.constraints.push(new AngleConstraint(composite.particles[len-6], composite.particles[len-4], composite.particles[len-2], joint3Stiffness));
			composite.constraints.push(new AngleConstraint(composite.particles[len-6+1], composite.particles[len-4+1], composite.particles[len-2+1], joint3Stiffness));
			
			composite.constraints.push(new AngleConstraint(composite.particles[len-8], composite.particles[len-6], composite.particles[len-4], joint2Stiffness));
			composite.constraints.push(new AngleConstraint(composite.particles[len-8+1], composite.particles[len-6+1], composite.particles[len-4+1], joint2Stiffness));
			
			composite.constraints.push(new AngleConstraint(composite.particles[0], composite.particles[len-8], composite.particles[len-6], joint1Stiffness));
			composite.constraints.push(new AngleConstraint(composite.particles[0], composite.particles[len-8+1], composite.particles[len-6+1], joint1Stiffness));
			
			composite.constraints.push(new AngleConstraint(composite.particles[1], composite.particles[0], composite.particles[len-8], bodyJointStiffness));
			composite.constraints.push(new AngleConstraint(composite.particles[1], composite.particles[0], composite.particles[len-8+1], bodyJointStiffness));
		}
		
		this.composites.push(composite);
		return composite;
	}
	
	VerletJS.prototype.spiderweb = function(origin, radius, segments, depth) {
		var stiffness = 0.6;
		var tensor = 0.3;
		var stride = (2*Math.PI)/segments;
		var n = segments*depth;
		var radiusStride = radius/n;
		var i, c;

		var composite = new this.Composite();

		// particles
		for (i=0;i<n;++i) {
			var theta = i*stride + Math.cos(i*0.4)*0.05 + Math.cos(i*0.05)*0.2;
			var shrinkingRadius = radius - radiusStride*i + Math.cos(i*0.1)*20;
			
			var offy = Math.cos(theta*2.1)*(radius/depth)*0.2;
			composite.particles.push(new Particle(new Vec2(origin.x + Math.cos(theta)*shrinkingRadius, origin.y + Math.sin(theta)*shrinkingRadius + offy)));
		}
		
		for (i=0;i<segments;i+=4)
			composite.pin(i);

		// constraints
		for (i=0;i<n-1;++i) {
			// neighbor
			composite.constraints.push(new DistanceConstraint(composite.particles[i], composite.particles[i+1], stiffness));
			
			// span rings
			var off = i + segments;
			if (off < n-1)
				composite.constraints.push(new DistanceConstraint(composite.particles[i], composite.particles[off], stiffness));
			else
				composite.constraints.push(new DistanceConstraint(composite.particles[i], composite.particles[n-1], stiffness));
		}
		
		
		composite.constraints.push(new DistanceConstraint(composite.particles[0], composite.particles[segments-1], stiffness));
		
		for (c in composite.constraints)
			composite.constraints[c].distance *= tensor;

		this.composites.push(composite);
		return composite;
	}
	
	//+ Jonas Raoni Soares Silva
	//@ http://jsfromhell.com/array/shuffle [v1.0]
	function shuffle(o) { //v1.0
		for(var j, x, i = o.length; i; j = parseInt(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
		return o;
	}
	
	VerletJS.prototype.crawl = function(leg) {
		
		var stepRadius = 100;
		var minStepRadius = 35;
		
		var spiderweb = this.composites[0];
		var spider = this.composites[1];
		
		var theta = spider.particles[0].pos.angle2(spider.particles[0].pos.add(new Vec2(1,0)), spider.particles[1].pos);

		var boundry1 = (new Vec2(Math.cos(theta), Math.sin(theta)));
		var boundry2 = (new Vec2(Math.cos(theta+Math.PI/2), Math.sin(theta+Math.PI/2)));
		
		
		var flag1 = leg < 4 ? 1 : -1;
		var flag2 = leg%2 == 0 ? 1 : 0;
		
		var paths = [];
		
		var i;
		for (i in spiderweb.particles) {
			if (
				spiderweb.particles[i].pos.sub(spider.particles[0].pos).dot(boundry1)*flag1 >= 0
				&& spiderweb.particles[i].pos.sub(spider.particles[0].pos).dot(boundry2)*flag2 >= 0
			) {
				var d2 = spiderweb.particles[i].pos.dist2(spider.particles[0].pos);
				
				if (!(d2 >= minStepRadius*minStepRadius && d2 <= stepRadius*stepRadius))
					continue;

				var leftFoot = false;
				var j;
				for (j in spider.constraints) {
					var k;
					for (k=0;k<8;++k) {
						if (
							spider.constraints[j] instanceof DistanceConstraint
							&& spider.constraints[j].a == spider.legs[k]
							&& spider.constraints[j].b == spiderweb.particles[i])
						{
							leftFoot = true;
						}
					}
				}
				
				if (!leftFoot)
					paths.push(spiderweb.particles[i]);
			}
		}
		
		for (i in spider.constraints) {
			if (spider.constraints[i] instanceof DistanceConstraint && spider.constraints[i].a == spider.legs[leg]) {
				spider.constraints.splice(i, 1);
				break;
			}
		}
		
		if (paths.length > 0) {
			shuffle(paths);
			spider.constraints.push(new DistanceConstraint(spider.legs[leg], paths[0], 1, 0));
		}
	}
	
	window.onload = function() {
		var canvas = document.getElementById("web");

		// canvas dimensions
		var width = getViewport()[0] - 50;
		var height = getViewport()[1] - 50;

		// retina
		//var dpr = window.devicePixelRatio || 1;
    var dpr = 1;
		canvas.width = width*dpr;
		canvas.height = height*dpr;
		canvas.getContext("2d").scale(dpr, dpr);

		// simulation
		var sim = new VerletJS(width, height, canvas);
		
		// entities
		var spiderweb = sim.spiderweb(new Vec2(width/2,height/2), Math.min(width, height)/2, 20, 7);

		var spider = sim.spider(new Vec2(width/2,-300));    
		
		
		spiderweb.drawParticles = function(ctx, composite) {
			var i;
			for (i in composite.particles) {
				var point = composite.particles[i];
				ctx.beginPath();
				ctx.arc(point.pos.x, point.pos.y, 1.3, 0, 2*Math.PI);
				ctx.fillStyle = "#7AA"; 
        
        //"#" + Math.random().toString(16).slice(2, 8);
        
				ctx.fill();
			}
		}
			
			
		spider.drawConstraints = function(ctx, composite) {
			var i;

			ctx.beginPath();
			ctx.arc(spider.head.pos.x, spider.head.pos.y, 4, 0, 2*Math.PI);
			ctx.fillStyle = getColor(1);
			ctx.fill();
			
			ctx.beginPath();
			ctx.arc(spider.thorax.pos.x, spider.thorax.pos.y, 4, 0, 2*Math.PI);
			ctx.fill();
			
			ctx.beginPath();
			ctx.arc(spider.abdomen.pos.x, spider.abdomen.pos.y, 8, 0, 2*Math.PI);
			ctx.fill();
			
			for (i=3;i<composite.constraints.length;++i) {
				var constraint = composite.constraints[i];
				if (constraint instanceof DistanceConstraint) {
					ctx.beginPath();
					ctx.moveTo(constraint.a.pos.x, constraint.a.pos.y);
					ctx.lineTo(constraint.b.pos.x, constraint.b.pos.y);
					
					// draw legs
					if (
						(i >= 2 && i <= 4)
						|| (i >= (2*9)+1 && i <= (2*9)+2)
						|| (i >= (2*17)+1 && i <= (2*17)+2)
						|| (i >= (2*25)+1 && i <= (2*25)+2)
					) {
						ctx.save();
						constraint.draw(ctx);
						ctx.strokeStyle = getColor(2);
						ctx.lineWidth = 3;
						ctx.stroke();
						ctx.restore();
					} else if (
						(i >= 4 && i <= 6)
						|| (i >= (2*9)+3 && i <= (2*9)+4)
						|| (i >= (2*17)+3 && i <= (2*17)+4)
						|| (i >= (2*25)+3 && i <= (2*25)+4)
					) {
						ctx.save();
						constraint.draw(ctx);
						ctx.strokeStyle = getColor(3);
						ctx.lineWidth = 2;
						ctx.stroke();
						ctx.restore();
					} else if (
						(i >= 6 && i <= 8)
						|| (i >= (2*9)+5 && i <= (2*9)+6)
						|| (i >= (2*17)+5 && i <= (2*17)+6)
						|| (i >= (2*25)+5 && i <= (2*25)+6)
					) {
						ctx.save();
						ctx.strokeStyle = getColor(4);
						ctx.lineWidth = 1.5;
						ctx.stroke();
						ctx.restore();
					} else {
						ctx.strokeStyle = getColor(5);
						ctx.stroke();
					}
				}
			}
		}
		
		spider.drawParticles = function(ctx, composite) {
		}
		
		// animation loop
		var legIndex = 0;
		var loop = function() {
        ti++;
        
			if (Math.floor(Math.random()*4) == 0) {
				sim.crawl(((legIndex++)*3)%8);
			}
			
			sim.frame(16);
			sim.draw();
			if (currentIdx === 5 && document.getElementById('experience').style.display === 'block') {
        requestAnimFrame(loop);
    } else {
        // Keeps checking, but doesn't calculate physics until you arrive on Slide 6
        setTimeout(() => requestAnimFrame(loop), 100); 
    }
		};

		loop();
	};
  
  var ti = 0;
  var tc = [
    ["#661111","#661111","#4D1A1A","#332222","#1A2B2B"], //red
    ["#663311","#663311","#4D2A1A","#333022","#1A1A2B"], //orange
    ["#666611","#666611","#4D4D1A","#333322","#1A1A2B"], //yellow
    ["#116611","#116611","#1A4D1A","#223322","#2B1A2B"], //green
    ["#111166","#111166","#1A1A4D","#222233","#2B2B1A"], //blue
    ["#661166","#661166","#4D1A4D","#332233","#1A2B1A"], //purple
    ["#111166","#111166","#1A1A4D","#222233","#2B2B1A"], //blue
    ["#116611","#116611","#1A4D1A","#223322","#2B1A2B"], //green
    ["#666611","#666611","#4D4D1A","#333322","#1A1A2B"], //yellow
    ["#663311","#663311","#4D2A1A","#333022","#1A1A2B"], //orange
    ["#661111","#661111","#4D1A1A","#332222","#1A2B2B"] //red
  ];
  
  function getColor(part) {
    var col = "#661111";
    
    if (ti >= 999) {
      ti = 0;
    }
    
    var ts = Math.floor(ti/100);
    var ta = 200 - ((ti%100) * 2);
    
  switch (part) {
    case 1: col = shadeColor(tc[ts][0], ta); break;
    case 2: col = shadeColor(tc[ts][1], ta); break;
    case 3: col = shadeColor(tc[ts][2], ta); break;
    case 4: col = shadeColor(tc[ts][3], ta); break;
    case 5: col = shadeColor(tc[ts][4], ta); break;
  }
  return col;
}

function shadeColor(color, shade) {
    var colorInt = parseInt(color.substring(1),16);

    var R = (colorInt & 0xFF0000) >> 16;
    var G = (colorInt & 0x00FF00) >> 8;
    var B = (colorInt & 0x0000FF) >> 0;

    R = R + Math.floor((shade/255)*R);
    G = G + Math.floor((shade/255)*G);
    B = B + Math.floor((shade/255)*B);

    var newColorInt = (R<<16) + (G<<8) + (B);
    var newColorStr = "#"+newColorInt.toString(16);

    return newColorStr;
}
// ══════════════════════ CROWD SIMULATOR ENGINE
const crowdConfig = {
  src: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/175711/open-peeps-sheet.png',
  rows: 15,
  cols: 7 
};
const randRange = (min, max) => min + Math.random() * (max - min);
const randIndex = array => randRange(0, array.length) | 0;

const resetPeep = ({ stage, peep }) => {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const offsetY = 100 - 250 * gsap.parseEase('power2.in')(Math.random());
  const startY = stage.height - peep.height + offsetY;
  let startX, endX;

  if (direction === 1) {
    startX = -peep.width;
    endX = stage.width;
    peep.scaleX = 1;
  } else {
    startX = stage.width + peep.width;
    endX = 0;
    peep.scaleX = -1;
  }

  peep.x = startX;
  peep.y = startY;
  peep.anchorY = startY;
  return { startX, startY, endX };
};

const normalWalk = ({ peep, props }) => {
  const { startX, startY, endX } = props;
  const xDuration = 10;
  const yDuration = 0.25;

  const tl = gsap.timeline();
  tl.timeScale(randRange(0.5, 1.5));
  tl.to(peep, { duration: xDuration, x: endX, ease: 'none' }, 0);
  tl.to(peep, { duration: yDuration, repeat: xDuration / yDuration, yoyo: true, y: startY - 10 }, 0);
  return tl;
};

class Peep {
  constructor({ image, rect }) {
    this.image = image;
    this.rect = rect;
    this.width = rect[2];
    this.height = rect[3];
    this.drawArgs = [this.image, ...rect, 0, 0, this.width, this.height];
    this.x = 0; this.y = 0; this.anchorY = 0; this.scaleX = 1; this.walk = null;
  }
  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scaleX, 1);
    ctx.drawImage(...this.drawArgs);
    ctx.restore();
  }
}

let crowdImg, crowdCanvas, crowdCtx;
const crowdStage = { width: 0, height: 0 };
const allPeeps = [], availablePeeps = [], crowd = [];

function initCrowdSim() {
  crowdImg = document.createElement('img');
  crowdImg.onload = setupCrowd;
  crowdImg.src = crowdConfig.src;
  crowdCanvas = document.querySelector('#crowd-canvas');
  if(!crowdCanvas) return;
  crowdCtx = crowdCanvas.getContext('2d');
}

function setupCrowd() {
  const { rows, cols } = crowdConfig;
  const { naturalWidth: width, naturalHeight: height } = crowdImg;
  const total = rows * cols;
  const rectWidth = width / rows;
  const rectHeight = height / cols;

  for (let i = 0; i < total; i++) {
    allPeeps.push(new Peep({ image: crowdImg, rect: [ i % rows * rectWidth, (i / rows | 0) * rectHeight, rectWidth, rectHeight] }));
  }
  resizeCrowd();
  gsap.ticker.add(renderCrowd);
  window.addEventListener('resize', resizeCrowd);
}

function resizeCrowd() {
  if(!crowdCanvas) return;
  crowdStage.width = crowdCanvas.clientWidth;
  crowdStage.height = crowdCanvas.clientHeight;
  crowdCanvas.width = crowdStage.width * devicePixelRatio;
  crowdCanvas.height = crowdStage.height * devicePixelRatio;

  crowd.forEach(peep => { peep.walk.kill(); });
  crowd.length = 0;
  availablePeeps.length = 0;
  availablePeeps.push(...allPeeps);
  
  while (availablePeeps.length) {
    addPeepToCrowd().walk.progress(Math.random());
  }
}

function addPeepToCrowd() {
  const peep = availablePeeps.splice(randIndex(availablePeeps), 1)[0];
  const walk = normalWalk({
    peep, props: resetPeep({ peep, stage: crowdStage }) 
  }).eventCallback('onComplete', () => {
    crowd.splice(crowd.indexOf(peep), 1);
    availablePeeps.push(peep);
    addPeepToCrowd();
  });
  peep.walk = walk;
  crowd.push(peep);
  crowd.sort((a, b) => a.anchorY - b.anchorY);
  return peep;
}

function renderCrowd() {
  // Only render if we are on Slide 7
  if (currentIdx !== 6) return;
  crowdCanvas.width = crowdCanvas.width;
  crowdCtx.save();
  crowdCtx.scale(devicePixelRatio, devicePixelRatio);
  crowd.forEach(peep => { peep.render(crowdCtx); });
  crowdCtx.restore();
}

// Auto-start if userId was supplied via URL param — skip the picker
if (wrappedUserId) startSimulation();

