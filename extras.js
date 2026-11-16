/* Extras: (1) Church Colour Palettes  (2) Fullscreen Worship Mode with WakeLock */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const LSg = (k, d) => { try { const v = localStorage.getItem('mvs_' + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const LSs = (k, v) => { try { localStorage.setItem('mvs_' + k, JSON.stringify(v)); } catch {} };
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2200); };

  /* ===== 1. White and Rose Palette ===== */
  const meta = $('meta[name=theme-color]');
  document.documentElement.dataset.theme = 'light';
  if (meta) meta.content = '#fff8f8';

  /* ===== 2. Worship Mode ===== */
  const LABEL = { te: 'తెలుగు', rom: 'English', en: 'Meaning' };
  let wm = null, wake = null, hideT = 0;

  const keepAwake = async () => {
    try {
      if ('wakeLock' in navigator && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch {}
    return !!wake;
  };

  const letGo = () => {
    try { wake && wake.release(); } catch {}
    wake = null;
  };

  document.addEventListener('visibilitychange', () => {
    if (wm && document.visibilityState === 'visible') keepAwake();
  });

  async function openWorship(id) {
    if (wm) return;
    const all = window.MVS_SONGS || [];
    if (!all.length) {
      toast('Songs library not loaded yet');
      return;
    }

    const list = all;
    let i = Math.max(0, list.findIndex(s => s.id === id));
    let size = LSg('wm_size', 32);

    const el = wm = document.createElement('div');
    el.id = 'wm';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Worship Mode');
    el.innerHTML = `
      <div class="wm-bg-watermark"></div>
      <div class="wm-stage" tabindex="0"><div class="wm-ly"></div></div>
      <div class="wm-bar wm-top">
        <button class="wm-b" data-a="close" type="button" aria-label="Close worship mode">✕</button>
        <div class="wm-t">
          <b></b>
          <small></small>
        </div>
        <div class="wm-ctl">
          <button class="wm-b" data-a="lang" type="button" aria-label="Change language"></button>
          <button class="wm-b" data-a="smaller" type="button" aria-label="Smaller text">A−</button>
          <button class="wm-b" data-a="bigger" type="button" aria-label="Bigger text">A+</button>
        </div>
      </div>
      <div class="wm-bar wm-bot">
        <button class="wm-b" data-a="prev" type="button" aria-label="Previous song">‹ Prev</button>
        <span class="wm-n"></span>
        <button class="wm-b" data-a="next" type="button" aria-label="Next song">Next ›</button>
      </div>
    `;
    document.body.append(el);

    const lock = v => ['.col', '.nav'].forEach(s => { const n = $(s); if (n) n.inert = v; });
    lock(true);
    keepAwake();

    const stage = $('.wm-stage', el);
    const ly = $('.wm-ly', el);
    const q = a => $(`[data-a=${a}]`, el);

    const keyOf = s => {
      const ks = Object.keys(s.lyrics || {});
      const k = LSg('lang', ks[0] || 'te');
      return ks.includes(k) ? k : (ks[0] || 'te');
    };

    const poke = () => {
      el.classList.remove('hide');
      clearTimeout(hideT);
      hideT = setTimeout(() => el.classList.add('hide'), 5500);
    };

    const render = dir => {
      const s = list[i];
      if (!s) return;
      const ks = Object.keys(s.lyrics || {});
      const k = keyOf(s);

      $('.wm-t b', el).textContent = s.title;
      $('.wm-t small', el).textContent = `${s.category || 'Worship'} · ${s.artist || 'Maranatha Worship'}`;
      q('lang').textContent = LABEL[k] || k;
      q('lang').hidden = ks.length < 2;

      ly.style.fontSize = size + 'px';
      const lyricsText = (s.lyrics && s.lyrics[k]) || '';
      ly.innerHTML = lyricsText.split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

      stage.scrollTop = 0;
      $('.wm-n', el).textContent = `${i + 1} / ${list.length}`;

      ly.classList.remove('wm-l', 'wm-r');
      void ly.offsetWidth;
      if (dir) ly.classList.add(dir > 0 ? 'wm-l' : 'wm-r');

      q('prev').disabled = i === 0;
      q('next').disabled = i === list.length - 1;
    };

    const go = d => {
      const n = i + d;
      if (n >= 0 && n < list.length) {
        i = n;
        render(d);
        poke();
      }
    };

    const resize = d => {
      size = Math.max(20, Math.min(58, size + d));
      LSs('wm_size', size);
      ly.style.fontSize = size + 'px';
      poke();
    };

    const close = () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(hideT);
      letGo();
      lock(false);
      const goto = list[i]?.id;
      wm = null;
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (goto && goto !== id) location.hash = '#/song/' + encodeURIComponent(goto);
    };

    const onKey = e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else if (e.key === '+' || e.key === '=') resize(3);
      else if (e.key === '-') resize(-3);
    };

    const act = {
      close,
      prev: () => go(-1),
      next: () => go(1),
      bigger: () => resize(3),
      smaller: () => resize(-3),
      lang: () => {
        const s = list[i];
        const ks = Object.keys(s.lyrics || {});
        if (ks.length > 1) {
          const nextIdx = (ks.indexOf(keyOf(s)) + 1) % ks.length;
          LSs('lang', ks[nextIdx]);
          render();
          poke();
        }
      }
    };

    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (b) act[b.dataset.a]();
    });

    stage.addEventListener('click', () => {
      if (el.classList.toggle('hide')) clearTimeout(hideT);
      else poke();
    });

    let sx = 0, sy = 0;
    stage.addEventListener('touchstart', e => {
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    }, { passive: true });

    stage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dy) < 70) {
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: true });

    document.addEventListener('keydown', onKey);
    render();
    poke();
  }

  window.MVS_OPEN_WORSHIP = openWorship;
})();
