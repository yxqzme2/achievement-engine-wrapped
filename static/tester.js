const $ = id => document.getElementById(id);

const CATEGORY_HINTS = {
    milestone_books: `Trigger must contain a <code>number</code>. The first integer found is the target.<br>Examples: <code>Finish 10 books total.</code> &middot; <code>Finish 50 books total.</code>`,
    milestone_series: `Trigger must contain a <code>number</code>. The first integer found is the target.<br>Examples: <code>Finish 5 complete series.</code> &middot; <code>Finish 25 complete series.</code>`,
    milestone_time: `Trigger must contain <code>&lt;number&gt; hour</code>. Commas OK.<br>Examples: <code>Reach 100 hours of total listening time.</code> &middot; <code>Reach 1,000 hours of total listening time.</code>`,
    milestone_yearly: `Trigger must contain both <code>books</code> and <code>year</code>, plus a number.<br>Example: <code>Finish 100 books in a single calendar year</code>`,
    series_complete: `Trigger format: <code>Complete all books in &lt;Series Name&gt;</code><br>The series name must match a series in your Audiobookshelf library.`,
    series_shape: `Recognized keywords: <code>exactly 2</code> (duology), <code>trilogy</code> (3 books), <code>10+ books</code> or <code>more than 10</code>, <code>first book of</code> + number.<br>Examples: <code>Finish a complete trilogy.</code> &middot; <code>Read the first book of 5 different series</code>`,
    duration: `Trigger must contain <code>over</code>/<code>under</code> (or <code>&gt;=</code>/<code>&lt;=</code>) + <code>&lt;number&gt; hour</code>. Optional book count.<br>Examples: <code>Finish a book that is over 50 hours long.</code> &middot; <code>Finish 5 books that are under 3 hours long.</code>`,
    author: `Recognized phrases: <code>books by the same author</code>, <code>complete series by the same author</code>, <code>different authors</code> / <code>distinct authors</code>, <code>narrated by the author</code>.<br>Each needs a number (except self-narrated).`,
    narrator: `Trigger must contain a <code>number</code>. Evaluator counts books per narrator.<br>Example: <code>Finish 10 books by the same narrator</code>`,
    title_keyword: `Trigger format: <code>Finish a book with &lt;keywords&gt; in the title</code>. Separate multiple keywords with <code>OR</code> or commas.<br>Or use the Keywords field below instead.<br>Example: <code>Finish a book with mage OR wizard OR sorcerer in the title</code>`,
    social: `Two patterns: <code>same book</code> + <code>same week</code> (shared experience), or any other trigger (overlap with all users).<br>Requires multiple tracked users.`,
    behavior_time: `Only two patterns currently work:<br><code>...2:00 AM...</code> (weeknight late session) and <code>...before 6:00 AM...</code> (early morning).<br>New time patterns require code changes.`,
    behavior_session: `Recognized phrases: <code>single listening session</code> + hours, <code>over a single weekend</code> + hours, <code>finish a book in a single day</code>, <code>20+ hours</code> + <code>7 days</code> (speed reader).`,
    behavior_streak: `Recognized patterns: <code>consecutive</code> or <code>streak</code> + days, <code>distinct days</code> + <code>month</code>, <code>hours</code> + <code>month</code>.<br>Examples: <code>Listen on 7 consecutive days</code> &middot; <code>Listen on 20 distinct days in a single month</code> &middot; <code>Listen 100 hours in a single month</code>`,
    meta: `Trigger must contain both <code>earn</code> and <code>achievement</code>, plus a number.<br>Example: <code>Earn 50 other achievements</code>`,
};

function extractInt(s) {
    const m = (s || "").replace(/,/g, "").match(/(\d+)/);
    return m ? parseInt(m[1]) : -1;
}

function buildJson() {
    const obj = {};
    const id = $("f-id").value.trim();
    const category = $("f-category").value;
    const title = $("f-title").value.trim();
    const achievement = $("f-achievement").value.trim();
    const trigger = $("f-trigger").value.trim();
    const flavor = $("f-flavor").value.trim();
    const points = parseInt($("f-points").value) || 0;
    const rarity = $("f-rarity").value;
    const icon = $("f-icon").value.trim();
    const keywords = $("f-keywords").value.trim();

    if (id) obj.id = id;
    if (category) obj.category = category;
    if (title) obj.title = title;
    if (achievement) obj.achievement = achievement;
    if (trigger) obj.trigger = trigger;
    if (flavor) obj.flavorText = flavor;
    obj.points = points;
    if (rarity) obj.rarity = rarity;
    if (icon) obj.iconPath = icon;
    if (keywords) {
        obj.keywords_any = keywords.split(",").map(s => s.trim()).filter(Boolean);
    }
    return obj;
}

function renderJson() {
    const obj = buildJson();
    const jsonDiv = $("json-out");
    jsonDiv.classList.remove("hidden");

    const raw = JSON.stringify(obj, null, 2);
    const highlighted = raw
        .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
        .replace(/: "([^"]*)"/g, ': <span class="json-str">"$1"</span>')
        .replace(/: (\d+)/g, ': <span class="json-num">$1</span>');

    jsonDiv.innerHTML = `<div class="json-preview">${highlighted}</div>`;
}

function validate() {
    const id = $("f-id").value.trim();
    const category = $("f-category").value;
    const title = $("f-title").value.trim();
    const trigger = $("f-trigger").value.trim();
    const flavor = $("f-flavor").value.trim();
    const points = parseInt($("f-points").value) || 0;
    const rarity = $("f-rarity").value;
    const icon = $("f-icon").value.trim();
    const keywords = $("f-keywords").value.trim();

    const checks = [];
    let hasError = false;
    let hasWarn = false;

    function pass(msg) { checks.push({ type: "ok", msg }); }
    function fail(msg) { checks.push({ type: "fail", msg }); hasError = true; }
    function warn(msg) { checks.push({ type: "warn", msg }); hasWarn = true; }
    function info(msg) { checks.push({ type: "info", msg }); }

    // --- Basic field validation ---
    if (!id) fail("ID is required.");
    else if (/[^a-z0-9_]/.test(id)) warn("ID should be snake_case (lowercase, underscores). Found other characters.");
    else pass(`ID: <code>${id}</code>`);

    if (!category) fail("Category is required. Select one from the dropdown.");
    else pass(`Category: <code>${category}</code>`);

    if (!title) fail("Title is required.");
    else pass(`Title: "${title}"`);

    if (!trigger) fail("Trigger is required.");
    else pass(`Trigger: "${trigger}"`);

    if (points <= 0) warn("Points is 0 or empty. Achievement won't contribute to leaderboard.");
    else pass(`Points: ${points}`);

    if (!icon) warn("No icon path set. Achievement will display without an icon.");

    if (!flavor) warn("No flavor text. Notifications will have no description.");

    // --- Category-specific trigger validation ---
    if (category && trigger) {
        const trig = trigger.toLowerCase();
        const num = extractInt(trigger);

        switch (category) {
            case "milestone_books": {
                if (num <= 0) fail("Trigger must contain a positive integer (target book count).");
                else {
                    pass(`Extracted target: finish ${num} books.`);
                    info("Evaluator will award when user's total finished books >= " + num + ".");
                }
                break;
            }
            case "milestone_series": {
                if (num <= 0) fail("Trigger must contain a positive integer (target series count).");
                else {
                    pass(`Extracted target: complete ${num} series.`);
                    info("Evaluator will award when user's total completed series >= " + num + ".");
                }
                break;
            }
            case "milestone_time": {
                const hm = trig.replace(/,/g, "").match(/(\d+)\s*hour/);
                if (!hm) fail('Trigger must contain "&lt;number&gt; hour" (e.g., "100 hours").');
                else {
                    const h = parseInt(hm[1]);
                    pass(`Extracted target: ${h} listening hours.`);
                    info("Evaluator walks through sessions chronologically to backdate.");
                }
                break;
            }
            case "milestone_yearly": {
                if (!trig.includes("book")) fail('Trigger must contain the word "books".');
                else if (!trig.includes("year")) fail('Trigger must contain the word "year".');
                else if (num <= 0) fail("Trigger must contain a positive integer (target count).");
                else {
                    pass(`Extracted target: ${num} books in a calendar year.`);
                    info("Checks all calendar years for qualifying counts.");
                }
                break;
            }
            case "series_complete": {
                const m = trigger.match(/(?:complete|finish)\s+all\s+books\s+in\s+(.+)$/i);
                if (!m) {
                    warn('Trigger should follow: "Complete all books in &lt;Series Name&gt;". Will fall back to using the title field as series name.');
                    if (title) info(`Fallback series name: "${title}"`);
                    else fail("Neither trigger pattern nor title provides a series name.");
                } else {
                    pass(`Extracted series name: "${m[1].trim()}"`);
                    info("Series must exist in your Audiobookshelf library. Name matching is case-insensitive, substring as fallback.");
                }
                break;
            }
            case "series_shape": {
                let matched = false;
                if (trig.includes("exactly 2")) { pass('Detected pattern: duology (exactly 2 books).'); matched = true; }
                if (trig.includes("trilogy")) { pass("Detected pattern: trilogy (exactly 3 books)."); matched = true; }
                if (trig.includes("10+") || trig.includes("more than 10")) { pass("Detected pattern: long series (10+ books)."); matched = true; }
                if (trig.includes("first book of")) {
                    const n = extractInt(trig) || 5;
                    pass(`Detected pattern: first book of ${n} different series.`);
                    matched = true;
                }
                if (!matched) fail('Trigger must contain one of: "exactly 2", "trilogy", "10+ books", "more than 10", or "first book of".');
                break;
            }
            case "duration": {
                const hasOp = trig.includes("over") || trig.includes("under") || trig.includes(">=") || trig.includes("<=") || trig.includes("longer than") || trig.includes("shorter than");
                const hm = trig.match(/(\d+(?:\.\d+)?)\s*hour/);
                if (!hasOp) fail('Trigger must contain "over", "under", "longer than", "shorter than", ">=", or "<=".');
                else if (!hm) fail('Trigger must contain "&lt;number&gt; hour".');
                else {
                    const mode = (trig.includes("over") || trig.includes(">=") || trig.includes("longer than")) ? "over" : "under";
                    const hours = parseFloat(hm[1]);
                    const countMatch = trig.match(/(\d+)\s+book/);
                    const count = countMatch ? parseInt(countMatch[1]) : 1;
                    pass(`Detected: ${count} book(s) ${mode} ${hours} hours.`);
                    info(`Evaluator checks finished books with audio duration ${mode === "over" ? ">=" : "<="} ${hours} hours.`);
                }
                break;
            }
            case "author": {
                let matched = false;
                if (trig.includes("narrated by the author")) {
                    pass("Detected pattern: self-narrated book.");
                    info("Awards when any finished book has an overlapping author and narrator name.");
                    matched = true;
                }
                if (trig.includes("different authors") || trig.includes("distinct authors")) {
                    if (num <= 0) fail("Need a number for distinct author count.");
                    else pass(`Detected pattern: ${num} distinct authors.`);
                    matched = true;
                }
                if (trig.includes("complete series by the same author")) {
                    if (num <= 0) fail("Need a number for series-by-author count.");
                    else pass(`Detected pattern: ${num} complete series by one author.`);
                    matched = true;
                }
                if (trig.includes("books by the same author")) {
                    if (num <= 0) fail("Need a number for books-by-author count.");
                    else pass(`Detected pattern: ${num} books by one author.`);
                    matched = true;
                }
                if (!matched) fail('Trigger must contain one of: "books by the same author", "complete series by the same author", "different authors", "distinct authors", or "narrated by the author".');
                break;
            }
            case "narrator": {
                if (num <= 0) fail("Trigger must contain a positive integer (book count threshold per narrator).");
                else {
                    pass(`Extracted target: ${num} books by same narrator.`);
                    info("Evaluator finds the narrator with the most finished books and checks against threshold.");
                }
                break;
            }
            case "title_keyword": {
                let kws = [];
                if (keywords) {
                    kws = keywords.split(",").map(s => s.trim()).filter(Boolean);
                } else {
                    const m = trig.match(/with\s+(.+?)\s+in the title/i);
                    if (m) {
                        kws = m[1].replace(/['"]/g, "").replace(/\s+or\s+/gi, ",").split(",").map(s => s.trim()).filter(Boolean);
                    }
                }
                if (kws.length === 0) {
                    fail('No keywords found. Either fill in the Keywords field, or use trigger format: "Finish a book with &lt;X&gt; OR &lt;Y&gt; in the title".');
                } else {
                    pass(`Keywords to match: ${kws.map(k => '"' + k + '"').join(", ")}`);
                    info("Uses word-boundary regex matching on title + subtitle. Case-insensitive.");
                }
                break;
            }
            case "social": {
                if (trig.includes("same book") && trig.includes("same week")) {
                    pass('Detected pattern: "Shared Experience" (same book, same week).');
                    info("Checks if two users finished the same book within 7 days of each other.");
                } else {
                    pass("Detected pattern: overlap with all users.");
                    info("Awards when user shares at least 1 finished book with every other tracked user.");
                }
                warn("Social achievements require multiple tracked users to function.");
                break;
            }
            case "behavior_time": {
                let matched = false;
                if (trig.includes("2:00 am")) {
                    pass("Detected pattern: late-night listening (2-5 AM ET, weekdays).");
                    matched = true;
                }
                if (trig.includes("before 6:00 am")) {
                    pass("Detected pattern: early morning listening (before 6 AM ET).");
                    matched = true;
                }
                if (!matched) {
                    fail('Only two patterns work: "2:00 AM" (weeknight) and "before 6:00 AM" (early bird). New time patterns require code changes.');
                }
                break;
            }
            case "behavior_session": {
                let matched = false;
                if (trig.includes("single listening session")) {
                    const h = extractInt(trig);
                    if (h <= 0) fail("Need a number of hours for session duration.");
                    else pass(`Detected pattern: single session >= ${h} hours.`);
                    matched = true;
                }
                if (trig.includes("over a single weekend")) {
                    const h = extractInt(trig);
                    if (h <= 0) fail("Need a number of hours for weekend total.");
                    else pass(`Detected pattern: weekend marathon >= ${h} hours.`);
                    matched = true;
                }
                if (trig.includes("finish a book in a single day")) {
                    pass("Detected pattern: finish book in one day.");
                    matched = true;
                }
                if (trig.includes("20+") && trig.includes("7 days")) {
                    pass("Detected pattern: speed reader (20+ hour book in under 7 days).");
                    matched = true;
                }
                if (!matched) fail('Trigger must contain: "single listening session" + hours, "over a single weekend" + hours, "finish a book in a single day", or "20+ hours" + "7 days".');
                break;
            }
            case "behavior_streak": {
                let matched = false;
                if (trig.includes("consecutive") || trig.includes("streak")) {
                    if (num <= 0) fail("Need a number of days for streak target.");
                    else pass(`Detected pattern: ${num}-day listening streak.`);
                    matched = true;
                }
                if (trig.includes("distinct days") && trig.includes("month")) {
                    if (num <= 0) fail("Need a number of days for monthly frequency.");
                    else pass(`Detected pattern: ${num} distinct listening days in a month.`);
                    matched = true;
                }
                if (trig.includes("hour") && trig.includes("month") && !trig.includes("distinct")) {
                    if (num <= 0) fail("Need a number of hours for monthly target.");
                    else pass(`Detected pattern: ${num} hours in a single month.`);
                    matched = true;
                }
                if (!matched) fail('Trigger must contain: "consecutive"/"streak" + days, "distinct days" + "month", or "hours" + "month".');
                break;
            }
            case "meta": {
                if (!trig.includes("earn")) fail('Trigger must contain the word "earn".');
                else if (!trig.includes("achievement")) fail('Trigger must contain the word "achievement".');
                else if (num <= 0) fail("Trigger must contain a positive integer (achievement count).");
                else {
                    pass(`Extracted target: earn ${num} achievements.`);
                    info("Counts all achievements in the database for the user. Not backdated.");
                }
                break;
            }
        }
    }

    // --- Render results ---
    const resultsDiv = $("results");
    resultsDiv.classList.remove("hidden");

    const overallClass = hasError ? "fail" : hasWarn ? "warn" : "pass";
    const overallIcon = hasError ? "&#10008;" : hasWarn ? "&#9888;" : "&#10004;";
    const overallText = hasError ? "Will NOT work — issues found" : hasWarn ? "Will work, but has warnings" : "Valid — this achievement will work";

    let checksHtml = checks.map(c => {
        const icon = c.type === "ok" ? "&#10004;" : c.type === "fail" ? "&#10008;" : c.type === "warn" ? "&#9888;" : "&#8505;";
        return `<div class="check-item check-${c.type}"><span class="check-icon">${icon}</span><span>${c.msg}</span></div>`;
    }).join("");

    const DEFAULT_ICON = "https://static.wikia.nocookie.net/wowpedia/images/f/f3/Ui-achievement-levelup.png";

    let previewHtml = "";
    if (!hasError) {
        const obj = buildJson();
        const rawIcon = obj.iconPath || "";
        const iconSrc = rawIcon
            ? (rawIcon.startsWith("/") ? rawIcon : "/" + rawIcon)
            : DEFAULT_ICON;
        const achName = obj.achievement || obj.title || obj.id || "Untitled";
        const subtitle = obj.flavorText || obj.title || "";

        previewHtml = `
            <div class="ach-preview-section">
                <h3>Email Preview</h3>
                <table cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#2b251d 0%,#1a1612 100%);border:2px solid #635034;padding:12px;border-radius:4px;width:100%;max-width:540px;font-family:'Palatino Linotype','Book Antiqua',Palatino,serif;">
                    <tr>
                        <td style="width:64px;height:64px;min-width:64px;background:#000;border:2px solid #a38652;vertical-align:middle;">
                            <img src="${iconSrc}" onerror="this.onerror=null;this.src='${DEFAULT_ICON}'" alt="Icon" style="width:58px;height:58px;display:block;margin:auto;">
                        </td>
                        <td style="padding-left:20px;vertical-align:middle;">
                            <div style="color:#f7d16d;font-size:19px;font-weight:bold;text-shadow:1px 1px 2px #000;">${achName}</div>
                            <div style="color:#d1d1d1;font-size:13px;font-style:italic;margin-top:4px;">${subtitle}</div>
                        </td>
                        <td style="width:80px;text-align:center;vertical-align:middle;">
                            <div style="width:54px;height:54px;background:#1a1612;border-radius:50%;border:1px solid #635034;display:flex;align-items:center;justify-content:center;margin:auto;">
                                <span style="color:#cd7f32;font-weight:bold;font-size:22px;text-shadow:1px 1px 2px #000;">${obj.points || 0}</span>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>`;

        const saveBtn = $("btn-save");
        saveBtn.classList.remove("hidden");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save to JSON";
        saveBtn.style.background = "";
        saveBtn.style.color = "";
    } else {
        $("btn-save").classList.add("hidden");
    }

    resultsDiv.innerHTML = `
        <div class="result-header ${overallClass}">${overallIcon} ${overallText}</div>
        <div class="result-body">
            <div class="result-section">
                <h3>Validation Checks</h3>
                ${checksHtml}
            </div>
            ${previewHtml}
        </div>
    `;

    renderJson();
}

function copyJson() {
    const obj = buildJson();
    const text = JSON.stringify(obj, null, 2);
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelectorAll(".btn-secondary")[0];
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = orig, 1500);
    });
    renderJson();
}

function clearForm() {
    ["f-id","f-title","f-achievement","f-trigger","f-flavor","f-points","f-icon","f-keywords"].forEach(id => $(id).value = "");
    $("f-category").value = "";
    $("f-rarity").value = "Common";
    $("results").classList.add("hidden");
    $("json-out").classList.add("hidden");
    $("cat-hint").classList.add("hidden");
    const saveBtn = $("btn-save");
    saveBtn.classList.add("hidden");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save to JSON";
    saveBtn.style.background = "";
    saveBtn.style.color = "";
}

async function saveAchievement() {
    const obj = buildJson();
    const btn = $("btn-save");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
        const resp = await fetch("/api/achievements/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(obj)
        });

        if (resp.ok) {
            btn.textContent = "Saved!";
            btn.style.background = "linear-gradient(180deg, #1a4a1a, #0a2a0a)";
            btn.style.color = "#7fff7f";
        } else {
            const err = await resp.json().catch(() => ({}));
            btn.textContent = "Error: " + (err.detail || resp.statusText);
            btn.disabled = false;
        }
    } catch (e) {
        btn.textContent = "Network error";
        btn.disabled = false;
    }
}

// Global exposure
window.validate = validate;
window.copyJson = copyJson;
window.clearForm = clearForm;
window.saveAchievement = saveAchievement;

document.addEventListener('DOMContentLoaded', () => {
    $("f-category").addEventListener("change", () => {
        const cat = $("f-category").value;
        const hint = $("cat-hint");
        if (cat && CATEGORY_HINTS[cat]) {
            hint.innerHTML = CATEGORY_HINTS[cat];
            hint.classList.remove("hidden");
        } else {
            hint.classList.add("hidden");
        }
    });
});
