(() => {
  'use strict';

  /* ---------- Local Storage Wrapper ---------- */
  const LS = {
    g(k, d) {
      try {
        const v = localStorage.getItem('mvs_' + k);
        return v ? JSON.parse(v) : d;
      } catch {
        return d;
      }
    },
    s(k, v) {
      try {
        localStorage.setItem('mvs_' + k, JSON.stringify(v));
      } catch { }
    }
  };

  // Ensure all old sample songs from previous sessions or legacy wc26 app are permanently cleared
  if (!LS.g('songs_cleared_v4', false)) {
    localStorage.removeItem('mvs_cached_songs');
    localStorage.removeItem('mvs_custom_songs');
    localStorage.removeItem('mvs_deleted_songs');
    localStorage.removeItem('mvs_favs');
    localStorage.removeItem('mvs_recent');
    localStorage.removeItem('wc26_songs');
    localStorage.removeItem('wc26_favs');
    localStorage.removeItem('wc26_recent');
    localStorage.removeItem('wc26_day');
    LS.s('songs_cleared_v4', true);
  }

  /* ---------- State & DOM ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const main = $('#main');

  let songs = [];
  let by = {};
  let index = [];
  let activeCategory = LS.g('cat', 'All');
  let favs = LS.g('favs', []);
  let recent = LS.g('recent', []);
  let user = LS.g('user', null); // { name, phone }
  let adminAuthenticated = false;
  let adminActiveTab = 'add'; // 'add' | 'list' | 'export'
  let editingSongId = null;

  const CATEGORIES = [
    'All',
    'Worship',
    'Praise',
    'Devotional',
    'Thanksgiving',
    'Opening',
    'Communion',
    'Offering',
    'Youth',
    'Special'
  ];

  const LABEL = { te: 'తెలుగు', rom: 'English', en: 'Meaning' };

  function isAdminUser() {
    return adminAuthenticated;
  }

  /* Toast Notification */
  function toast(m) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = m;
    document.body.append(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 2400);
  }

  /* Slug Generator */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || ('song-' + Date.now().toString(36));
  }

  /* ---------- Song Data Layer ---------- */
  function repairJson(t) {
    let o = '', inStr = false, esc = false;
    for (const c of t.replace(/^\uFEFF/, '')) {
      if (!inStr) { if (c === '"') inStr = true; o += c; continue; }
      if (esc) { o += c; esc = false; }
      else if (c === '\\') { o += c; esc = true; }
      else if (c === '"') { o += c; inStr = false; }
      else if (c === '\n') o += '\\n';
      else if (c === '\r') { /* drop */ }
      else if (c === '\t') o += '\\t';
      else if (c < ' ') o += ' ';
      else o += c;
    }
    return o;
  }

  function parseSongs(t) {
    try { return JSON.parse(t); } catch { }
    const fixed = repairJson(t);
    try { return JSON.parse(fixed); } catch { }
    return JSON.parse(fixed.replace(/,(\s*[\]}])/g, '$1'));
  }

  function rebuildIndex() {
    by = Object.fromEntries(songs.map(s => [s.id, s]));
    index = songs.map(s => ({
      s,
      h: [
        s.title,
        s.artist,
        s.album,
        s.category,
        s.language,
        (s.tags || []).join(' '),
        Object.values(s.lyrics || {}).join(' ')
      ].join(' ').toLowerCase()
    }));
    window.MVS_SONGS = songs;
  }

  async function loadSongs() {
    let baseSongs = [];
    try {
      const r = await fetch('/api/songs').catch(() => null);
      if (r && r.ok) {
        baseSongs = await r.json();
      } else {
        const fileR = await fetch('songs.json');
        baseSongs = parseSongs(await fileR.text());
      }
    } catch (e) {
      baseSongs = LS.g('cached_songs', []);
    }

    if (!Array.isArray(baseSongs)) baseSongs = [];

    const customSongs = LS.g('custom_songs', []);
    const deletedIds = new Set(LS.g('deleted_songs', []));

    const mergedMap = new Map();
    baseSongs.forEach(s => {
      if (!deletedIds.has(s.id)) mergedMap.set(s.id, s);
    });
    customSongs.forEach(s => {
      if (!deletedIds.has(s.id)) mergedMap.set(s.id, s);
    });

    songs = Array.from(mergedMap.values());
    LS.s('cached_songs', songs);

    rebuildIndex();
  }

  /* Search Engine */
  function search(q) {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return index
      .filter(x => tokens.every(w => x.h.includes(w)))
      .map(x => ({
        s: x.s,
        k: tokens.some(w => x.s.title.toLowerCase().includes(w)) ? 0 : 1
      }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.s);
  }

  /* ---------- UI Helpers ---------- */
  const heart = '<svg viewBox="0 0 24 24"><path d="M12 21C5 16.5 2 13 2 9a5 5 0 0 1 10-1.5A5 5 0 0 1 22 9c0 4-3 7.5-10 12z"/></svg>';
  const isFav = id => favs.includes(id);
  const cover = s => `background:radial-gradient(circle at 25% 20%,hsl(42 85% 72%/.4),transparent 55%),linear-gradient(145deg,hsl(${30 + ((s.cover || 1) % 25)} 65% 40%),hsl(${18 + ((s.cover || 1) % 18)} 55% 15%))`;
  const favBtn = id => `<button class="fav${isFav(id) ? ' on' : ''}" data-fav="${id}" aria-pressed="${isFav(id)}" aria-label="Favorite">${heart}</button>`;

  const card = (s, i = 0) => `
    <article class="card" style="--i:${Math.min(i, 12)}">
      <a href="#/song/${s.id}" class="art" style="${cover(s)}" aria-hidden="true" tabindex="-1">
        ${esc([...s.title][0])}
      </a>
      <a href="#/song/${s.id}" class="meta">
        <b>${esc(s.title)}</b>
        <small>${esc(s.artist || 'Maranatha Worship')}</small>
        <i>${esc(s.category || 'Worship')}</i>
      </a>
      ${favBtn(s.id)}
    </article>
  `;

  const grid = a => `<div class="grid">${a.map((s, i) => card(s, i)).join('')}</div>`;
  const empty = (em, t, d) => `<div class="empty"><span class="em" aria-hidden="true">${em}</span><b>${t}</b><p>${d}</p></div>`;
  const searchBox = v => `
    <label class="sb">
      <span aria-hidden="true">⌕</span>
      <input id="q" type="search" autocomplete="off" placeholder="Search songs by title, lyrics, category..." aria-label="Search songs" value="${esc(v)}">
      ${v ? '<button id="clr" aria-label="Clear search">✕</button>' : ''}
    </label>
  `;

  /* Favorites & Recent */
  function toggleFav(id) {
    favs = isFav(id) ? favs.filter(x => x !== id) : [id, ...favs];
    LS.s('favs', favs);
    $$(`[data-fav="${id}"]`).forEach(b => {
      b.classList.toggle('on', isFav(id));
      b.setAttribute('aria-pressed', isFav(id));
    });
    toast(isFav(id) ? 'Added to Favorites ♥' : 'Removed from Favorites');
    if (location.hash === '#/favs') route();
  }

  function pushRecent(id) {
    recent = [id, ...recent.filter(x => x !== id)].slice(0, 30);
    LS.s('recent', recent);
  }

  /* Category Filter Bar */
  function wireCategoryFilters() {
    $$('.cat-btn').forEach(btn => {
      btn.onclick = () => {
        const cat = btn.dataset.cat;
        activeCategory = cat;
        LS.s('cat', cat);
        $$('.cat-btn').forEach(b => b.classList.toggle('on', b === btn));
        renderHomeSongList();
      };
    });
  }

  function renderHomeSongList() {
    const dl = $('#dl');
    if (!dl) return;
    const filtered = activeCategory === 'All'
      ? songs
      : songs.filter(s => (s.category || '').toLowerCase() === activeCategory.toLowerCase());

    const countLabel = $('#songCountLabel');
    if (countLabel) {
      countLabel.textContent = `${filtered.length} song${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length) {
      dl.innerHTML = grid(filtered);
    } else {
      const isAdm = isAdminUser();
      dl.innerHTML = empty(
        '♪',
        activeCategory === 'All' ? 'No Songs in Library / పాటలు లేవు' : `No ${activeCategory} Songs Yet`,
        isAdm
          ? 'Songbook is empty. Click below to add your first church song!<br><br><a href="#/admin" class="btn-primary" style="display:inline-flex;padding:10px 22px;font-size:14px;border-radius:12px;margin-top:10px">➕ Go to Admin to Add Song</a>'
          : 'Songs will be added soon by the church administration. Please check back shortly!'
      );
    }
  }

  /* Admin / Non-Admin Navbar Visibility */
  function updateAdminNavVisibility() {
    const navAdmin = $('#navAdminBtn');
    if (navAdmin) navAdmin.hidden = false;
  }

  /* ---------- Login System (Name & Phone Only - No Password) ---------- */
  function showLoginModal() {
    let modal = $('#loginModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'loginModal';
      document.body.append(modal);
    }

    modal.innerHTML = `
      <div class="login-box">
        <img class="login-logo" src="assets/logo_home.jpg" alt="Maranatha Logo">
        <h2>MARANATHA SONGS</h2>
        <div class="login-sub">మరనాత విశ్వాస సమాజము · Sign In</div>

        <form id="appLoginForm" novalidate>
          <div class="form-group" style="text-align:left">
            <label for="loginName">Your Name / మీ పేరు *</label>
            <input class="form-control" id="loginName" placeholder="Enter your name" required autocomplete="name">
          </div>
          <div class="form-group" style="text-align:left;margin-top:10px">
            <label for="loginPhone">Phone Number / ఫోన్ నంబర్ *</label>
            <input class="form-control" type="tel" id="loginPhone" placeholder="Enter your 10-digit phone number" maxlength="15" required autocomplete="tel">
          </div>
          <p id="loginErrorMsg" style="color:#ff8888;font-size:13px;min-height:18px;margin:8px 0 0;text-align:center"></p>
          <button class="btn-primary" type="submit" style="width:100%;margin-top:14px">
            Sign In / ప్రారంభించండి ➔
          </button>
        </form>
      </div>
    `;

    const form = $('#appLoginForm', modal);
    form.onsubmit = e => {
      e.preventDefault();
      const name = $('#loginName').value.trim();
      const phone = $('#loginPhone').value.replace(/\D/g, '');
      const err = $('#loginErrorMsg');

      if (!name || name.length < 2) {
        err.textContent = 'Please enter your name (at least 2 letters).';
        return;
      }
      if (!phone || phone.length < 10) {
        err.textContent = 'Please enter a valid 10-digit phone number.';
        return;
      }

      user = { name, phone };
      LS.s('user', user);
      modal.remove();

      toast(`Praise the Lord, ${user.name}! 🙏`);

      updateAdminNavVisibility();
      renderGreet();
      route();
    };
  }

  /* Sample Telugu Christian Hymn for 1-Click Testing */
  const SAMPLE_TELUGU_SONG = {
    title: "నీ కృప నాకు చాలును / Nee Krupa Naaku Chaalunu",
    artist: "Maranatha Worship",
    album: "Maranatha Songs Volume 1",
    category: "Worship",
    language: "Telugu",
    tags: "telugu, grace, krupa, worship, faith",
    lyricsTe: `నీ కృప నాకు చాలును యేసయ్యా
నీ కృప లేనిచో నేను బ్రతుకలేనయ్యా
నీ కృప నాకు చాలును యేసయ్యా
నీ కృప లేనిచో నేను బ్రతుకలేనయ్యా

పడిన చోట నన్ను లేవనెత్తెను
కన్నీటి లోయలో నన్ను ఆదరించెను
మరణపు అంచున జీవము నిచ్చెను
నా భారమంతయు తానే మోసెను

నీ కృప నాకు చాలును యేసయ్యా
నీ కృప లేనిచో నేను బ్రతుకలేనయ్యా`,
    lyricsRom: `Nee Krupa Naaku Chaalunu Yesayya
Nee Krupa Lenicho Nenu Brathukalenayya
Nee Krupa Naaku Chaalunu Yesayya
Nee Krupa Lenicho Nenu Brathukalenayya

Padina Chota Nannu Levaneththenu
Kanneeti Loyalo Nannu Aadarinchenu
Maranapu Anchuna Jeevamu Nichenu
Naa Bhaaramanthayu Thaane Mosenu

Nee Krupa Naaku Chaalunu Yesayya
Nee Krupa Lenicho Nenu Brathukalenayya`,
    lyricsEn: `Your grace is sufficient for me, O Jesus.
Without Your grace, I cannot live.
You lifted me up where I fell,
You comforted me in the valley of tears.`
  };

  /* ---------- Views ---------- */
  const views = {
    home() {
      const filtered = activeCategory === 'All'
        ? songs
        : songs.filter(s => (s.category || '').toLowerCase() === activeCategory.toLowerCase());

      return `
        <section class="hero">
          <div class="panel">
            <div class="church-emblem-wrap">
              <img class="church-emblem" src="assets/logo_home.jpg" alt="Maranatha Visvasa Samajam Emblem">
            </div>
            <h1>MARANATHA VISVASA SAMAJAM</h1>
            <div class="telugu-church-name">మరనాత విశ్వాస సమాజము</div>
            <div class="motto">ప్రేమ - త్యాగం · For God & Country</div>
            <p class="sub">Christian Songs & Worship Book · Lyrics Anywhere Offline</p>
          </div>
          <a href="#/search" class="sb" aria-label="Search songs">
            <span aria-hidden="true">⌕</span>
            <span style="color:var(--mut);font-size:17px">Search songs, Telugu lyrics, artists...</span>
          </a>
        </section>

        <!-- Category Filters -->
        <div class="cat-filters" role="tablist" aria-label="Filter by Category">
          ${CATEGORIES.map(c => `
            <button class="cat-btn ${activeCategory.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-cat="${c}">
              ${c === 'All' ? 'All Songs (అన్నీ)' : c}
            </button>
          `).join('')}
        </div>

        <h2 style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
          <span>Church Songs · పాటలు</span>
          <small id="songCountLabel">${filtered.length} song${filtered.length === 1 ? '' : 's'}</small>
        </h2>
        <div id="dl">${filtered.length ? grid(filtered) : empty(
          '♪',
          'No Songs in Library / పాటలు లేవు',
          isAdminUser()
            ? 'Songbook is empty. Open the Admin panel to add your church songs manually!<br><br><a href="#/admin" class="btn-primary" style="display:inline-flex;padding:10px 22px;font-size:14px;border-radius:12px;margin-top:10px">➕ Go to Admin to Add Song</a>'
            : 'Songs will be added soon by the church administration. Please check back shortly!'
        )}</div>
      `;
    },

    search() {
      return `
        <div style="padding-top:20px">${searchBox('')}</div>
        <div id="res"></div>
      `;
    },

    favs() {
      const a = favs.map(i => by[i]).filter(Boolean);
      return `
        <h2 style="margin-top:28px">Favorite Songs (${a.length})</h2>
        ${a.length ? grid(a) : empty('♡', 'No Favorites Yet', 'Tap the heart on any song to save it here for fast access — even completely offline.')}
      `;
    },

    recent() {
      const a = recent.map(i => by[i]).filter(Boolean);
      return `
        <h2 style="margin-top:28px">Recently Viewed (${a.length})</h2>
        ${a.length ? grid(a) : empty('◷', 'Nothing Viewed Yet', 'Songs you open will appear here for easy reference.')}
      `;
    },

    song(id) {
      const s = by[id];
      if (!s) return empty('♪', 'Song Not Found', '<a href="#/" style="color:var(--ac)">Return to Home</a>');
      pushRecent(id);

      const keys = Object.keys(s.lyrics || {});
      const si = songs.findIndex(x => x.id === id);
      const pv = songs[si - 1];
      const nx = songs[si + 1];

      let k = LS.g('lang', keys[0] || 'te');
      if (!keys.includes(k)) k = keys[0] || 'te';

      const body = langKey => {
        const text = (s.lyrics && s.lyrics[langKey]) || '';
        if (!text) return '<p>No lyrics available in this language.</p>';
        return text.split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
      };

      setTimeout(() => {
        const ly = $('#ly');
        $$('.tabs button').forEach(b => {
          b.onclick = () => {
            LS.s('lang', b.dataset.k);
            if (ly) ly.innerHTML = body(b.dataset.k);
            $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
          };
        });

        const copyBtn = $('#copyLyrics');
        if (copyBtn) {
          copyBtn.onclick = () => {
            const curLang = LS.g('lang', keys[0]);
            const txt = (s.lyrics && s.lyrics[curLang]) || '';
            if (txt) {
              navigator.clipboard.writeText(`${s.title}\n\n${txt}`).then(() => toast('Lyrics copied to clipboard! 📋'));
            }
          };
        }

        const wBtn = $('#worshipLaunch');
        if (wBtn) {
          wBtn.onclick = () => {
            if (window.MVS_OPEN_WORSHIP) {
              window.MVS_OPEN_WORSHIP(id);
            }
          };
        }
      });

      return `
        <div class="rh">
          <button class="ib" onclick="history.length > 1 ? history.back() : location.hash='#/'" aria-label="Back">←</button>
          <div class="t">
            <h1>${esc(s.title)}</h1>
            <small>${esc(s.artist || 'Maranatha Worship')} · ${esc(s.category || 'Worship')}</small>
          </div>
          ${favBtn(id).replace('class="fav', 'class="ib fav').replace(/position:absolute/, '')}
        </div>

        <div class="song-actions-bar">
          ${keys.length > 1 ? `
            <div class="tabs" role="tablist">
              ${keys.map(x => `<button data-k="${x}" role="tab" class="${x === k ? 'on' : ''}">${LABEL[x] || x}</button>`).join('')}
            </div>
          ` : '<div></div>'}
          <div style="display:flex;gap:8px">
            <button class="worship-btn" id="worshipLaunch" type="button">
              <span>📖</span><span>Worship Mode</span>
            </button>
            <button class="ib" id="copyLyrics" title="Copy Lyrics" aria-label="Copy Lyrics">
              <span>📋</span>
            </button>
          </div>
        </div>

        <div class="ly" id="ly">${body(k)}</div>

        <nav class="pn" aria-label="Previous / Next Song">
          ${pv ? `<a href="#/song/${pv.id}">← ${esc(pv.title)}</a>` : '<span></span>'}
          ${nx ? `<a href="#/song/${nx.id}">${esc(nx.title)} →</a>` : '<span></span>'}
        </nav>
      `;
    },

    /* ---------- SEPARATE ADMIN VIEW ---------- */
    admin() {
      if (!user) {
        showLoginModal();
        return `
          <div class="admin-card" style="max-width:440px;margin:40px auto 0;text-align:center">
            <h2>Sign In Required</h2>
            <p style="color:var(--mut);font-size:14px">Please sign in as Administrator to access this page.</p>
            <button class="btn-primary" onclick="window.MVS_SHOW_LOGIN()">Open Login Window ➔</button>
          </div>
        `;
      }

      if (!isAdminUser()) {
        return `
          <div class="admin-card" style="max-width:460px;margin:40px auto 0;text-align:center">
            <div style="font-size:48px;margin-bottom:12px">🔒</div>
            <h2 style="justify-content:center;margin:0 0 8px">Administrator Sign In</h2>
            <p style="color:var(--mut);font-size:14px;line-height:1.6;margin:0 0 20px">Enter the administrator password to manage songs.</p>
            <form id="adminLoginForm" style="max-width:360px;margin:0 auto;text-align:left">
              <div class="form-group">
                <label for="adminPassword">Administrator Password</label>
                <input class="form-control" id="adminPassword" type="password" autocomplete="current-password" required>
              </div>
              <p id="adminLoginError" role="alert" style="color:#b4234a;font-size:13px;min-height:18px"></p>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button class="btn-primary" type="submit">Sign In</button>
                <a href="#/" class="btn-secondary">Return to Songbook</a>
              </div>
            </form>
          </div>
        `;
      }

      const editingSong = editingSongId ? by[editingSongId] : null;

      return `
        <div class="admin-card">
          <div class="admin-header">
            <div>
              <h2 style="margin:0;font-size:24px">⚙️ Church Admin Dashboard</h2>
              <small style="color:var(--mut)">Logged in as <b>Administrator</b> (${user.phone})</small>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="btn-sm" style="background:var(--card);color:var(--ac);border-color:var(--ac)">
                ${songs.length} Songs in Library
              </span>
              <button class="btn-sm btn-del" id="adminSignOutBtn">Sign Out</button>
            </div>
          </div>

          <div class="admin-tabs">
            <button class="admin-tab-btn ${adminActiveTab === 'add' ? 'on' : ''}" data-tab="add">
              ${editingSong ? '✏️ Edit Song' : '➕ Add New Song'}
            </button>
            <button class="admin-tab-btn ${adminActiveTab === 'list' ? 'on' : ''}" data-tab="list">
              📋 Manage Songs (${songs.length})
            </button>
            <button class="admin-tab-btn ${adminActiveTab === 'export' ? 'on' : ''}" data-tab="export">
              💾 Export / Import
            </button>
          </div>

          <!-- TAB 1: ADD / EDIT SONG (Only for admin) -->
          <div id="adminTabAdd" ${adminActiveTab !== 'add' ? 'hidden' : ''}>
            ${editingSong ? `
              <div style="background:color-mix(in srgb,var(--ac) 15%,transparent);border:1px solid var(--ac);padding:10px 16px;border-radius:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
                <span>Currently editing: <b>${esc(editingSong.title)}</b> (ID: ${editingSong.id})</span>
                <button class="btn-sm" id="cancelEditBtn">Cancel Edit</button>
              </div>
            ` : ''}

            <form id="addSongForm">
              <div class="form-row">
                <div class="form-group">
                  <label for="songTitle">Song Title (Telugu or Romanized) *</label>
                  <input class="form-control" id="songTitle" placeholder="e.g. నీ కృప నాకు చాలును / Nee Krupa" value="${editingSong ? esc(editingSong.title) : ''}" required>
                </div>
                <div class="form-group">
                  <label for="songCategory">Category</label>
                  <select class="form-control" id="songCategory">
                    <option value="Worship" ${editingSong?.category === 'Worship' ? 'selected' : ''}>Worship (ఆరాధన)</option>
                    <option value="Praise" ${editingSong?.category === 'Praise' ? 'selected' : ''}>Praise (స్తుతి)</option>
                    <option value="Devotional" ${editingSong?.category === 'Devotional' ? 'selected' : ''}>Devotional (భక్తి)</option>
                    <option value="Thanksgiving" ${editingSong?.category === 'Thanksgiving' ? 'selected' : ''}>Thanksgiving (కృతజ్ఞత)</option>
                    <option value="Opening" ${editingSong?.category === 'Opening' ? 'selected' : ''}>Opening / Gathering</option>
                    <option value="Communion" ${editingSong?.category === 'Communion' ? 'selected' : ''}>Communion / Holy Supper</option>
                    <option value="Offering" ${editingSong?.category === 'Offering' ? 'selected' : ''}>Offering (కానుకలు)</option>
                    <option value="Youth" ${editingSong?.category === 'Youth' ? 'selected' : ''}>Youth / Children</option>
                    <option value="Special" ${editingSong?.category === 'Special' ? 'selected' : ''}>Special Hymn</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="songArtist">Artist / Choir / Composer</label>
                  <input class="form-control" id="songArtist" placeholder="Maranatha Worship" value="${editingSong ? esc(editingSong.artist) : 'Maranatha Worship'}">
                </div>
                <div class="form-group">
                  <label for="songTags">Search Tags (comma separated)</label>
                  <input class="form-control" id="songTags" placeholder="telugu, praise, worship, grace" value="${editingSong ? esc((editingSong.tags || []).join(', ')) : 'telugu, worship, praise'}">
                </div>
              </div>

              <div class="form-group">
                <label for="lyricsTe">Telugu Lyrics (తెలుగు సాహిత్యం) *</label>
                <textarea class="form-control" id="lyricsTe" placeholder="Enter lyrics in Telugu script. Separate stanzas with a blank line...">${editingSong?.lyrics?.te ? esc(editingSong.lyrics.te) : ''}</textarea>
              </div>

              <div class="form-group">
                <label for="lyricsRom">English Transliteration / Romanized (ఐచ్ఛికం / Optional)</label>
                <textarea class="form-control" id="lyricsRom" placeholder="Nee Krupa Naaku Chaalunu Yesayya...">${editingSong?.lyrics?.rom ? esc(editingSong.lyrics.rom) : ''}</textarea>
              </div>

              <div class="form-group">
                <label for="lyricsEn">English Meaning / Translation (ఐచ్ఛికం / Optional)</label>
                <textarea class="form-control" style="height:90px" id="lyricsEn" placeholder="Your grace is sufficient for me...">${editingSong?.lyrics?.en ? esc(editingSong.lyrics.en) : ''}</textarea>
              </div>

              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px">
                <button class="btn-primary" type="submit" id="saveSongSubmitBtn">
                  <span>💾</span><span>${editingSong ? 'Save Changes' : 'Save Song Manually'}</span>
                </button>
                <button class="btn-secondary" type="button" id="loadSampleSongBtn">
                  <span>✨</span><span>Fill Sample Telugu Hymn</span>
                </button>
              </div>
            </form>
          </div>

          <!-- TAB 2: MANAGE SONGS LIST -->
          <div id="adminTabList" ${adminActiveTab !== 'list' ? 'hidden' : ''}>
            <div style="margin-bottom:14px">
              <input class="form-control" type="search" id="adminSongFilter" placeholder="Filter songs in catalog by title, category, or artist...">
            </div>
            <div id="adminSongListContainer" style="max-height:550px;overflow-y:auto;border:1px solid var(--bd);border-radius:14px;padding:8px"></div>
          </div>

          <!-- TAB 3: EXPORT / IMPORT -->
          <div id="adminTabExport" ${adminActiveTab !== 'export' ? 'hidden' : ''}>
            <div style="display:flex;flex-direction:column;gap:18px">
              <div style="background:var(--card);border:1px solid var(--bd);padding:18px;border-radius:14px">
                <h3 style="margin:0 0 6px">📥 Download songs.json Backup</h3>
                <p style="color:var(--mut);font-size:14px;margin:0 0 14px">
                  Export your church songs database (${songs.length} songs) as a clean JSON file to backup or deploy directly to your repository.
                </p>
                <button class="btn-primary" type="button" id="downloadSongsJsonBtn">
                  <span>📥</span><span>Download songs.json (${songs.length} songs)</span>
                </button>
              </div>

              <div style="background:var(--card);border:1px solid var(--bd);padding:18px;border-radius:14px">
                <h3 style="margin:0 0 6px">📤 Import songs.json</h3>
                <p style="color:var(--mut);font-size:14px;margin:0 0 14px">
                  Upload an existing songs.json file to merge with or restore songs.
                </p>
                <input type="file" id="importJsonFileInput" accept=".json" style="display:none">
                <button class="btn-secondary" type="button" onclick="$('#importJsonFileInput').click()">
                  <span>📤</span><span>Select JSON File to Import</span>
                </button>
              </div>

              <div style="background:var(--card);border:1px solid rgba(255,100,100,0.3);padding:18px;border-radius:14px">
                <h3 style="margin:0 0 6px;color:#ff8888">🗑️ Clear All Songs</h3>
                <p style="color:var(--mut);font-size:14px;margin:0 0 14px">
                  Remove all songs from the catalog and start fresh with an empty library.
                </p>
                <button class="btn-secondary" type="button" id="clearAllSongsBtn" style="color:#ff8888;border-color:rgba(255,100,100,0.4)">
                  <span>🗑️</span><span>Clear All Songs Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  };

  /* ---------- Admin Actions Wiring ---------- */
  function wireAdmin() {
    const adminLoginForm = $('#adminLoginForm');
    if (adminLoginForm) {
      adminLoginForm.onsubmit = async event => {
        event.preventDefault();
        const password = $('#adminPassword').value;
        const error = $('#adminLoginError');
        try {
          const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Administrator sign-in failed');
          adminAuthenticated = true;
          updateAdminNavVisibility();
          renderGreet();
          render();
        } catch (err) {
          error.textContent = err.message || 'Administrator sign-in failed';
        }
      };
      return;
    }

    const signOutBtn = $('#adminSignOutBtn');
    if (signOutBtn) {
      signOutBtn.onclick = () => {
        if (confirm('Sign out from Admin?')) {
          fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
          adminAuthenticated = false;
          user = null;
          LS.s('user', null);
          updateAdminNavVisibility();
          renderGreet();
          showLoginModal();
          location.hash = '#/';
        }
      };
    }

    $$('.admin-tab-btn').forEach(b => {
      b.onclick = () => {
        adminActiveTab = b.dataset.tab;
        render();
      };
    });

    const cancelEditBtn = $('#cancelEditBtn');
    if (cancelEditBtn) {
      cancelEditBtn.onclick = () => {
        editingSongId = null;
        render();
      };
    }

    const sampleBtn = $('#loadSampleSongBtn');
    if (sampleBtn) {
      sampleBtn.onclick = () => {
        $('#songTitle').value = SAMPLE_TELUGU_SONG.title;
        $('#songCategory').value = SAMPLE_TELUGU_SONG.category;
        $('#songArtist').value = SAMPLE_TELUGU_SONG.artist;
        $('#songTags').value = SAMPLE_TELUGU_SONG.tags;
        $('#lyricsTe').value = SAMPLE_TELUGU_SONG.lyricsTe;
        $('#lyricsRom').value = SAMPLE_TELUGU_SONG.lyricsRom;
        $('#lyricsEn').value = SAMPLE_TELUGU_SONG.lyricsEn;
        toast('Sample Telugu hymn loaded! Click Save to add it.');
      };
    }

    const addForm = $('#addSongForm');
    if (addForm) {
      addForm.onsubmit = async e => {
        e.preventDefault();
        const title = $('#songTitle').value.trim();
        const category = $('#songCategory').value.trim();
        const artist = $('#songArtist').value.trim() || 'Maranatha Worship';
        const tags = $('#songTags').value.split(',').map(t => t.trim()).filter(Boolean);
        const te = $('#lyricsTe').value.trim();
        const rom = $('#lyricsRom').value.trim();
        const en = $('#lyricsEn').value.trim();

        if (!title) { toast('Please enter song title'); return; }
        if (!te && !rom) { toast('Please enter Telugu or Romanized lyrics'); return; }

        const songPayload = {
          title,
          category,
          artist,
          album: 'Maranatha Songs',
          language: 'Telugu',
          tags,
          lyrics: {
            ...(te ? { te } : {}),
            ...(rom ? { rom } : {}),
            ...(en ? { en } : {})
          }
        };

        const submitBtn = $('#saveSongSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        if (editingSongId) {
          songPayload.id = editingSongId;
          let savedOnServer = false;
          try {
            const res = await fetch(`/api/songs/${encodeURIComponent(editingSongId)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(songPayload)
            });
            if (res.ok) savedOnServer = true;
          } catch { }

          const idx = songs.findIndex(s => s.id === editingSongId);
          if (idx !== -1) {
            songs[idx] = { ...songs[idx], ...songPayload };
          }

          const custom = LS.g('custom_songs', []);
          const cIdx = custom.findIndex(s => s.id === editingSongId);
          if (cIdx !== -1) custom[cIdx] = songs[idx];
          else custom.push(songs[idx]);
          LS.s('custom_songs', custom);

          rebuildIndex();
          toast(`Song updated successfully! ${savedOnServer ? '✓ Server' : '✓ Local'}`);
          editingSongId = null;
          adminActiveTab = 'list';
          render();
        } else {
          let newSong = null;
          let savedOnServer = false;
          try {
            const res = await fetch('/api/songs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(songPayload)
            });
            if (res.ok) {
              const data = await res.json();
              newSong = data.song;
              savedOnServer = true;
            }
          } catch { }

          if (!newSong) {
            const rawId = slugify(title);
            let id = rawId, c = 1;
            while (songs.some(s => s.id === id)) id = `${rawId}-${c++}`;
            newSong = {
              id,
              ...songPayload,
              cover: Math.floor(Math.random() * 50) + 1,
              addedAt: new Date().toISOString()
            };
          }

          const custom = LS.g('custom_songs', []);
          custom.unshift(newSong);
          LS.s('custom_songs', custom);

          songs.unshift(newSong);
          rebuildIndex();

          toast(`Song added! <a href="#/song/${newSong.id}" style="color:var(--ac);text-decoration:underline;margin-left:6px">View Song ➔</a>`);
          adminActiveTab = 'list';
          render();
        }
      };
    }

    const listCont = $('#adminSongListContainer');
    if (listCont) {
      const renderAdminList = filterText => {
        const ft = (filterText || '').toLowerCase().trim();
        const matches = songs.filter(s => {
          if (!ft) return true;
          return s.title.toLowerCase().includes(ft) ||
            (s.artist && s.artist.toLowerCase().includes(ft)) ||
            (s.category && s.category.toLowerCase().includes(ft));
        });

        if (!matches.length) {
          listCont.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mut)">No songs found matching "${esc(ft)}"</div>`;
          return;
        }

        listCont.innerHTML = matches.map(s => `
          <div class="admin-song-row" data-id="${s.id}">
            <div class="admin-song-info">
              <b style="font-size:15px;color:var(--tx)">${esc(s.title)}</b>
              <div style="font-size:12px;color:var(--mut);margin-top:2px">
                ${esc(s.category || 'Worship')} · ${esc(s.artist || 'Maranatha')}
              </div>
            </div>
            <div class="admin-song-actions">
              <a href="#/song/${s.id}" class="btn-sm" style="display:inline-flex;align-items:center">View</a>
              <button class="btn-sm admin-edit-btn" data-edit="${s.id}">Edit</button>
              <button class="btn-sm btn-del admin-del-btn" data-del="${s.id}">Delete</button>
            </div>
          </div>
        `).join('');

        listCont.querySelectorAll('.admin-edit-btn').forEach(btn => {
          btn.onclick = () => {
            editingSongId = btn.dataset.edit;
            adminActiveTab = 'add';
            render();
          };
        });

        listCont.querySelectorAll('.admin-del-btn').forEach(btn => {
          btn.onclick = async () => {
            const sid = btn.dataset.del;
            const songToDel = by[sid];
            if (!confirm(`Are you sure you want to delete "${songToDel ? songToDel.title : sid}"?`)) return;

            try {
              await fetch(`/api/songs/${encodeURIComponent(sid)}`, { method: 'DELETE' });
            } catch { }

            songs = songs.filter(s => s.id !== sid);
            const custom = LS.g('custom_songs', []).filter(s => s.id !== sid);
            LS.s('custom_songs', custom);

            const deleted = new Set(LS.g('deleted_songs', []));
            deleted.add(sid);
            LS.s('deleted_songs', Array.from(deleted));

            rebuildIndex();
            toast('Song deleted');
            renderAdminList($('#adminSongFilter')?.value);
          };
        });
      };

      renderAdminList();

      const filterInput = $('#adminSongFilter');
      if (filterInput) {
        filterInput.oninput = () => renderAdminList(filterInput.value);
      }
    }

    const clearAllBtn = $('#clearAllSongsBtn');
    if (clearAllBtn) {
      clearAllBtn.onclick = async () => {
        if (!confirm('Are you sure you want to remove ALL songs from the songbook?')) return;
        songs = [];
        LS.s('custom_songs', []);
        LS.s('cached_songs', []);
        LS.s('favs', []);
        favs = [];
        try {
          for (const s of Object.keys(by)) {
            await fetch(`/api/songs/${encodeURIComponent(s)}`, { method: 'DELETE' }).catch(() => {});
          }
        } catch { }
        rebuildIndex();
        toast('All songs removed! The catalog is now clean.');
        render();
      };
    }

    const dlJsonBtn = $('#downloadSongsJsonBtn');
    if (dlJsonBtn) {
      dlJsonBtn.onclick = () => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(songs, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute('href', dataStr);
        dlAnchor.setAttribute('download', 'songs.json');
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
        toast('songs.json downloaded!');
      };
    }

    const fileInput = $('#importJsonFileInput');
    if (fileInput) {
      fileInput.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const imported = JSON.parse(ev.target.result);
            if (!Array.isArray(imported)) throw new Error('File does not contain a JSON array of songs');

            const custom = LS.g('custom_songs', []);
            imported.forEach(s => {
              if (s.title && (s.lyrics?.te || s.lyrics?.rom)) {
                if (!s.id) s.id = slugify(s.title);
                custom.push(s);
              }
            });
            LS.s('custom_songs', custom);
            loadSongs().then(() => {
              toast(`Successfully imported songs! Total: ${songs.length}`);
              render();
            });
          } catch (err) {
            alert('Failed to parse JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
    }
  }

  /* ---------- Search Wiring ---------- */
  function wireSearch() {
    const q = $('#q');
    if (!q) return;
    const res = $('#res');

    const run = () => {
      const v = q.value.trim();
      const sb = $('.sb');
      const c = $('#clr');
      if (v && !c) sb.insertAdjacentHTML('beforeend', '<button id="clr" aria-label="Clear search">✕</button>');
      if (!v && c) c.remove();

      if (!v) {
        const tags = [...new Set(songs.flatMap(s => [s.category, ...(s.tags || [])]))].filter(Boolean).slice(0, 14);
        res.innerHTML = `
          <div class="chips" aria-label="Categories & Tags">
            ${tags.map(t => `<button class="chip" data-s="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>
          ${empty('⌕', 'Find Songs in Church Library', 'Search by song title, lyric words, or category in Telugu or English.')}
        `;
        return;
      }

      const r = search(v);
      res.innerHTML = r.length
        ? `<h2>${r.length} result${r.length > 1 ? 's' : ''}</h2>${grid(r)}`
        : empty('🎧', 'No matches found', 'Try another Telugu or English word from the title or lyrics.');
    };

    q.addEventListener('input', run);
    run();
    q.focus({ preventScroll: true });
  }

  /* Global Click Handlers */
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]');
    if (f) {
      e.preventDefault();
      toggleFav(f.dataset.fav);
      return;
    }

    const c = e.target.closest('#clr');
    if (c) {
      const q = $('#q');
      if (q) {
        q.value = '';
        q.dispatchEvent(new Event('input'));
        q.focus();
      }
      return;
    }

    const ch = e.target.closest('[data-s]');
    if (ch) {
      const q = $('#q');
      if (q) {
        q.value = ch.dataset.s;
        q.dispatchEvent(new Event('input'));
      }
    }
  });

  /* ---------- Router ---------- */
  function render() {
    const [, r = '', id] = location.hash.slice(1).split('/');
    const name = r || 'home';
    const v = views[name] || views.home;

    main.style.animation = 'none';
    void main.offsetHeight;
    main.style.animation = '';
    main.innerHTML = v(id ? decodeURIComponent(id) : undefined);

    $$('.nav a').forEach(a => {
      a.classList.toggle('on', a.dataset.r === (name === 'song' ? 'home' : name));
    });

    const prog = $('#prog');
    if (prog) prog.style.width = '0';

    if (name !== 'search' || !$('#q')) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    if (name === 'search') wireSearch();
    if (name === 'home') wireCategoryFilters();
    if (name === 'admin') wireAdmin();

    updateAdminNavVisibility();
    renderGreet();

    // If user is not logged in, enforce the login window immediately
    if (!user) {
      showLoginModal();
    }
  }

  function route() { render(); }

  addEventListener('scroll', () => {
    if (!location.hash.startsWith('#/song/')) return;
    const h = document.documentElement;
    const m = h.scrollHeight - innerHeight;
    const prog = $('#prog');
    if (prog) prog.style.width = (m > 0 ? Math.min(100, (scrollY / m) * 100) : 0) + '%';
  }, { passive: true });

  addEventListener('hashchange', route);

  const appNav = $('#appNav');
  const menuToggle = $('#menuToggle');
  const setMenuOpen = open => {
    if (!appNav || !menuToggle) return;
    appNav.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  };

  if (appNav && menuToggle) {
    menuToggle.onclick = () => setMenuOpen(appNav.hidden);
    appNav.addEventListener('click', event => {
      if (event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#appNav, #menuToggle')) setMenuOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !appNav.hidden) {
        setMenuOpen(false);
        menuToggle.focus();
      }
    });
  }

  /* ---------- Share and Offline ---------- */
  const shareBtn = $('#share');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      const url = location.origin + location.pathname;
      const data = {
        title: 'Maranatha Visvasa Samajam Songs',
        text: 'Maranatha Visvasa Samajam Telugu Christian Hymns and Worship Songs Book — works offline.',
        url
      };
      try {
        if (navigator.share) { await navigator.share(data); return; }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied to clipboard! 📋');
      } catch {
        prompt('Copy songbook link:', url);
      }
    };
  }

  const net = () => {
    const off = $('#off');
    if (off) off.hidden = navigator.onLine;
  };
  addEventListener('online', net);
  addEventListener('offline', net);
  net();

  /* Greeting bar with User Name and Sign Out */
  function renderGreet() {
    const g = $('#greet');
    if (!g) return;
    if (!user) {
      g.hidden = true;
      return;
    }

    const isAdm = isAdminUser();
    g.hidden = false;
    g.innerHTML = `
      <div>
        <b>Hi ${esc(user.name)}${isAdm ? ' <span style="color:var(--ac);font-weight:700">(Admin 👑)</span>' : ''}</b>
        <span>Praise the Lord 🙏 దేవునికి స్తోత్రము</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="letterBtn" type="button">✉ Message</button>
        <button id="userSignOutBtn" type="button" style="color:var(--mut);border:1px solid var(--bd);border-radius:10px;padding:6px 12px;background:var(--card);font-size:12px">Sign Out</button>
      </div>
    `;

    const soBtn = $('#userSignOutBtn');
    if (soBtn) {
      soBtn.onclick = () => {
        if (confirm('Sign out from this account?')) {
          if (adminAuthenticated) fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
          adminAuthenticated = false;
          user = null;
          LS.s('user', null);
          updateAdminNavVisibility();
          renderGreet();
          showLoginModal();
          if (location.hash === '#/admin') location.hash = '#/';
          else route();
        }
      };
    }
  }

  /* Welcome Letter Popup */
  let LETTER = null;
  async function loadLetter() {
    try {
      const r = await fetch('letter.txt', { cache: 'no-cache' });
      if (!r.ok) return;
      const lines = (await r.text()).replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
      const meta = {};
      let i = 0;
      for (; i < lines.length && /^[a-z]+\s*:/i.test(lines[i]); i++) {
        meta[lines[i].split(':')[0].trim().toLowerCase()] = lines[i].slice(lines[i].indexOf(':') + 1).trim();
      }
      const body = lines.slice(i).join('\n').trim();
      if (!body) return;
      LETTER = { id: meta.id || 'maranatha-welcome-1', title: meta.title || 'A Message of Grace & Love ❤️', body };
    } catch { }
  }

  function letterHtml(b) {
    return b.split(/\n\s*\n/).map(p => {
      const ls = p.split('\n').map(x => x.trim()).filter(Boolean);
      if (!ls.length) return '';
      return '<p>' + ls.map(esc).join('<br>') + '</p>';
    }).join('');
  }

  function openLetter() {
    if (!LETTER || $('#letter')) return;
    const el = document.createElement('div');
    el.id = 'letter';
    el.className = 'env';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lt');
    el.innerHTML = `
      <div class="ew">
        <div class="envelope-wrapper">
          <div class="envelope">
            <div class="letter">
              <div class="text">${esc(LETTER.title)}</div>
            </div>
            <button class="heart" type="button" aria-label="Open message"></button>
          </div>
        </div>
        <p class="eh">Tap heart to open church message</p>
      </div>
      <div class="lc">
        <button class="lx" type="button" aria-label="Close">✕</button>
        <h2 id="lt">${esc(LETTER.title)}</h2>
        <div class="lb">${letterHtml(LETTER.body)}</div>
        <button class="go" type="button">Amen 🙏 Continue to Songbook</button>
      </div>
    `;
    document.body.append(el);

    const close = () => {
      LS.s('letter_read', LETTER.id);
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    };

    const open = () => {
      if (el.classList.contains('flap')) return;
      el.classList.add('flap');
      setTimeout(() => {
        el.classList.add('read');
        const goBtn = $('.go', el);
        if (goBtn) goBtn.focus({ preventScroll: true });
      }, 2000);
    };

    el.onclick = e => { if (e.target === el && el.classList.contains('read')) close(); };
    $('.heart', el).onclick = open;
    $('.envelope', el).onclick = open;
    $('.lx', el).onclick = close;
    $('.go', el).onclick = close;
  }

  document.addEventListener('click', e => {
    if (e.target.id === 'letterBtn') openLetter();
  });

  window.MVS_SHOW_LOGIN = showLoginModal;

  /* Bootstrapping */
  loadLetter();
  loadSongs().then(async () => {
    try {
      const response = await fetch('/api/admin/status');
      const status = await response.json();
      adminAuthenticated = response.ok && status.authenticated === true;
    } catch {
      adminAuthenticated = false;
    }
    updateAdminNavVisibility();
    route();
    if (!user) {
      showLoginModal();
    }
  }).catch(e => {
    console.error(e);
    main.innerHTML = empty('♪', 'Unable to load songs', 'Please check your connection and try again.');
  });

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
})();
