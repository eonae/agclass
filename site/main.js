// AGClass — поведение страницы. Без зависимостей.
(function () {
  'use strict';
  var root = document.documentElement;
  var worlds = document.getElementById('worlds');
  var grid = worlds && worlds.querySelector('.worlds__grid');
  var mobile = window.matchMedia('(max-width: 899px)');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Английский / Информатика ----------
     Состояние хранится в <html data-at="en|it">. На телефоне CSS показывает
     один курс и закладку на второй; на широком экране видны оба курса.
     Закладка всегда справа: по нажатию второй курс приезжает справа,
     свайпом его можно вытянуть с любой стороны.
     data-reveal у кнопки решает, двигать ли страницу:
       never    — не трогать прокрутку (уличные таблички);
       ifPassed — если блок курсов ушёл вверх, новый курс встаёт началом к верху экрана. */
  var panes = grid ? { en: grid.querySelector('[data-world="en"]'), it: grid.querySelector('[data-world="it"]') } : {};
  var EASE = 'cubic-bezier(.2, .8, .2, 1)';
  var slide = null; // текущее перелистывание: { to, from, inc, out, offset, side, width }; side 1 — новый курс справа, -1 — слева

  function current() { return root.dataset.at === 'it' ? 'it' : 'en'; }
  function other(which) { return which === 'en' ? 'it' : 'en'; }

  function mark(which) {
    document.querySelectorAll('[data-pick][data-go]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.go === which));
    });
  }

  // Ставит курс to рядом с текущим, за краем блока. Возвращает описание перелистывания.
  function begin(to, side) {
    var from = other(to), inc = panes[to], out = panes[from];
    var top = grid.getBoundingClientRect().top;
    inc.classList.add('is-incoming');
    // если блок курсов уже ушёл вверх, новый курс приезжает своим началом к верху экрана
    var room = Math.max(0, inc.offsetHeight - window.innerHeight);
    var offset = Math.max(0, Math.min(-top, room));
    inc.style.cssText = 'position:absolute;left:0;right:0;top:' + offset + 'px;z-index:1';
    grid.classList.add('is-sliding');
    return { to: to, from: from, inc: inc, out: out, offset: offset, side: side, width: grid.clientWidth };
  }

  // dx — сдвиг текущего курса в пикселях, отрицательный — влево.
  function place(s, dx, ms) {
    var t = ms ? 'transform ' + ms + 'ms ' + EASE : 'none';
    s.out.style.transition = t;
    s.inc.style.transition = t;
    s.out.style.transform = 'translate3d(' + dx + 'px,0,0)';
    s.inc.style.transform = 'translate3d(' + (s.side * s.width + dx) + 'px,0,0)';
  }

  function cleanup(s) {
    s.inc.classList.remove('is-incoming');
    s.inc.style.cssText = '';
    s.out.style.cssText = '';
    grid.classList.remove('is-sliding');
    slide = null;
  }

  // Довести перелистывание до конца (done) или вернуть как было.
  function settle(s, done, ms) {
    var target = done ? -s.side * s.width : 0;
    var finish = function () {
      if (done) {
        root.dataset.at = s.to;
        mark(s.to);
        cleanup(s);
        // новый курс встал в поток с верха блока — сдвигаем страницу, чтобы на экране ничего не прыгнуло
        if (s.offset) window.scrollTo({ top: window.scrollY - s.offset, behavior: 'instant' });
      } else {
        cleanup(s);
      }
    };
    if (!ms) { finish(); return; }
    place(s, target, ms);
    var ended = false;
    var end = function () { if (ended) return; ended = true; finish(); };
    s.out.addEventListener('transitionend', end, { once: true });
    setTimeout(end, ms + 80);
  }

  function show(which, reveal, focusAfter) {
    if (!grid || slide) return;
    var animate = mobile.matches && which !== current() && !still.matches;
    if (animate) {
      var s = slide = begin(which, 1);
      place(s, 0, 0);
      grid.offsetWidth; // зафиксировать начальное положение перед переходом
      settle(s, true, 420);
    } else if (which !== current()) {
      var top = grid.getBoundingClientRect().top;
      root.dataset.at = which;
      mark(which);
      if (reveal === 'ifPassed' && top < 0 && mobile.matches) worlds.scrollIntoView({ block: 'start' });
    }
    if (focusAfter) {
      var h = panes[which] && panes[which].querySelector('.world__title');
      if (h) setTimeout(function () { h.focus({ preventScroll: true }); }, animate ? 440 : 0);
    }
  }

  var dragged = false; // клик после перетаскивания не считается нажатием
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (!b) return;
    if (dragged) { dragged = false; e.preventDefault(); return; }
    // фокус стоял на закладке или кнопке внутри курса — после смены курса она пропадёт
    var inside = grid && grid.contains(b);
    show(b.dataset.go, b.dataset.reveal || 'never', inside && e.detail === 0);
  });

  /* ---------- Перелистывание пальцем ----------
     Курс тянут за закладку или свайпом по самому курсу в любую сторону. Вертикальную прокрутку
     ведёт браузер (touch-action: pan-y), горизонтальный жест — наш. */
  if (grid) {
    var g = null; // { id, x, y, t, lastX, lastT, v, mode: 'wait'|'drag' }
    grid.addEventListener('pointerdown', function (e) {
      if (!mobile.matches || slide || g || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragged = false;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, v: 0, mode: 'wait' };
    });
    grid.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (g.mode === 'wait') {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        g.mode = 'drag';
        g.x = e.clientX; dx = 0;
        try { grid.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
        slide = begin(other(current()), dx < 0 ? 1 : -1);
      }
      var s = slide;
      var dt = Math.max(1, e.timeStamp - g.lastT);
      g.v = 0.8 * ((e.clientX - g.lastX) / dt) + 0.2 * g.v;
      g.lastX = e.clientX; g.lastT = e.timeStamp;
      // второй курс тянется за пальцем с той стороны, куда ведут
      if (dx) s.side = dx < 0 ? 1 : -1;
      var shift = Math.max(-s.width, Math.min(s.width, dx));
      place(s, shift, 0);
      g.shift = shift;
      e.preventDefault();
    });
    function release(e, cancelled) {
      if (!g || e.pointerId !== g.id) return;
      var was = g; g = null;
      if (was.mode !== 'drag' || !slide) return;
      dragged = true;
      setTimeout(function () { dragged = false; }, 400);
      var s = slide, shift = was.shift || 0;
      var progress = -s.side * shift / s.width;     // 0…1 — какая доля пути пройдена
      var fling = -s.side * was.v;                  // скорость в сторону второго курса, px/ms
      var done = !cancelled && (progress > 0.28 || (fling > 0.35 && progress > 0.04));
      var left = done ? 1 - progress : Math.max(0, progress);
      settle(s, done, still.matches ? 0 : Math.round(160 + 260 * left));
    }
    grid.addEventListener('pointerup', function (e) { release(e, false); });
    grid.addEventListener('pointercancel', function (e) { release(e, true); });
  }

  mark(current());
  // при переходе между раскладками незаконченное перелистывание сбрасывается
  mobile.addEventListener('change', function () { if (slide) cleanup(slide); });

  /* ---------- Карусель открыток с полосками ---------- */
  var track = document.querySelector('[data-carousel]');
  var bars = document.querySelectorAll('[data-bars] .bar');
  var count = document.querySelector('[data-count]');
  if (track) {
    var cards = Array.prototype.slice.call(track.querySelectorAll('.postcard'));
    var padLeft = function () { return parseFloat(getComputedStyle(track).paddingLeft) || 0; };
    var markCard = function () {
      var left = track.getBoundingClientRect().left + padLeft();
      var best = 0, bestD = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(c.getBoundingClientRect().left - left);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) best = cards.length - 1;
      bars.forEach(function (b, i) {
        if (i === best) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      if (count) count.textContent = (best + 1) + ' из ' + cards.length;
    };
    var raf = 0;
    track.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; markCard(); });
    }, { passive: true });
    bars.forEach(function (b, i) {
      b.addEventListener('click', function () {
        var c = cards[i];
        if (!c) return;
        var dx = c.getBoundingClientRect().left - track.getBoundingClientRect().left - padLeft();
        track.scrollTo({ left: track.scrollLeft + dx, behavior: still.matches ? 'auto' : 'smooth' });
      });
    });
    markCard();
  }

  /* ---------- Часы с лондонским временем ---------- */
  var labels = document.querySelectorAll('[data-london]');
  var hour = document.querySelector('[data-hand="hour"]');
  var min = document.querySelector('[data-hand="min"]');
  var fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (err) { /* старый браузер — покажем UTC */ }
  function tick() {
    var h, m, d = new Date();
    if (fmt) {
      var parts = fmt.formatToParts(d);
      h = Number(parts.find(function (p) { return p.type === 'hour'; }).value);
      m = Number(parts.find(function (p) { return p.type === 'minute'; }).value);
    } else {
      h = d.getUTCHours(); m = d.getUTCMinutes();
    }
    labels.forEach(function (el) { el.textContent = h + ':' + String(m).padStart(2, '0'); });
    if (hour) hour.setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m * 0.5) + ' 60 60)');
    if (min) min.setAttribute('transform', 'rotate(' + (m * 6) + ' 60 60)');
  }
  tick();
  setInterval(tick, 20000);
})();
