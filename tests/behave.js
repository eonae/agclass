const { chromium, webkit } = require('playwright');
const out = process.argv[3] || '.'; const BASE = process.argv[2] || 'http://localhost:8000/';
const ok = (c, m) => console.log((c ? 'OK   ' : 'FAIL ') + m);
(async () => {
  for (const engine of [chromium, webkit]) {
    console.log('==', engine.name());
    const b = await engine.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: engine.name() === 'chromium', deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'networkidle' });
    const at = () => p.evaluate(() => document.documentElement.dataset.at);
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(sw[0] <= sw[1], `нет горизонтальной прокрутки: ${sw}`);
    // уличная табличка
    await p.evaluate(() => document.querySelector('.plate--it').scrollIntoView({ block: 'center' }));
    const gridTop = () => p.evaluate(() => Math.round(document.querySelector('.worlds__grid').getBoundingClientRect().top));
    await p.tap('.plate--it'); await p.waitForTimeout(1000);
    const g1 = await gridTop();
    ok(await at() === 'it' && Math.abs(g1) <= 1, `табличка: курс it, начало курса у верха экрана (top ${g1})`);
    ok(await p.evaluate(() => document.querySelector('.plate--it').getAttribute('aria-pressed')) === 'true', 'aria-pressed у таблички');
    await p.evaluate(() => document.querySelector('.plate--en').scrollIntoView({ block: 'center' }));
    await p.tap('.plate--en'); await p.waitForTimeout(1000);
    const g2 = await gridTop();
    ok(await at() === 'en' && Math.abs(g2) <= 1, `табличка назад: en, top ${g2}`);
    // закладка в середине курса
    await p.evaluate(() => { const g = document.querySelector('.worlds__grid'); scrollTo(0, g.getBoundingClientRect().top + scrollY + 900); });
    await p.waitForTimeout(100);
    const tab = await p.evaluate(() => { const r = document.querySelector('.tab--it').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.right), Math.round(r.height)]; });
    ok(tab[0] === 26 && tab[1] >= 370, `закладка прилипла у верха: top ${tab[0]}, right ${tab[1]}, h ${tab[2]}`);
    await p.screenshot({ path: `${out}/m-${engine.name()}-tab.png` });
    await p.tap('.tab--it'); await p.waitForTimeout(700);
    const gt = await p.evaluate(() => Math.round(document.querySelector('.worlds__grid').getBoundingClientRect().top));
    ok(await at() === 'it' && Math.abs(gt) <= 1, `закладка: курс it, начало курса у верха экрана (top ${gt})`);
    const tabEn = await p.evaluate(() => Math.round(document.querySelector('.tab--en').getBoundingClientRect().right));
    ok(tabEn >= 370, `закладка английского тоже справа: right ${tabEn}`);
    await p.screenshot({ path: `${out}/m-${engine.name()}-it.png` });
    // видна ли кромка второго курса
    const leak = await p.evaluate(() => { const e = document.querySelector('.world--en'); return getComputedStyle(e).display; });
    ok(leak === 'none', 'английский скрыт полностью');
    // свайп по курсу ничего не переключает — только нажатие
    const cdp = engine.name() === 'chromium' ? await ctx.newCDPSession(p) : null;
    async function swipe(x0, x1, y, steps = 12) {
      if (cdp) {
        const t = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        await t('touchStart', x0);
        for (let i = 1; i <= steps; i++) { await t('touchMove', x0 + (x1 - x0) * i / steps); await p.waitForTimeout(steps > 20 ? 40 : 16); }
        await t('touchEnd', x1);
      } else {
        await p.mouse.move(x0, y); await p.mouse.down();
        for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (x1 - x0) * i / steps, y); await p.waitForTimeout(steps > 20 ? 40 : 16); }
        await p.mouse.up();
      }
      await p.waitForTimeout(700);
    }
    await swipe(80, 330, 400);
    ok(await at() === 'it', 'свайп вправо по курсу не переключает');
    await swipe(330, 60, 400);
    ok(await at() === 'it', 'свайп влево по курсу не переключает');
    await p.tap('.tab--en'); await p.waitForTimeout(700);
    ok(await at() === 'en', 'закладка: обратно en');
    // вертикальная прокрутка тачем
    const v0 = await p.evaluate(() => scrollY);
    if (cdp) {
      await cdp.send('Input.synthesizeScrollGesture', { x: 200, y: 600, yDistance: -400, speed: 2000 });
      await p.waitForTimeout(300);
      const v1 = await p.evaluate(() => scrollY);
      ok(v1 > v0 + 200 && await at() === 'en', `вертикальная прокрутка по курсу работает: ${v0} → ${v1}`);
    }
    // карусель открыток: стрелки и свайп сдвигают на одну, лента циклическая
    await p.evaluate(() => document.querySelector('#reviews').scrollIntoView());
    await p.waitForTimeout(200);
    const card = () => p.evaluate(() => { const v = document.querySelector('.carousel__view').getBoundingClientRect();
      const c = [...document.querySelectorAll('.carousel__track .postcard')].find(c => { const r = c.getBoundingClientRect(); return r.left >= v.left && r.right <= v.right; });
      return c && c.querySelector('figcaption').textContent; });
    const names = await p.evaluate(() => [...document.querySelectorAll('.carousel__track .postcard:not([aria-hidden])')].map(c => c.querySelector('figcaption').textContent));
    ok(await card() === names[0], 'карусель: сначала первая открытка');
    await p.tap('.carousel__arrow--next'); await p.waitForTimeout(600);
    ok(await card() === names[1], 'стрелка вправо: вторая открытка');
    await p.tap('.carousel__arrow:first-child'); await p.waitForTimeout(600);
    await p.tap('.carousel__arrow:first-child'); await p.waitForTimeout(600);
    ok(await card() === names[names.length - 1], 'стрелка влево с первой: последняя (лента по кругу)');
    if (cdp) {
      const y = await p.evaluate(() => { const r = document.querySelector('.carousel__view').getBoundingClientRect(); return r.top + r.height / 2; });
      await swipe(340, 40, y);
      ok(await card() === names[0], 'длинный свайп влево сдвигает ровно на одну: с последней на первую');
    }
    ok(await p.evaluate(() => !document.querySelector('.carousel__bars, [data-count]')), 'полосок и счётчика нет');
    const sw2 = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(sw2[0] <= sw2[1], `после перелистываний нет горизонтальной прокрутки: ${sw2}`);
    ok(errs.length === 0, 'ошибок JS нет ' + errs.join('; '));
    await b.close();
  }
  // без JS
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })).newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ['.world--en', '.world--it', '.tabs', '#contacts', '.carousel__arrow'].map(s => getComputedStyle(document.querySelector(s)).display));
  ok(r[0] !== 'none' && r[3] !== 'none' && r[2] === 'none', 'без JS: английский и контакты видны, закладок нет: ' + r);
  ok(r[4] === 'none' && await p.evaluate(() => getComputedStyle(document.querySelector('.carousel__view')).overflowX) === 'auto', 'без JS: открытки листаются прокруткой, стрелок нет');
  // reduced motion: мгновенно
  const p2 = await (await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true })).newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.evaluate(() => document.querySelector('.plate--it').scrollIntoView({ block: 'center' }));
  await p2.tap('.plate--it');
  const rm = await p2.evaluate(() => [document.documentElement.dataset.at, Math.round(document.querySelector('.worlds__grid').getBoundingClientRect().top)]);
  ok(rm[0] === 'it' && Math.abs(rm[1]) <= 1, 'reduced motion: переключение и прокрутка сразу: ' + rm);
  await b.close();
})();
