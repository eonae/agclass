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
     Закладка всегда справа: по нажатию второй курс приезжает справа. Свайпа нет — только нажатие.
     Любая кнопка с data-go (табличка, закладка, «Посмотреть …») ставит начало курса к верху экрана. */
  var panes = grid ? { en: grid.querySelector('[data-world="en"]'), it: grid.querySelector('[data-world="it"]') } : {};
  var EASE = 'cubic-bezier(.2, .8, .2, 1)';
  var MS = 420;
  var slide = null; // текущее перелистывание: { to, inc, out, offset, width }

  function current() { return root.dataset.at === 'it' ? 'it' : 'en'; }
  function other(which) { return which === 'en' ? 'it' : 'en'; }

  function mark(which) {
    document.querySelectorAll('[data-pick][data-go]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.go === which));
    });
  }

  // Ставит курс to справа от текущего, за краем блока.
  function begin(to) {
    var inc = panes[to], out = panes[other(to)];
    var top = grid.getBoundingClientRect().top;
    inc.classList.add('is-incoming');
    // если блок курсов уже ушёл вверх, новый курс приезжает своим началом к верху экрана
    var room = Math.max(0, inc.offsetHeight - window.innerHeight);
    var offset = Math.max(0, Math.min(-top, room));
    inc.style.cssText = 'position:absolute;left:0;right:0;top:' + offset + 'px;z-index:1';
    grid.classList.add('is-sliding');
    return { to: to, inc: inc, out: out, offset: offset, width: grid.clientWidth };
  }

  // dx — сдвиг текущего курса в пикселях, отрицательный — влево.
  function place(s, dx, ms) {
    var t = ms ? 'transform ' + ms + 'ms ' + EASE : 'none';
    s.out.style.transition = t;
    s.inc.style.transition = t;
    s.out.style.transform = 'translate3d(' + dx + 'px,0,0)';
    s.inc.style.transform = 'translate3d(' + (s.width + dx) + 'px,0,0)';
  }

  function cleanup(s) {
    s.inc.classList.remove('is-incoming');
    s.inc.style.cssText = '';
    s.out.style.cssText = '';
    grid.classList.remove('is-sliding');
    slide = null;
  }

  // Довести перелистывание до конца.
  function settle(s) {
    var ended = false;
    var end = function () {
      if (ended) return;
      ended = true;
      root.dataset.at = s.to;
      mark(s.to);
      cleanup(s);
      // новый курс встал в поток с верха блока — сдвигаем страницу, чтобы на экране ничего не прыгнуло
      if (s.offset) window.scrollTo({ top: window.scrollY - s.offset, behavior: 'instant' });
    };
    place(s, -s.width, MS);
    s.out.addEventListener('transitionend', end, { once: true });
    setTimeout(end, MS + 80);
  }

  // Прокрутить страницу так, чтобы начало блока курсов встало к верху экрана.
  function toStart(smooth) {
    window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY, behavior: smooth ? 'smooth' : 'instant' });
  }

  function show(which, focusAfter) {
    if (!grid || slide) return;
    var animate = mobile.matches && which !== current() && !still.matches;
    if (animate) {
      // блок ниже верха экрана — едем к нему, пока курс листается; ушёл вверх — begin() сам поставит курс началом к верху
      var below = grid.getBoundingClientRect().top > 0;
      var s = slide = begin(which);
      place(s, 0, 0);
      grid.offsetWidth; // зафиксировать начальное положение перед переходом
      settle(s);
      if (below) toStart(true);
    } else {
      if (which !== current()) { root.dataset.at = which; mark(which); }
      toStart(!still.matches);
    }
    if (focusAfter) {
      var h = panes[which] && panes[which].querySelector('.world__title');
      if (h) setTimeout(function () { h.focus({ preventScroll: true }); }, animate ? MS + 20 : 0);
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (!b) return;
    // фокус стоял на закладке или кнопке внутри курса — после смены курса она пропадёт
    var inside = grid && grid.contains(b);
    show(b.dataset.go, inside && e.detail === 0);
  });

  mark(current());
  // при переходе между раскладками незаконченное перелистывание сбрасывается
  mobile.addEventListener('change', function () { if (slide) cleanup(slide); });

  /* ---------- Карусель открыток ----------
     Лента циклическая: по краям стоят копии всех открыток. Стрелка, клавиша ← → или свайп
     сдвигают её ровно на одну открытку; уехав в копии, лента незаметно перескакивает на оригиналы. */
  var view = document.querySelector('.carousel__view');
  var track = view && view.querySelector('[data-track]');
  if (track) {
    var originals = Array.prototype.slice.call(track.children);
    var n = originals.length;
    var tilts = originals.map(function (c) { return getComputedStyle(c).getPropertyValue('--tilt'); });
    var copy = function (c) {
      var k = c.cloneNode(true);
      k.setAttribute('aria-hidden', 'true');
      k.inert = true;
      return k;
    };
    originals.forEach(function (c) { track.appendChild(copy(c)); });
    originals.slice().reverse().forEach(function (c) { track.insertBefore(copy(c), track.firstChild); });
    // наклон задан по :nth-child — после копий порядок сдвинулся, закрепляем его за открыткой
    Array.prototype.forEach.call(track.children, function (c, i) { c.style.setProperty('--tilt', tilts[i % n]); });

    var at = 0;       // индекс открытки у левого края окна, 0…n-1 (во время анимации может выйти за пределы)
    var step = 0;     // ширина открытки + промежуток
    var measure = function () { step = track.children[1].offsetLeft - track.children[0].offsetLeft; };
    var put = function (dx, ms) {
      track.style.transition = ms ? 'transform ' + ms + 'ms ' + EASE : 'none';
      track.style.transform = 'translate3d(' + (-(n + at) * step + dx) + 'px,0,0)';
    };
    var wrapAt = function () {
      if (at >= 0 && at < n) return;
      at = ((at % n) + n) % n;
      put(0, 0);
    };
    var go = function (d) {
      // при частых нажатиях не перескакиваем посреди анимации, пока хватает копий
      if (at + d < 1 - n || at + d > 2 * n - 2) wrapAt();
      at += d;
      var ms = still.matches ? 0 : 420;
      put(0, ms);
      if (!ms) wrapAt();
    };
    track.addEventListener('transitionend', function (e) { if (e.target === track) wrapAt(); });

    document.querySelectorAll('.carousel__arrow').forEach(function (b) {
      b.addEventListener('click', function () { go(Number(b.dataset.step)); });
    });
    view.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1); }
    });

    // свайп: лента идёт за пальцем, отпустили — едет ровно на одну открытку или возвращается
    var p = null; // { id, x, y, dx, v, lastX, lastT, drag }
    view.addEventListener('pointerdown', function (e) {
      if (p || (e.pointerType === 'mouse' && e.button !== 0)) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, v: 0, lastX: e.clientX, lastT: e.timeStamp, drag: false };
    });
    view.addEventListener('pointermove', function (e) {
      if (!p || e.pointerId !== p.id) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.drag) {
        if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
        p.drag = true; p.x = e.clientX; dx = 0;
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
        wrapAt();
      }
      var dt = Math.max(1, e.timeStamp - p.lastT);
      p.v = 0.8 * ((e.clientX - p.lastX) / dt) + 0.2 * p.v;
      p.lastX = e.clientX; p.lastT = e.timeStamp;
      p.dx = Math.max(-step, Math.min(step, dx));
      put(p.dx, 0);
      e.preventDefault();
    });
    var drop = function (e, cancelled) {
      if (!p || e.pointerId !== p.id) return;
      var was = p; p = null;
      if (!was.drag) return;
      var d = 0;
      if (!cancelled && (Math.abs(was.dx) > step * 0.2 || (Math.abs(was.v) > 0.35 && Math.abs(was.dx) > 12))) d = was.dx < 0 ? 1 : -1;
      at += d;
      var ms = still.matches ? 0 : Math.round(160 + 260 * (d ? 1 - Math.abs(was.dx) / step : Math.abs(was.dx) / step));
      put(0, ms);
      if (!ms) wrapAt();
    };
    view.addEventListener('pointerup', function (e) { drop(e, false); });
    view.addEventListener('pointercancel', function (e) { drop(e, true); });

    var relayout = function () { measure(); wrapAt(); put(0, 0); };
    window.addEventListener('resize', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    relayout();
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
