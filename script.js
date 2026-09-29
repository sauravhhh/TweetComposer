/* ================= TweetComposer ================= */
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const CIRC = 62.83; // 2*pi*10 for the char ring
const MAX_TWEET = 280;
const MAX_MEDIA = 4;
const MAX_FILE = 5 * 1024 * 1024;

const EMOJIS = ['😀','😂','🤣','😊','😍','😎','🤔','😭','😡','👍','👏','🙏','🔥','✨','🎉','💯','❤️','💔','👀','💡','🚀','⭐','✅','❌','⚠️','📌','🎯','💪','🤝','👋','🍀','🌙','☀️','🌧️','🏠','💼','📚','🎵'];

/* ---------- state ---------- */
let state = {
    profile: { name: 'Your Name', handle: 'username', avatar: null, verified: false },
    tweets: [ newTweet() ],
    numbering: true
};
let lastFocusedTA = null;
let autosaveTimer = null;
let toastTimer = null;

function newTweet(text) {
    return {
        id: 't' + Date.now() + Math.floor(Math.random() * 1e6),
        text: text || '',
        media: [], // {kind:'image'|'video', data, name, size}
        poll: { enabled: false, options: ['', ''], days: 1 }
    };
}

/* ---------- helpers ---------- */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function linkify(text) {
    let e = esc(text);
    e = e.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    e = e.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, '$1<a href="#" onclick="return false">#$2</a>');
    e = e.replace(/(^|\s)@([\p{L}\p{N}_]{1,15})/gu, '$1<a href="#" onclick="return false">@$2</a>');
    return e;
}
function fmtNum(n) {
    n = parseInt(n, 10) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
    return String(n);
}
function fmtSize(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(1).replace('.0', '') + ' ' + u[i];
}
function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function numberedText(tweet, idx, total) {
    let t = tweet.text;
    if (state.numbering && total > 1) t += ' ' + (idx + 1) + '/' + total;
    return t;
}

/* ---------- theme ---------- */
function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('tc-theme', t); } catch (e) {}
    $('#theme-btn').innerHTML = t === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

/* ---------- tabs ---------- */
function switchTab(name) {
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    hideEmojiPicker();
    if (name === 'preview') renderPreview();
    if (name === 'drafts') loadDrafts();
}

/* ---------- profile ---------- */
function renderProfile() {
    const p = state.profile;
    const av = $('#profile-avatar');
    av.innerHTML = p.avatar
        ? '<img src="' + p.avatar + '" alt="avatar">'
        : esc((p.name || 'U').trim().charAt(0).toUpperCase() || 'U');
    $('#profile-name').textContent = p.name || 'Your Name';
    $('#profile-handle').textContent = '@' + (p.handle || 'username').replace(/^@+/, '');
    $('#verified-badge').hidden = !p.verified;
}
function openProfileModal() {
    $('#pf-name').value = state.profile.name === 'Your Name' ? '' : state.profile.name;
    $('#pf-handle').value = state.profile.handle === 'username' ? '' : state.profile.handle;
    $('#pf-verified').checked = state.profile.verified;
    $('#pf-avatar').value = '';
    $('#profile-modal').hidden = false;
}
function saveProfileModal() {
    const name = $('#pf-name').value.trim();
    const handle = $('#pf-handle').value.trim().replace(/^@+/, '');
    if (name) state.profile.name = name;
    if (handle) state.profile.handle = handle;
    state.profile.verified = $('#pf-verified').checked;
    const f = $('#pf-avatar').files[0];
    const done = () => { $('#profile-modal').hidden = true; renderProfile(); scheduleAutosave(); showToast('Profile updated'); };
    if (f && f.type.startsWith('image/')) {
        const r = new FileReader();
        r.onload = e => { state.profile.avatar = e.target.result; done(); };
        r.readAsDataURL(f);
    } else done();
}

/* ---------- thread rendering ---------- */
function tweetById(id) { return state.tweets.find(t => t.id === id); }
function tweetIndex(id) { return state.tweets.findIndex(t => t.id === id); }

function mediaThumb(m, idx) {
    const inner = m.kind === 'video'
        ? '<video src="' + m.data + '" muted playsinline></video>'
        : '<img src="' + m.data + '" alt="">';
    return '<div class="media-thumb">' + inner +
        '<button data-action="remove-media" data-idx="' + idx + '" title="Remove"><i class="fas fa-times"></i></button></div>';
}

function pollPanelHTML(t) {
    if (!t.poll.enabled) return '';
    const opts = t.poll.options.map((o, i) =>
        '<div class="poll-opt"><input type="text" data-poll-opt="' + i + '" data-id="' + t.id +
        '" placeholder="Choice ' + (i + 1) + '" value="' + esc(o) + '" maxlength="25"></div>').join('');
    return '<div class="poll-editor"><div class="poll-title"><i class="fas fa-chart-bar"></i> Poll</div>' + opts +
        '<div class="poll-foot"><button class="link-btn" data-action="poll-add-opt"' +
        (t.poll.options.length >= 4 ? ' disabled style="opacity:.3"' : '') + '>+ Add choice</button>' +
        '<select data-poll-days data-id="' + t.id + '">' +
        [1, 2, 3, 7].map(d => '<option value="' + d + '"' + (t.poll.days === d ? ' selected' : '') + '>' + d + ' day' + (d > 1 ? 's' : '') + '</option>').join('') +
        '</select></div></div>';
}

function cardHTML(t, idx, total) {
    const mediaRow = t.media.map(mediaThumb).join('');
    return '<div class="card tweet-card" data-card="' + t.id + '">' +
        '<div class="tweet-card-head"><span class="tweet-num">Tweet ' + (idx + 1) + (total > 1 ? ' of ' + total : '') + '</span>' +
        '<div class="tweet-tools">' +
            '<button class="tool-btn" data-action="move-up" title="Move up"' + (idx === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
            '<button class="tool-btn" data-action="move-down" title="Move down"' + (idx === total - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
            '<button class="tool-btn" data-action="duplicate" title="Duplicate"><i class="fas fa-copy"></i></button>' +
            '<button class="tool-btn danger" data-action="delete" title="Delete"' + (total === 1 ? ' disabled' : '') + '><i class="fas fa-trash"></i></button>' +
        '</div></div>' +
        '<textarea data-ta rows="4" placeholder="What\'s happening?" maxlength="2000">' + esc(t.text) + '</textarea>' +
        '<div class="media-row">' + mediaRow + '</div>' +
        '<input type="file" data-file accept="image/*,video/*" multiple hidden>' +
        pollPanelHTML(t) +
        '<div class="tweet-card-foot"><div class="mini-tools">' +
            '<button class="mini-btn" data-action="emoji" title="Emoji"><i class="far fa-smile"></i></button>' +
            '<button class="mini-btn" data-action="hashtag" title="Add hashtag"><i class="fas fa-hashtag"></i></button>' +
            '<button class="mini-btn' + (t.poll.enabled ? ' on' : '') + '" data-action="poll" title="Poll"><i class="fas fa-chart-bar"></i></button>' +
            '<button class="mini-btn" data-action="media" title="Add photo/video"><i class="far fa-image"></i></button>' +
            '<button class="mini-btn" data-action="clear-text" title="Clear text"><i class="fas fa-eraser"></i></button>' +
        '</div>' +
        '<div class="ring-wrap"><svg class="ring" width="26" height="26" viewBox="0 0 26 26">' +
            '<circle class="bg" cx="13" cy="13" r="10" fill="none" stroke-width="2.5"/>' +
            '<circle class="fg" cx="13" cy="13" r="10" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '"/>' +
        '</svg><span class="char-count">0</span></div></div></div>';
}

function renderThread() {
    const list = $('#thread-list');
    list.innerHTML = state.tweets.map((t, i) => cardHTML(t, i, state.tweets.length)).join('');
    state.tweets.forEach(t => updateCardUI(t.id));
    updateStats();
}

function updateCardUI(id) {
    const t = tweetById(id);
    const card = $('[data-card="' + id + '"]');
    if (!t || !card) return;
    const len = t.text.length;
    const remain = MAX_TWEET - len;
    const fg = $('.ring .fg', card);
    fg.style.strokeDashoffset = CIRC * (1 - Math.min(len, MAX_TWEET) / MAX_TWEET);
    fg.style.stroke = len > MAX_TWEET ? 'var(--danger)' : (len > MAX_TWEET - 20 ? 'var(--warn)' : 'var(--text)');
    const cc = $('.char-count', card);
    cc.textContent = remain < 0 ? remain : remain;
    cc.classList.toggle('over', len > MAX_TWEET);
    $('[data-ta]', card).classList.toggle('over', len > MAX_TWEET);
}

function updateStats() {
    const total = state.tweets.length;
    const chars = state.tweets.reduce((s, t) => s + t.text.length, 0);
    const words = state.tweets.reduce((s, t) => s + t.text.trim().split(/\s+/).filter(Boolean).length, 0);
    const mins = Math.max(1, Math.round(words / 200));
    $('#stats-bar').innerHTML =
        '<span><b>' + total + '</b> tweet' + (total > 1 ? 's' : '') + '</span>' +
        '<span><b>' + words + '</b> words</span>' +
        '<span><b>' + chars + '</b> chars</span>' +
        '<span>~<b>' + mins + '</b> min read</span>';
}

/* ---------- thread actions ---------- */
function addTweet(afterId, text) {
    const tw = newTweet(text);
    const i = afterId ? tweetIndex(afterId) + 1 : state.tweets.length;
    state.tweets.splice(i, 0, tw);
    renderThread(); scheduleAutosave();
    const ta = $('[data-card="' + tw.id + '"] [data-ta]');
    if (ta) ta.focus();
}
function deleteTweet(id) {
    if (state.tweets.length === 1) return;
    state.tweets = state.tweets.filter(t => t.id !== id);
    renderThread(); scheduleAutosave();
}
function moveTweet(id, dir) {
    const i = tweetIndex(id), j = i + dir;
    if (i < 0 || j < 0 || j >= state.tweets.length) return;
    const tmp = state.tweets[i]; state.tweets[i] = state.tweets[j]; state.tweets[j] = tmp;
    renderThread(); scheduleAutosave();
}
function duplicateTweet(id) {
    const src = tweetById(id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 't' + Date.now() + Math.floor(Math.random() * 1e6);
    state.tweets.splice(tweetIndex(id) + 1, 0, copy);
    renderThread(); scheduleAutosave(); showToast('Tweet duplicated');
}
function splitIntoChunks(text, max) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    let cur = '';
    const push = c => { if (c) chunks.push(c); };
    for (const w of words) {
        if (w.length > max) { // hard-cut an overlong word
            push(cur); cur = '';
            for (let i = 0; i < w.length; i += max) chunks.push(w.slice(i, i + max));
            continue;
        }
        const add = cur ? ' ' + w : w;
        if ((cur + add).length <= max) cur += add;
        else { push(cur); cur = w; }
    }
    push(cur);
    return chunks;
}
function autoSplit() {
    const all = state.tweets.map(t => t.text.trim()).filter(Boolean).join('\n\n');
    if (!all) { showToast('Nothing to split'); return; }
    const max = state.numbering ? MAX_TWEET - 8 : MAX_TWEET;
    const chunks = splitIntoChunks(all.replace(/\s+/g, ' '), max);
    if (chunks.length <= 1) { showToast('Already fits in one tweet'); return; }
    state.tweets = chunks.map(c => newTweet(c));
    renderThread(); scheduleAutosave();
    showToast('Split into ' + chunks.length + ' tweets');
}

/* ---------- media ---------- */
function handleFiles(id, files) {
    const t = tweetById(id);
    if (!t) return;
    const arr = Array.from(files);
    for (const f of arr) {
        if (t.media.length >= MAX_MEDIA) { showToast('Max ' + MAX_MEDIA + ' files per tweet'); break; }
        if (f.size > MAX_FILE) { showToast('"' + f.name + '" is over 5MB'); continue; }
        const kind = f.type.startsWith('image/') ? 'image' : (f.type.startsWith('video/') ? 'video' : null);
        if (!kind) { showToast('Only images and videos allowed'); continue; }
        const r = new FileReader();
        r.onload = e => {
            t.media.push({ kind: kind, data: e.target.result, name: f.name, size: f.size });
            const card = $('[data-card="' + id + '"] .media-row');
            if (card) card.innerHTML = t.media.map(mediaThumb).join('');
            scheduleAutosave();
        };
        r.readAsDataURL(f);
    }
    if (arr.length) showToast('Media added');
}

/* ---------- emoji picker ---------- */
function buildEmojiPicker() {
    $('#emoji-picker').innerHTML = EMOJIS.map(e => '<button data-emoji="' + e + '">' + e + '</button>').join('');
}
function hideEmojiPicker() { $('#emoji-picker').hidden = true; }
function toggleEmojiPicker(btn, cardId) {
    const p = $('#emoji-picker');
    if (!p.hidden && p.dataset.for === cardId) { hideEmojiPicker(); return; }
    p.dataset.for = cardId;
    const r = btn.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 272)) + 'px';
    p.style.top = (r.bottom + 8) + 'px';
    p.hidden = false;
}
function insertAtCursor(textarea, text) {
    const s = textarea.selectionStart || 0, e = textarea.selectionEnd || 0;
    const v = textarea.value;
    textarea.value = v.slice(0, s) + text + v.slice(e);
    const pos = s + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
function insertHashtag(id) {
    const card = $('[data-card="' + id + '"]');
    const ta = card ? $('[data-ta]', card) : null;
    if (ta) insertAtCursor(ta, '#');
}

/* ---------- preview ---------- */
function avatarHTML(cls) {
    const p = state.profile;
    const inner = p.avatar
        ? '<img src="' + p.avatar + '" alt="">'
        : esc((p.name || 'U').trim().charAt(0).toUpperCase() || 'U');
    return '<div class="' + cls + '">' + inner + '</div>';
}
function engagement() {
    return {
        replies: $('#eng-replies').value, rts: $('#eng-rts').value,
        likes: $('#eng-likes').value, views: $('#eng-views').value
    };
}
function previewMediaHTML(t) {
    if (!t.media.length) return '';
    const items = t.media.map(m =>
        m.kind === 'video'
            ? '<video src="' + m.data + '" controls playsinline></video>'
            : '<img src="' + m.data + '" alt="">').join('');
    const cls = t.media.length > 1 ? 'pv-media grid c2' : 'pv-media';
    return '<div class="' + cls + '">' + items + '</div>';
}
function previewPollHTML(t) {
    if (!t.poll.enabled) return '';
    const opts = t.poll.options.map(o => o.trim()).filter(Boolean);
    if (!opts.length) return '';
    const share = Math.floor(100 / opts.length);
    const rows = opts.map(o =>
        '<div class="pv-poll-opt"><div class="bar" style="width:' + share + '%"></div><span>' + esc(o) + '</span></div>').join('');
    return '<div class="pv-poll">' + rows +
        '<div class="pv-poll-meta">' + opts.length + ' choices &middot; ' + t.poll.days + ' day' + (t.poll.days > 1 ? 's' : '') + ' left</div></div>';
}
function renderPreview() {
    const p = state.profile;
    const eng = engagement();
    const total = state.tweets.length;
    const name = esc(p.name || 'Your Name');
    const handle = '@' + esc((p.handle || 'username').replace(/^@+/, ''));
    const verified = p.verified ? ' <i class="fas fa-circle-check verified"></i>' : '';
    $('#preview-list').innerHTML = state.tweets.map((t, i) => {
        const body = t.text.trim() ? linkify(t.text) : '<span style="color:var(--muted)">Empty tweet</span>';
        const num = (state.numbering && total > 1) ? '<div class="pv-num">' + (i + 1) + '/' + total + '</div>' : '';
        return '<div class="pv-tweet"><div class="pv-thread-line"></div>' +
            '<div class="pv-head">' + avatarHTML('pv-avatar') +
                '<div class="pv-id"><div class="pv-name">' + name + verified + '</div>' +
                '<div class="pv-sub">' + handle + ' &middot; now</div></div></div>' +
            '<div class="pv-body">' + body + '</div>' + num +
            previewMediaHTML(t) + previewPollHTML(t) +
            '<div class="pv-actions">' +
                '<span><i class="far fa-comment"></i>' + fmtNum(eng.replies) + '</span>' +
                '<span><i class="fas fa-retweet"></i>' + fmtNum(eng.rts) + '</span>' +
                '<span><i class="far fa-heart"></i>' + fmtNum(eng.likes) + '</span>' +
                '<span><i class="far fa-chart-bar"></i>' + fmtNum(eng.views) + '</span>' +
            '</div></div>';
    }).join('');
}

/* ---------- copy / export / clear ---------- */
function threadText() {
    const total = state.tweets.length;
    return state.tweets.map((t, i) => numberedText(t, i, total)).join('\n\n');
}
function copyThread() {
    const txt = threadText().trim();
    if (!txt) { showToast('Nothing to copy'); return; }
    const done = () => showToast('Copied to clipboard');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
    } else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { showToast('Copy failed'); }
    document.body.removeChild(ta);
}
function exportThread() {
    const txt = threadText().trim();
    if (!txt) { showToast('Nothing to export'); return; }
    const p = state.profile;
    const head = 'Tweet by ' + p.name + ' (@' + p.handle + ') — ' + new Date().toLocaleString() + '\n' + '='.repeat(40) + '\n\n';
    const blob = new Blob([head + txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tweet_' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Exported as .txt');
}
function clearThread() {
    if (!confirm('Clear the whole thread?')) return;
    state.tweets = [newTweet()];
    renderThread(); scheduleAutosave(); showToast('Thread cleared');
}

/* ---------- drafts ---------- */
function getDrafts() {
    try { return JSON.parse(localStorage.getItem('tc-drafts') || '[]'); } catch (e) { return []; }
}
function saveDraft() {
    const txt = threadText().trim();
    if (!txt) { showToast('Cannot save an empty thread'); return; }
    const drafts = getDrafts();
    drafts.unshift({
        id: Date.now(), date: new Date().toISOString(),
        profile: JSON.parse(JSON.stringify(state.profile)),
        tweets: JSON.parse(JSON.stringify(state.tweets)),
        numbering: state.numbering
    });
    try {
        localStorage.setItem('tc-drafts', JSON.stringify(drafts.slice(0, 50)));
    } catch (e) {
        showToast('Draft too large (media) — try fewer images');
        return;
    }
    updateDraftBadge(); showToast('Draft saved');
}
function loadDrafts() {
    const drafts = getDrafts();
    const list = $('#drafts-list');
    updateDraftBadge();
    if (!drafts.length) {
        list.innerHTML = '<div class="empty"><i class="fas fa-folder-open" style="font-size:28px;display:block;margin-bottom:10px"></i>No drafts yet. Compose something and hit Save draft.</div>';
        return;
    }
    list.innerHTML = drafts.map(d => {
        const dt = new Date(d.date);
        const preview = esc((d.tweets[0] && d.tweets[0].text || '').slice(0, 90)) || '(empty)';
        const n = d.tweets.length;
        return '<div class="draft-item" data-draft="' + d.id + '">' +
            '<div class="draft-date">' + dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '<div class="draft-preview">' + preview + '</div>' +
            '<div class="draft-meta">' + n + ' tweet' + (n > 1 ? 's' : '') + (d.profile ? ' &middot; @' + esc(d.profile.handle) : '') + '</div>' +
            '<span class="draft-delete" data-del="' + d.id + '" title="Delete"><i class="fas fa-trash"></i></span></div>';
    }).join('');
}
function updateDraftBadge() {
    const n = getDrafts().length;
    const b = $('#draft-count');
    b.hidden = n === 0;
    b.textContent = n;
}
function openDraft(id) {
    const d = getDrafts().find(x => x.id === id);
    if (!d) return;
    state.profile = d.profile || state.profile;
    state.tweets = (d.tweets && d.tweets.length ? d.tweets : [newTweet()]);
    state.numbering = d.numbering !== false;
    $('#numbering').checked = state.numbering;
    renderProfile(); renderThread(); scheduleAutosave();
    switchTab('compose'); showToast('Draft loaded');
}
function deleteDraft(id) {
    if (!confirm('Delete this draft?')) return;
    localStorage.setItem('tc-drafts', JSON.stringify(getDrafts().filter(d => d.id !== id)));
    loadDrafts(); showToast('Draft deleted');
}
function clearAllDrafts() {
    if (!getDrafts().length) return;
    if (!confirm('Delete ALL drafts?')) return;
    localStorage.removeItem('tc-drafts');
    loadDrafts(); showToast('All drafts cleared');
}

/* ---------- persistence ---------- */
function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('tc-current', JSON.stringify({
                profile: state.profile, tweets: state.tweets, numbering: state.numbering
            }));
        } catch (e) { /* quota — skip silently */ }
    }, 600);
}
function restoreAutosave() {
    try {
        const s = JSON.parse(localStorage.getItem('tc-current') || 'null');
        if (s && s.tweets && s.tweets.length) {
            state.profile = s.profile || state.profile;
            state.tweets = s.tweets;
            state.numbering = s.numbering !== false;
            $('#numbering').checked = state.numbering;
            return true;
        }
    } catch (e) {}
    return false;
}

/* ---------- events ---------- */
function cardIdFrom(el) {
    const card = el.closest('[data-card]');
    return card ? card.dataset.card : null;
}

function bindEvents() {
    // tabs
    $$('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    // theme
    $('#theme-btn').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        setTheme(cur === 'dark' ? 'light' : 'dark');
    });
    // profile
    $('#edit-profile-btn').addEventListener('click', openProfileModal);
    $('#pf-cancel').addEventListener('click', () => { $('#profile-modal').hidden = true; });
    $('#profile-modal').addEventListener('click', e => { if (e.target.id === 'profile-modal') $('#profile-modal').hidden = true; });
    $('#pf-save').addEventListener('click', saveProfileModal);

    // compose actions
    $('#add-tweet-btn').addEventListener('click', () => addTweet());
    $('#autosplit-btn').addEventListener('click', autoSplit);
    $('#numbering').addEventListener('change', e => { state.numbering = e.target.checked; scheduleAutosave(); });
    $('#copy-btn').addEventListener('click', copyThread);
    $('#save-draft-btn').addEventListener('click', saveDraft);
    $('#export-btn').addEventListener('click', exportThread);
    $('#clear-btn').addEventListener('click', clearThread);

    // engagement inputs
    ['eng-replies', 'eng-rts', 'eng-likes', 'eng-views'].forEach(id =>
        $('#' + id).addEventListener('input', () => { if ($('#tab-preview').classList.contains('active')) renderPreview(); }));

    // drafts
    $('#clear-drafts-btn').addEventListener('click', clearAllDrafts);
    $('#drafts-list').addEventListener('click', e => {
        const del = e.target.closest('[data-del]');
        if (del) { e.stopPropagation(); deleteDraft(parseInt(del.dataset.del, 10)); return; }
        const item = e.target.closest('[data-draft]');
        if (item) openDraft(parseInt(item.dataset.draft, 10));
    });

    // thread list — delegation
    const list = $('#thread-list');

    list.addEventListener('focusin', e => {
        if (e.target.matches('[data-ta]')) lastFocusedTA = e.target;
    });

    list.addEventListener('input', e => {
        if (e.target.matches('[data-ta]')) {
            const id = cardIdFrom(e.target);
            const t = tweetById(id);
            if (t) { t.text = e.target.value; updateCardUI(id); updateStats(); scheduleAutosave(); }
            return;
        }
        if (e.target.matches('[data-poll-opt]')) {
            const t = tweetById(e.target.dataset.id);
            if (t) { t.poll.options[parseInt(e.target.dataset.pollOpt, 10)] = e.target.value; scheduleAutosave(); }
        }
    });

    list.addEventListener('change', e => {
        if (e.target.matches('[data-file]')) {
            const id = cardIdFrom(e.target);
            handleFiles(id, e.target.files);
            e.target.value = '';
            return;
        }
        if (e.target.matches('[data-poll-days]')) {
            const t = tweetById(e.target.dataset.id);
            if (t) { t.poll.days = parseInt(e.target.value, 10); scheduleAutosave(); }
        }
    });

    list.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('[data-ta]')) {
            e.preventDefault(); saveDraft();
        }
    });

    list.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;
        const id = cardIdFrom(btn);
        const action = btn.dataset.action;
        if (action === 'move-up') moveTweet(id, -1);
        else if (action === 'move-down') moveTweet(id, 1);
        else if (action === 'duplicate') duplicateTweet(id);
        else if (action === 'delete') deleteTweet(id);
        else if (action === 'emoji') toggleEmojiPicker(btn, id);
        else if (action === 'hashtag') insertHashtag(id);
        else if (action === 'clear-text') {
            const t = tweetById(id);
            if (t && t.text && confirm('Clear this tweet\'s text?')) {
                t.text = ''; renderThread(); scheduleAutosave();
            }
        }
        else if (action === 'media') {
            const card = $('[data-card="' + id + '"]');
            const fi = card ? $('[data-file]', card) : null;
            if (fi) fi.click();
        }
        else if (action === 'remove-media') {
            const t = tweetById(id);
            const idx = parseInt(btn.dataset.idx, 10);
            if (t) { t.media.splice(idx, 1); renderThread(); scheduleAutosave(); }
        }
        else if (action === 'poll') {
            const t = tweetById(id);
            if (t) { t.poll.enabled = !t.poll.enabled; renderThread(); scheduleAutosave(); }
        }
        else if (action === 'poll-add-opt') {
            const t = tweetById(id);
            if (t && t.poll.options.length < 4) {
                t.poll.options.push(''); renderThread(); scheduleAutosave();
                const inputs = $$('[data-card="' + id + '"] [data-poll-opt]');
                if (inputs.length) inputs[inputs.length - 1].focus();
            }
        }
    });

    // emoji picker
    $('#emoji-picker').addEventListener('click', e => {
        const b = e.target.closest('[data-emoji]');
        if (!b) return;
        const id = $('#emoji-picker').dataset.for;
        const card = id ? $('[data-card="' + id + '"]') : null;
        const ta = card ? $('[data-ta]', card) : lastFocusedTA;
        if (ta) insertAtCursor(ta, b.dataset.emoji);
        hideEmojiPicker();
    });
    document.addEventListener('click', e => {
        const p = $('#emoji-picker');
        if (!p.hidden && !p.contains(e.target) && !e.target.closest('[data-action="emoji"]')) hideEmojiPicker();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideEmojiPicker(); $('#profile-modal').hidden = true; } });
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(cur);
    buildEmojiPicker();
    restoreAutosave();
    renderProfile();
    renderThread();
    updateDraftBadge();
    bindEvents();
});
