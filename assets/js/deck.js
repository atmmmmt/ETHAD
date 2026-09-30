/* ==========================================================================
   AHLI ALEPPO — DIGITAL CLUB SYSTEM · Deck engine + slide interactions
   All figures on "mock" slides are illustrative sample data.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const icon = (id, style = '') => `<svg class="i" style="${style}"><use href="#${id}"/></svg>`;

  const stage = $('#stage');
  const slides = $$('.slide', stage);
  const total = slides.length;
  let current = 0;
  let scale = 1;

  /* ------------------------------------------------------------------
     Slide chrome: header + footer injected from data attributes
     ------------------------------------------------------------------ */
  slides.forEach((s, i) => {
    if (!s.hasAttribute('data-bare')) {
      const head = document.createElement('div');
      head.className = 's-head';
      head.innerHTML = `
        <span class="tag"><span class="stripe"><i></i><i></i><i></i></span>${s.dataset.chapter || ''}</span>
        <span class="brand"><img src="assets/img/crest-ittihad.png" alt="">AL-AHLI SC · DIGITAL CLUB SYSTEM</span>`;
      s.prepend(head);

      const foot = document.createElement('div');
      foot.className = 's-foot';
      const note = s.dataset.note || 'المنظومة الرقمية — نادي الأهلي · الاتحاد الحلبي';
      const mock = s.hasAttribute('data-mock') ? '<span class="mock-badge">بيانات توضيحية للعرض</span>' : '';
      foot.innerHTML = `<span style="display:flex;gap:16px;align-items:center">${mock}<span>${note}</span></span><span class="pg">${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>`;
      s.append(foot);
    }
    $$('[data-a]', s).forEach((el, k) => el.style.setProperty('--i', k));
  });

  /* ------------------------------------------------------------------
     Scale the 1920×1080 stage to the viewport
     ------------------------------------------------------------------ */
  function fit() {
    scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
  window.addEventListener('resize', fit);
  fit();

  /* ------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------ */
  const enterHooks = {};
  const progressBar = $('#progressBar');
  const countEl = $('#count');
  const chapEl = $('#chapLabel');

  function go(n, { instant = false } = {}) {
    n = Math.max(0, Math.min(total - 1, n));
    const prev = current;
    current = n;
    slides.forEach((s, i) => {
      s.classList.toggle('is-active', i === n);
      s.classList.toggle('is-before', i < n);
      if (instant) s.style.transition = 'none';
    });
    if (instant) requestAnimationFrame(() => slides.forEach((s) => (s.style.transition = '')));
    progressBar.style.width = ((n + 1) / total) * 100 + '%';
    countEl.textContent = `${n + 1} / ${total}`;
    chapEl.textContent = slides[n].dataset.chapter || '';
    if (location.hash !== '#' + (n + 1)) history.replaceState(null, '', '#' + (n + 1));
    const hook = slides[n].dataset.enter;
    if (hook && enterHooks[hook] && (prev !== n || instant)) enterHooks[hook](slides[n]);
    // count-up numbers on any slide
    $$('[data-count]', slides[n]).forEach(countUp);
    markIndex();
  }
  const next = () => go(current + 1);
  const prev = () => go(current - 1);

  $('#btnNext').addEventListener('click', next);
  $('#btnPrev').addEventListener('click', prev);

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.key === 'Escape') { closeIndex(); return; }
    if (typing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        if (e.key === 'Enter' && t && t.tagName === 'BUTTON') return;
        e.preventDefault(); next(); break;
      case 'ArrowRight': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(total - 1); break;
      case 'f': case 'F': toggleFull(); break;
      case 'g': case 'G': toggleIndex(); break;
      case 'p': case 'P': window.print(); break;
    }
  });

  // touch swipe (RTL: finger moving right → next)
  let tx = null, ty = null;
  window.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx > 0 ? next : prev)();
    tx = ty = null;
  });

  window.addEventListener('hashchange', () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (!isNaN(n) && n - 1 !== current) go(n - 1);
  });

  // jump links (agenda)
  $$('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      const target = document.getElementById(b.dataset.goto);
      if (target) go(slides.indexOf(target));
    })
  );

  // fullscreen
  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }
  $('#btnFull').addEventListener('click', toggleFull);

  // auto-hide controls when idle
  const controls = $('#controls');
  let idleT;
  function wake() {
    controls.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!controls.matches(':hover')) controls.classList.add('idle'); }, 2600);
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
  wake();

  /* ------------------------------------------------------------------
     Index panel
     ------------------------------------------------------------------ */
  const indexPanel = $('#indexPanel');
  const indexCols = $('#indexCols');
  (function buildIndex() {
    const groups = new Map();
    slides.forEach((s, i) => {
      const ch = s.dataset.chapter || '';
      if (!groups.has(ch)) groups.set(ch, []);
      groups.get(ch).push([i, s.dataset.title || '']);
    });
    groups.forEach((items, ch) => {
      const g = document.createElement('div');
      g.className = 'grp';
      g.innerHTML = `<h4>${ch}</h4>` + items.map(([i, t]) => `<button data-i="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${t}</button>`).join('');
      indexCols.append(g);
    });
    indexCols.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      go(+b.dataset.i);
      closeIndex();
    });
  })();
  function markIndex() { $$('button[data-i]', indexCols).forEach((b) => b.classList.toggle('cur', +b.dataset.i === current)); }
  function toggleIndex() { indexPanel.classList.toggle('open'); }
  function closeIndex() { indexPanel.classList.remove('open'); }
  $('#btnIndex').addEventListener('click', toggleIndex);
  $('#indexClose').addEventListener('click', closeIndex);

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function countUp(el) {
    const target = +el.dataset.count;
    const prefix = el.dataset.prefix || '';
    const dur = 1300;
    const t0 = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * e).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // convert a client (screen) point to stage-local coordinates of an element
  function localPoint(el, clientX, clientY) {
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  /* ------------------------------------------------------------------
     Cash-flow line chart (single series: net liquidity, $k)
     ------------------------------------------------------------------ */
  const cashData = [
    { m: 'نيسان', v: 168 }, { m: 'أيار', v: 175 }, { m: 'حزيران', v: 197 },
    { m: 'تموز', v: 219 }, { m: 'آب', v: 211 }, { m: 'أيلول', v: 186.4 },
    { m: 'ت1', v: 162, f: true }, { m: 'ت2', v: 171, f: true }, { m: 'ك1', v: 183, f: true },
  ];

  function lineChart(wrap, data, { ticks = [150, 175, 200, 225], lo = 140, hi = 230, fontSize = 12, hover = true } = {}) {
    const W = wrap.offsetWidth || 600, H = wrap.offsetHeight || 220;
    const m = { t: 18, r: 18, b: 26, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (i) => m.l + (i / (data.length - 1)) * iw;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
    const lastActual = data.findIndex((d) => d.f) - 1;
    const pts = data.map((d, i) => [x(i), y(d.v)]);
    const path = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const actual = pts.slice(0, lastActual + 1);
    const fc = pts.slice(lastActual);
    const area = path(actual) + ` L ${actual[actual.length - 1][0]} ${m.t + ih} L ${actual[0][0]} ${m.t + ih} Z`;

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="صافي السيولة الشهري">`;
    ticks.forEach((t) => {
      svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="#EFECE9" stroke-width="1"/>`;
      svg += `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="${fontSize}" fill="#777277" font-family="Cairo">${t}</text>`;
    });
    // forecast band
    svg += `<rect x="${x(lastActual)}" y="${m.t}" width="${x(data.length - 1) - x(lastActual)}" height="${ih}" fill="#F7F5F3"/>`;
    svg += `<text x="${(x(lastActual) + x(data.length - 1)) / 2}" y="${m.t + 12}" text-anchor="middle" font-size="${fontSize}" fill="#777277" font-family="Cairo" font-weight="600">توقع</text>`;
    data.forEach((d, i) => {
      svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="${fontSize}" fill="#777277" font-family="Cairo">${d.m}</text>`;
    });
    svg += `<path d="${area}" fill="#D71920" opacity=".1"/>`;
    svg += `<path class="cf-line" d="${path(actual)}" fill="none" stroke="#D71920" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<path d="${path(fc)}" fill="none" stroke="#D71920" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" opacity=".7"/>`;
    const lp = pts[lastActual];
    svg += `<circle cx="${lp[0]}" cy="${lp[1]}" r="5" fill="#D71920" stroke="#fff" stroke-width="2"/>`;
    svg += `<text x="${lp[0]}" y="${lp[1] - 12}" text-anchor="middle" font-size="${fontSize + 1}" font-weight="700" fill="#0B0B0D" font-family="Cairo">$${data[lastActual].v}k</text>`;
    svg += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="#0B0B0D" stroke-width="1" opacity="0"/>`;
    svg += `<circle class="hd" r="5" fill="#D71920" stroke="#fff" stroke-width="2" opacity="0"/>`;
    svg += `</svg><div class="tip"></div>`;
    wrap.innerHTML = svg;

    // draw-in animation for the actual line
    const ln = $('.cf-line', wrap);
    const len = ln.getTotalLength ? ln.getTotalLength() : 1000;
    ln.style.strokeDasharray = len;
    ln.style.strokeDashoffset = len;
    ln.getBoundingClientRect();
    ln.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1) .3s';
    wrap._animate = () => {
      ln.style.transition = 'none';
      ln.style.strokeDashoffset = len;
      ln.getBoundingClientRect();
      ln.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1) .3s';
      ln.style.strokeDashoffset = 0;
    };

    if (!hover) return;
    const tip = $('.tip', wrap), xh = $('.xh', wrap), hd = $('.hd', wrap);
    wrap.addEventListener('mousemove', (e) => {
      const p = localPoint(wrap, e.clientX, e.clientY);
      let i = Math.round(((p.x - m.l) / iw) * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      const [px, py] = pts[i];
      xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('opacity', '.15');
      hd.setAttribute('cx', px); hd.setAttribute('cy', py); hd.setAttribute('opacity', '1');
      tip.innerHTML = `${data[i].m} 2026 · ${data[i].f ? 'توقع' : 'فعلي'}<br><b>$${data[i].v}k</b> صافي السيولة`;
      tip.style.left = px + 'px'; tip.style.top = py - 8 + 'px'; tip.style.opacity = 1;
    });
    wrap.addEventListener('mouseleave', () => { tip.style.opacity = 0; xh.setAttribute('opacity', '0'); hd.setAttribute('opacity', '0'); });
  }

  const cashWrap = $('#cashChart');
  const miniWrap = $('#miniChart');
  lineChart(cashWrap, cashData);
  lineChart(miniWrap, cashData, { fontSize: 12 });

  /* ------------------------------------------------------------------
     Dashboard drill-down
     ------------------------------------------------------------------ */
  const drillData = {
    cash: { t: 'إجمالي السيولة — حسب الحساب', total: 186400, rows: [
      ['الحساب البنكي 1 — دولار', 'بنك', 98400], ['الحساب البنكي 2 — دولار', 'بنك', 44500],
      ['الصندوق الرئيسي', 'صندوق', 31200], ['صندوق كرة القدم', 'صندوق', 7800], ['صندوق كرة السلة', 'صندوق', 4500]] },
    rev: { t: 'الإيرادات · أيلول — حسب المصدر', total: 71800, rows: [
      ['الرعاية والإعلان', '3 عقود', 32000], ['عقود الاستثمار', '5 مستثمرين', 21500], ['التذاكر والمباريات', 'مباراتان', 9800],
      ['المتجر', '214 طلبًا', 5200], ['اشتراكات وأخرى', '', 3300]] },
    exp: { t: 'المصروف · أيلول — حسب مركز التكلفة', total: 96300, rows: [
      ['كرة القدم', '78% من الموازنة المرحلية', 41200], ['كرة السلة', '', 18600], ['الإدارة والموظفون', '', 14300],
      ['الإعلام والتسويق', '', 9700], ['المنشآت والصيانة', '', 7100], ['الأكاديمية', '', 5400]] },
    obl: { t: 'التزامات 30 يومًا — ما الذي يستحق؟', total: 74000, rows: [
      ['رواتب اللاعبين', 'تستحق 05/10', 38500], ['رواتب الموظفين والجهاز الإداري', 'تستحق 05/10', 14200],
      ['موردون — 3 فواتير', 'بين 08/10 و 22/10', 9800], ['دفعة عقد المعسكر الشتوي', 'تستحق 15/10', 7500], ['ضرائب ورسوم', 'تستحق 25/10', 4000]] },
    inv: { t: 'مستثمرون متأخرون', total: 33500, rows: [
      ['المحلات التجارية — المدخل الشرقي', 'متأخر 46 يومًا', 18000], ['اللوحات الإعلانية — الملعب', 'متأخر 12 يومًا', 9500], ['استثمار الكافتيريا', 'متأخر 3 أيام', 6000]] },
  };
  const drill = $('#drill');
  $$('#kpis .kpi').forEach((k) =>
    k.addEventListener('click', () => {
      const d = drillData[k.dataset.drill];
      const wasOn = k.classList.contains('on');
      $$('#kpis .kpi').forEach((x) => x.classList.remove('on'));
      if (wasOn) { drill.classList.remove('open'); return; }
      k.classList.add('on');
      $('#drillTitle').textContent = d.t;
      $('#drillTotal').textContent = fmt(d.total);
      $('#drillRows').innerHTML = d.rows.map(([n, meta, v]) => {
        const pct = Math.round((v / d.total) * 100);
        return `<div class="r" style="font-size:16px"><span>${n}${meta ? `<span class="meta">${meta}</span>` : ''}</span>
          <span style="display:flex;align-items:center;gap:14px"><span style="width:160px;height:8px;background:#F0EDEA;border-radius:4px;position:relative;overflow:hidden"><i style="position:absolute;inset:0 0 0 auto;width:${pct}%;background:#0B0B0D;border-radius:4px"></i></span><span class="v" style="min-width:90px;text-align:left">${fmt(v)}</span></span></div>`;
      }).join('') + `<div class="r" style="font-size:14px;color:var(--muted)"><span>كل بند يفتح المستندات والحركات المرتبطة به</span>${icon('file')}</div>`;
      drill.classList.add('open');
    })
  );
  $('#drillClose').addEventListener('click', () => { drill.classList.remove('open'); $$('#kpis .kpi').forEach((x) => x.classList.remove('on')); });

  enterHooks.dash = (s) => {
    $$('#dashBars .fill', s).forEach((f) => { f.style.transition = 'none'; f.style.width = '0'; });
    requestAnimationFrame(() => requestAnimationFrame(() =>
      $$('#dashBars .fill', s).forEach((f, i) => { f.style.transition = `width 1.2s cubic-bezier(.2,.7,.2,1) ${0.5 + i * 0.08}s`; f.style.width = f.dataset.w + '%'; })
    ));
    cashWrap._animate && cashWrap._animate();
  };

  /* ------------------------------------------------------------------
     20-second vision
     ------------------------------------------------------------------ */
  const ringProg = $('#ringProg'), ringNum = $('#ringNum'), ringBtn = $('#ringBtn');
  const CIRC = 552.9;
  let ringTimer = null;
  function resetTwenty() {
    clearInterval(ringTimer); ringTimer = null;
    ringProg.style.strokeDashoffset = CIRC;
    ringNum.textContent = '20';
    $$('#questions li').forEach((li) => li.classList.remove('on'));
    ringBtn.innerHTML = icon('play') + ' ابدأ التجربة';
  }
  ringBtn.addEventListener('click', () => {
    resetTwenty();
    const lis = $$('#questions li');
    const t0 = performance.now();
    ringNum.textContent = '0';
    ringBtn.innerHTML = icon('clock') + ' جارٍ…';
    ringTimer = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      ringNum.textContent = Math.min(20, Math.floor(el));
      ringProg.style.strokeDashoffset = CIRC * (1 - Math.min(el, 20) / 20);
      const answered = Math.min(lis.length, Math.floor(el / 1.45));
      lis.forEach((li, i) => li.classList.toggle('on', i < answered));
      if (answered >= lis.length) {
        clearInterval(ringTimer); ringTimer = null;
        ringBtn.innerHTML = icon('refresh') + ` ${lis.length} إجابة في ${Math.ceil(el)} ثانية — أعد`;
      }
    }, 100);
  });
  enterHooks.twenty = resetTwenty;

  /* ------------------------------------------------------------------
     Digital Club OS hub
     ------------------------------------------------------------------ */
  (function buildHub() {
    const hub = $('#hub'), lines = $('#hubLines');
    const nodes = [
      ['الموازنة', 'BUDGET'], ['المستثمرون', 'INVESTORS'], ['العقود', 'CONTRACTS'], ['الرواتب', 'PAYROLL'],
      ['الموظفون', 'HR'], ['المشتريات', 'PROCUREMENT'], ['الموردون', 'SUPPLIERS'], ['المستودعات', 'INVENTORY'],
      ['الأصول', 'ASSETS'], ['كرة القدم', 'FOOTBALL'], ['كرة السلة', 'BASKETBALL'], ['الموقع والمتجر', 'WEB · STORE'],
    ];
    const cx = 390, cy = 390, R = 305;
    let l = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#E5E1DD" stroke-width="1"/>`;
    l += `<circle cx="${cx}" cy="${cy}" r="${R - 110}" fill="none" stroke="#EFECE9" stroke-width="1"/>`;
    nodes.forEach(([ar, en], i) => {
      const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      l += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#D71920" stroke-opacity=".22" stroke-width="1.5"/>`;
      const n = document.createElement('div');
      n.className = 'node';
      n.style.left = x + 'px'; n.style.top = y + 'px';
      n.innerHTML = `${ar}<small>${en}</small>`;
      hub.append(n);
    });
    lines.innerHTML = l;
  })();

  /* ------------------------------------------------------------------
     Operational / Executive mode toggle
     ------------------------------------------------------------------ */
  const modeCopy = {
    op: { t: 'وضع التشغيل', d: 'للمحاسب والموظفين — يشبه برامج سطح المكتب التي اعتادوا عليها، لكن بواجهة ويب حديثة.',
      li: ['جداول كثيفة وواضحة: بحث، فلترة، ترتيب', 'اختصارات لوحة مفاتيح لكل عملية', 'إدخال سريع بلا حركات زائدة', 'تصدير Excel و PDF'],
      who: ['المحاسب', 'الموارد البشرية', 'المستودع', 'المشتريات'], url: 'erp.club / finance / journal' },
    ex: { t: 'الوضع التنفيذي', d: 'للإدارة — الملخص أولًا، ثم التفاصيل عند الحاجة فقط.',
      li: ['مؤشرات ورسوم بيانية وتنبيهات', 'الموازنة مقابل الفعلي لكل قسم', 'من أي رقم إلى مستنداته بضغطة', 'على الهاتف: الموافقات والتنبيهات والملخص'],
      who: ['رئيس مجلس الإدارة', 'المدير التنفيذي', 'المدير المالي'], url: 'erp.club / executive' },
  };
  function setMode(m) {
    const c = modeCopy[m];
    $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#modeText').innerHTML = `<h3>${c.t}</h3><p class="small" style="font-size:21px">${c.d}</p><ul>${c.li.map((x) => `<li>${x}</li>`).join('')}</ul><div class="who">${c.who.map((w) => `<span class="pill">${w}</span>`).join('')}</div>`;
    $('#paneOp').classList.toggle('hide', m !== 'op');
    $('#paneEx').classList.toggle('hide', m !== 'ex');
    $('#modeUrl').textContent = c.url;
    if (m === 'ex' && miniWrap._animate) miniWrap._animate();
  }
  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setMode('op');

  /* ------------------------------------------------------------------
     Budget slider
     ------------------------------------------------------------------ */
  const B = 40000;
  const bRange = $('#bRange');
  function updBudget() {
    const a = +bRange.value;
    const p = a / B;
    const pct = Math.round(p * 100);
    $('#bAmount').textContent = fmt(a);
    $('#bAct').textContent = fmt(a);
    const diff = B - a;
    $('#bDiff').textContent = (diff < 0 ? '−' : '') + fmt(Math.abs(diff));
    $('#bDiff').style.color = diff < 0 ? 'var(--danger)' : '';
    $('#bPct').textContent = pct + '%';
    $('#bPctPill').textContent = pct + '%';
    const fill = $('#bFill');
    fill.style.width = (a / +bRange.max) * 100 + '%';
    const al = $('#bAlert');
    al.className = 'alert';
    let txt, col;
    if (p >= 1) { al.classList.add('over'); col = 'var(--danger)'; txt = 'تجاوز الموازنة: أي صرف جديد يتطلب موافقة الإدارة التنفيذية.'; }
    else if (p >= 0.85) { al.classList.add('high'); col = '#B45309'; txt = 'تنبيه ثانٍ (85%): إشعار للمدير المالي ومراجعة المصروف القادم.'; }
    else if (p >= 0.7) { al.classList.add('warn'); col = 'var(--warning)'; txt = 'تنبيه أول (70%): إشعار لمدير كرة القدم.'; }
    else { col = 'var(--success)'; txt = 'ضمن الموازنة — لا تنبيهات.'; }
    fill.style.background = col;
    $('#bAlertText').textContent = txt;
    $('#bPctPill').className = 'pill ' + (p >= 1 ? 'red' : p >= 0.7 ? 'amber' : 'green');
  }
  bRange.addEventListener('input', updBudget);
  enterHooks.budget = () => {
    // animate from 0 to a sample value to show the alert thresholds at work
    const target = 30500;
    const t0 = performance.now();
    (function step(t) {
      const p = Math.min(1, (t - t0) / 1400);
      bRange.value = Math.round((target * (1 - Math.pow(1 - p, 3))) / 500) * 500;
      updBudget();
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  };
  updBudget();

  /* ------------------------------------------------------------------
     Contracts expiring
     ------------------------------------------------------------------ */
  const expData = {
    30: [
      ['عقد لاعب — المهاجم رقم 9', 'لاعبون', '25/10/2026', 48000, ['red', 'قرار تجديد مطلوب']],
      ['خدمة الحراسة والأمن', 'خدمات', '18/10/2026', 6600, ['red', 'ينتهي خلال 18 يومًا']],
      ['رعاية الواجهة الخلفية للقميص', 'رعاة', '28/10/2026', 25000, ['amber', 'تفاوض جارٍ']],
    ],
    60: [
      ['مدرب اللياقة — كرة السلة', 'مدربون', '15/11/2026', 14400, ['amber', 'بانتظار التقييم']],
      ['مورد التجهيزات الرياضية', 'موردون', '20/11/2026', 32000, ['amber', 'طلب عروض جديدة']],
      ['إيجار المحل رقم 4', 'مستأجرون', '29/11/2026', 9000, ['green', 'تجديد تلقائي']],
    ],
    90: [
      ['استثمار الكافتيريا', 'مستثمرون', '10/12/2026', 36000, ['red', 'دفعة متأخرة']],
      ['صيانة المصاعد والمولدة', 'خدمات', '22/12/2026', 7200, ['green', 'تجديد تلقائي']],
      ['عقد لاعب — لاعب الارتكاز رقم 6', 'لاعبون', '31/12/2026', 42000, ['amber', 'قرار فني']],
      ['خدمة الإنترنت', 'خدمات', '28/12/2026', 1440, ['', 'مراجعة البدائل']],
    ],
  };
  function renderExp(d) {
    $$('#expSeg button').forEach((b) => b.classList.toggle('on', b.dataset.d === String(d)));
    $('#expList').innerHTML = expData[d].map(([n, type, end, v, [c, st]], i) =>
      `<div class="exp-item" style="animation-delay:${i * 60}ms"><span><b>${n}</b><small>${type}</small></span><span><small>تاريخ الانتهاء</small><span class="en">${end}</span></span><span class="v">${fmt(v)}</span><span class="pill ${c}">${st}</span></div>`
    ).join('');
  }
  $$('#expSeg button').forEach((b) => b.addEventListener('click', () => renderExp(+b.dataset.d)));
  enterHooks.contracts = () => renderExp(30);
  renderExp(30);

  /* ------------------------------------------------------------------
     Payroll calculator
     ------------------------------------------------------------------ */
  function calcPay() {
    let net = 0;
    $$('.pay').forEach((inp) => {
      const v = parseFloat(String(inp.value).replace(/[^\d.]/g, '')) || 0;
      net += v * +inp.dataset.sign;
    });
    const el = $('#netPay');
    el.textContent = (net < 0 ? '−' : '') + fmt(Math.abs(net));
  }
  $$('.pay').forEach((i) => i.addEventListener('input', calcPay));
  calcPay();

  /* ------------------------------------------------------------------
     Sports toggle
     ------------------------------------------------------------------ */
  const sport = {
    fb: { j: '10', team: 'الفريق الأول · كرة القدم', name: 'اللاعب رقم 10<br>صانع ألعاب', sal: '$3,500', end: '30/06/27', bonus: '$2,400',
      med: ['جاهز', 'var(--success)'], r2: '$400', sq: ['28', '7', '3', '$41,200'] },
    bb: { j: '7', team: 'الفريق الأول · كرة السلة', name: 'اللاعب رقم 7<br>صانع ألعاب', sal: '$2,800', end: '31/05/27', bonus: '$1,600',
      med: ['عودة خلال 10 أيام', 'var(--warning)'], r2: '$250', sq: ['16', '5', '2', '$18,600'] },
  };
  function setSport(k) {
    const d = sport[k];
    $$('#sportSeg button').forEach((b) => b.classList.toggle('on', b.dataset.s === k));
    $('#pJersey').textContent = d.j; $('#pTeam').textContent = d.team; $('#pName').innerHTML = d.name;
    $('#pSal').textContent = d.sal; $('#pEnd').textContent = d.end; $('#pBonus').textContent = d.bonus;
    $('#pMed').textContent = d.med[0]; $('#pMed').style.color = d.med[1]; $('#pRow2').textContent = d.r2;
    ['sq1', 'sq2', 'sq3', 'sq4'].forEach((id, i) => ($('#' + id).textContent = d.sq[i]));
  }
  $$('#sportSeg button').forEach((b) => b.addEventListener('click', () => setSport(b.dataset.s)));

  /* ------------------------------------------------------------------
     Procurement workflow
     ------------------------------------------------------------------ */
  const steps = [
    ['طلب شراء', 'REQUEST', 'clip', 'مدير فريق كرة السلة', '21/09 · 10:14', '$1,200 تقديري', 'بانتظار اعتماد مدير القسم'],
    ['موافقة', 'APPROVAL', 'check', 'المدير التنفيذي', '21/09 · 13:02', '$1,200', 'معتمد — القيمة أعلى من $1,000'],
    ['عروض أسعار', 'QUOTATION', 'file', 'قسم المشتريات', '23/09 · 11:30', '3 عروض: 1,120 · 1,190 · 1,260', 'اختيار العرض الأفضل'],
    ['المورّد', 'SUPPLIER', 'truck', 'قسم المشتريات', '23/09 · 15:40', '$1,120', 'مورّد معتمد وملفه الضريبي مكتمل'],
    ['أمر شراء', 'PURCHASE ORDER', 'receipt', 'قسم المشتريات', '24/09 · 09:20', '$1,120', 'PO-0418 أُرسل للمورّد'],
    ['الاستلام', 'RECEIVING', 'box', 'أمين المستودع', '27/09 · 11:05', '20 كرة', 'دخلت مستودع معدات كرة السلة'],
    ['الفاتورة', 'INVOICE', 'file', 'المحاسب', '27/09 · 12:30', '$1,120', 'مطابقة: الطلب = الاستلام = الفاتورة'],
    ['الدفع', 'PAYMENT', 'banknote', 'المدير المالي', '29/09 · 10:00', '$1,120', 'سند صرف PV-2291 — العملية مغلقة'],
  ];
  const flow = $('#flow');
  steps.forEach(([ar, en, ic], i) => {
    const s = document.createElement('div');
    s.className = 'st';
    s.dataset.i = i;
    s.innerHTML = `<div class="c">${icon(ic)}</div><b>${ar}</b><small>${en}</small>`;
    flow.append(s);
  });
  let flowTimer = null;
  function setStep(n) {
    $$('.st', flow).forEach((s, i) => { s.classList.toggle('done', i < n); s.classList.toggle('cur', i === n); });
    $('#flowLine').style.width = (n / (steps.length - 1)) * 88 + '%';
    const [ar, , , who, when, val, st] = steps[n];
    $('#flowDetail').innerHTML = `
      <div><small>المرحلة ${n + 1} من ${steps.length}</small><b>${ar}</b></div>
      <div><small>المسؤول</small><b>${who}</b></div>
      <div><small>التاريخ والوقت</small><b class="num">${when}</b></div>
      <div><small>القيمة</small><b class="num">${val}</b></div>
      <div><small>الحالة والخطوة التالية</small><b style="font-size:19px">${st}</b></div>`;
  }
  flow.addEventListener('click', (e) => {
    const s = e.target.closest('.st');
    if (!s) return;
    clearInterval(flowTimer);
    setStep(+s.dataset.i);
  });
  $('#flowPlay').addEventListener('click', () => {
    clearInterval(flowTimer);
    let n = 0;
    setStep(0);
    flowTimer = setInterval(() => {
      n++;
      if (n >= steps.length) { clearInterval(flowTimer); return; }
      setStep(n);
    }, 1300);
  });
  enterHooks.flow = () => { clearInterval(flowTimer); setStep(0); };
  setStep(0);

  /* ------------------------------------------------------------------
     Decorative QR (not scannable — illustrative)
     ------------------------------------------------------------------ */
  (function buildQR() {
    const N = 29;
    let seed = 142;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const inFinder = (x, y) => [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
    let r = `<rect width="${N}" height="${N}" fill="#fff"/>`;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.52) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0B0B0D"/>`;
    [[0, 0], [N - 7, 0], [0, N - 7]].forEach(([fx, fy]) => {
      r += `<rect x="${fx}" y="${fy}" width="7" height="7" fill="#0B0B0D"/><rect x="${fx + 1}" y="${fy + 1}" width="5" height="5" fill="#fff"/><rect x="${fx + 2}" y="${fy + 2}" width="3" height="3" fill="#D71920"/>`;
    });
    $('#assetQr').innerHTML = r;
  })();

  /* ------------------------------------------------------------------
     Approval engine
     ------------------------------------------------------------------ */
  const apVals = [50, 90, 250, 450, 800, 1200, 4500, 9000, 18000];
  const apNames = ['مدير القسم', 'المدير المالي', 'المدير التنفيذي', 'مجلس الإدارة'];
  const apRange = $('#apRange');
  function updAp() {
    const v = apVals[+apRange.value];
    const lvl = v < 100 ? 0 : v <= 1000 ? 1 : v <= 10000 ? 2 : 3;
    $('#apAmount').textContent = fmt(v);
    $$('#approvers .ap').forEach((a, i) => a.classList.toggle('on', i === lvl));
    $('#apNote').textContent = `يُوجَّه الطلب تلقائيًا إلى: ${apNames[lvl]}. يُسجَّل الاعتماد باسم المعتمد ووقته، ولا يُنفَّذ الصرف قبله.`;
  }
  apRange.addEventListener('input', updAp);
  enterHooks.approve = updAp;
  updAp();

  /* ------------------------------------------------------------------
     AI assistant (scripted answers from the deck's sample data)
     ------------------------------------------------------------------ */
  const qa = [
    ['كم السيولة الآن؟', 'السيولة الحالية 186,400$: البنوك 142,900$ والصناديق 43,500$. أكبر رصيد في الحساب البنكي 1 (98,400$).', ['البنوك', 'الصناديق', 'آخر تحديث: قبل دقيقة']],
    ['كم صرفنا على كرة القدم هذا الشهر؟', 'صرفت كرة القدم في أيلول 41,200$: رواتب اللاعبين 29,400$، الجهاز الفني 6,300$، السفر 3,800$، التجهيزات 1,700$. الاستهلاك السنوي حتى الآن 78% من الموازنة.', ['مركز التكلفة: كرة القدم', 'سندات الصرف 09/2026', 'موازنة 2026']],
    ['من هم المستثمرون المتأخرون؟', '3 مستثمرين بإجمالي 33,500$: المحلات التجارية (18,000$ · 46 يومًا)، اللوحات الإعلانية (9,500$ · 12 يومًا)، الكافتيريا (6,000$ · 3 أيام).', ['وحدة المستثمرين', 'جداول الدفعات']],
    ['ما العقود التي تنتهي خلال 30 يومًا؟', '3 عقود بقيمة 79,600$: المهاجم رقم 9 (25/10)، خدمة الحراسة (18/10)، رعاية الواجهة الخلفية للقميص (28/10).', ['وحدة العقود', 'تواريخ الانتهاء']],
    ['هل تجاوز أي قسم موازنته؟', 'نعم: المنشآت عند 103% من موازنتها المرحلية. والإعلام عند 91% وتجاوز حد التنبيه 85%.', ['الموازنة مقابل الفعلي', 'مراكز التكلفة']],
  ];
  const msgs = $('#msgs'), suggest = $('#suggest');
  let typing = false;
  function addMsg(cls, html) {
    const m = document.createElement('div');
    m.className = 'msg ' + cls;
    m.innerHTML = html;
    msgs.append(m);
    while (msgs.children.length > 4) msgs.firstElementChild.remove();
    return m;
  }
  function ask(i) {
    if (typing) return;
    typing = true;
    const [q, a, src] = qa[i];
    addMsg('me', q);
    const m = addMsg('bot', '<span class="t"></span><span class="caret"></span>');
    const t = $('.t', m);
    let k = 0;
    setTimeout(function type() {
      k += 2;
      t.textContent = a.slice(0, k);
      if (k < a.length) setTimeout(type, 16);
      else {
        $('.caret', m).remove();
        m.insertAdjacentHTML('beforeend', `<div class="src">${src.map((s) => `<span>المصدر: ${s}</span>`).join('')}</div>`);
        typing = false;
      }
    }, 450);
  }
  suggest.innerHTML = qa.map(([q], i) => `<button data-q="${i}">${q}</button>`).join('');
  suggest.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(+b.dataset.q); });
  enterHooks.ai = () => {
    if (msgs.children.length) return;
    addMsg('bot', 'مرحبًا — اسألني عن السيولة، المستثمرين، العقود أو الموازنة. أجيب من بيانات النظام فقط، وأذكر المصدر دائمًا.');
  };

  /* ------------------------------------------------------------------
     Store → ERP stock sync
     ------------------------------------------------------------------ */
  let stock = 6;
  $('#store').addEventListener('click', (e) => {
    const b = e.target.closest('.buy');
    if (!b) return;
    if (b.dataset.sku !== 'KIT-HOME-M') {
      const o = b.textContent; b.textContent = 'تمت الإضافة ✓'; setTimeout(() => (b.textContent = o), 1200); return;
    }
    if (stock <= 0) return;
    stock--;
    const web = $('#stockWeb'), erp = $('#stockErp');
    web.textContent = stock; web.classList.add('flash');
    setTimeout(() => { erp.textContent = stock; erp.classList.add('flash'); web.classList.remove('flash'); }, 450);
    setTimeout(() => erp.classList.remove('flash'), 1100);
    if (stock === 0) { b.textContent = 'نفد المخزون'; b.style.background = '#444'; }
  });

  /* ------------------------------------------------------------------
     Network topology diagram
     ------------------------------------------------------------------ */
  (function buildTopo() {
    const svg = $('#topo');
    const node = (x, y, w, h, ic, t, sub, opt = {}) => {
      const fill = opt.fill || '#fff', stroke = opt.stroke || '#E5E1DD', color = opt.color || '#0B0B0D', ico = opt.ico || '#D71920';
      return `<g>
        <rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
        <svg x="${x - 14}" y="${y - h / 2 + 10}" width="28" height="28" viewBox="0 0 24 24" class="ti" style="color:${ico}"><use href="#${ic}"/></svg>
        <text x="${x}" y="${y + h / 2 - 30}" text-anchor="middle" direction="rtl" font-size="18" font-weight="700" fill="${color}">${t}</text>
        <text x="${x}" y="${y + h / 2 - 11}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#777277">${sub}</text>
      </g>`;
    };
    const ups = (x, y) => `<g><rect x="${x - 34}" y="${y - 14}" width="68" height="28" rx="8" fill="#0B0B0D"/><svg x="${x - 28}" y="${y - 9}" width="18" height="18" viewBox="0 0 24 24" class="ti" style="color:#FBBF24"><use href="#zap"/></svg><text x="${x + 10}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">UPS</text></g>`;
    const label = (x, y, t, c = '#777277') => `<text x="${x}" y="${y}" text-anchor="middle" direction="rtl" font-size="14" font-weight="700" fill="${c}">${t}</text>`;
    let s = '';
    // links
    s += `<path d="M430 70 C 330 70, 250 90, 250 130" fill="none" stroke="#D71920" stroke-width="3"/>`;
    s += `<path d="M550 70 C 650 70, 730 90, 730 130" fill="none" stroke="#8A858A" stroke-width="2.5" stroke-dasharray="8 7"/>`;
    s += `<path d="M250 222 C 250 270, 400 270, 440 290" fill="none" stroke="#D71920" stroke-width="3"/>`;
    s += `<path d="M730 222 C 730 270, 580 270, 540 290" fill="none" stroke="#8A858A" stroke-width="2.5" stroke-dasharray="8 7"/>`;
    s += `<line x1="490" y1="378" x2="490" y2="416" stroke="#0B0B0D" stroke-width="2.5"/>`;
    [130, 370, 610, 850].forEach((x) => (s += `<path d="M490 508 C 490 530, ${x} 520, ${x} 548" fill="none" stroke="#0B0B0D" stroke-width="2"/>`));
    s += label(205, 262, 'رئيسي', '#D71920');
    s += label(700, 275, 'احتياطي · Failover');
    s += label(700, 466, 'Cat6 · Gigabit');
    // nodes
    s += node(490, 52, 200, 92, 'globe', 'الإنترنت', 'INTERNET', { fill: '#0B0B0D', stroke: '#0B0B0D', color: '#fff', ico: '#fff' });
    s += node(250, 176, 220, 92, 'network', 'Fiber', 'الاتصال الرئيسي', { stroke: '#D71920' });
    s += node(730, 176, 220, 92, 'satellite', 'Starlink', 'الاتصال الاحتياطي');
    s += node(490, 334, 260, 88, 'shield', 'راوتر / جدار ناري', 'ROUTER · FIREWALL', { fill: '#0B0B0D', stroke: '#0B0B0D', color: '#fff' });
    s += node(490, 462, 260, 92, 'network', 'سويتش Gigabit', 'CORE SWITCH');
    s += node(130, 596, 200, 92, 'server', 'السيرفر', 'RAID SSD', { stroke: '#D71920' });
    s += node(370, 596, 200, 92, 'hdd', 'NAS', 'نسخ احتياطي محلي');
    s += node(610, 596, 200, 92, 'wifi', 'نقاط Wi-Fi', 'ACCESS POINTS');
    s += node(850, 596, 200, 92, 'monitor', 'محطات العمل', 'المالية · HR · الإدارة');
    s += ups(660, 334);
    s += ups(130, 538);
    svg.innerHTML = s;
    svg.setAttribute('font-family', 'Cairo, sans-serif');
  })();

  // internet options tabs
  $$('#netSeg button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#netSeg button').forEach((x) => x.classList.toggle('on', x === b));
      $$('.opt-pane').forEach((p) => p.classList.toggle('on', p.dataset.o === b.dataset.o));
    })
  );

  /* ------------------------------------------------------------------
     Roadmap phases
     ------------------------------------------------------------------ */
  const phases = [
    ['الإنقاذ والبنية التحتية', 'RESCUE & INFRA', 'حماية ما هو موجود قبل بناء أي شيء جديد.', ['نسخة احتياطية فورية', 'نسخ النظام القديم', 'فحص البيانات', 'استبدال الأجهزة الأساسية', 'الشبكة الداخلية', 'الإنترنت', 'UPS', 'NAS']],
    ['النواة المالية', 'FINANCE CORE', 'المالية هي المشكلة الأخطر، وأساس كل الوحدات اللاحقة.', ['المحاسبة', 'الصناديق', 'البنوك', 'المصروفات', 'الإيرادات', 'الموازنة', 'مراكز التكلفة', 'التقارير']],
    ['العقود والمستثمرون', 'CONTRACTS & INVESTORS', 'ضبط المستحقات ووقف تراكم التأخير والغرامات.', ['العقود', 'دفعات المستثمرين', 'تواريخ الاستحقاق', 'التنبيهات']],
    ['الموارد البشرية', 'HR', 'رواتب واضحة ومحسوبة تلقائيًا من الحضور والقواعد.', ['الموظفون', 'الحضور', 'الرواتب', 'العقوبات', 'السلف']],
    ['التشغيل', 'OPERATIONS', 'دورة شراء موثقة ومخزون وأصول معروفة المكان والمسؤول.', ['المشتريات', 'المستودعات', 'الأصول', 'الموردون']],
    ['الرياضة', 'SPORTS', 'كرة القدم وكرة السلة بتكاليفها وعقودها ضمن المنظومة.', ['كرة القدم', 'كرة السلة', 'اللاعبون', 'المدربون', 'العقود', 'المصاريف']],
    ['القنوات الرقمية', 'DIGITAL CHANNELS', 'واجهة النادي أمام جمهوره، مربوطة بالمخزون والمالية.', ['الموقع الرسمي', 'المتجر', 'إدارة المحتوى CMS', 'الطلبات أونلاين']],
    ['الذكاء', 'INTELLIGENCE', 'من التقارير إلى التوقع ودعم القرار.', ['المساعد الذكي', 'ذكاء الأعمال BI', 'التدفق النقدي التنبؤي', 'تحليلات متقدمة']],
  ];
  const phWrap = $('#phases');
  phWrap.innerHTML = phases.map(([ar, en], i) => `<button class="phase" data-p="${i}"><span class="pn">PHASE ${String(i + 1).padStart(2, '0')}</span><b>${ar}</b><small>${en}</small></button>`).join('');
  function setPhase(i) {
    $$('.phase', phWrap).forEach((p) => p.classList.toggle('on', +p.dataset.p === i));
    const [ar, en, why, items] = phases[i];
    $('#phaseDetail').innerHTML = `<div class="pd-anim"><span class="pill" style="background:rgba(215,25,32,.18);border-color:transparent;color:#FF8A8E">المرحلة ${i + 1} من 8 · <span class="en">${en}</span></span><h3 style="margin-top:16px">${ar}</h3><p class="why">${why}</p></div><ul class="pd-anim">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }
  phWrap.addEventListener('click', (e) => { const b = e.target.closest('.phase'); if (b) setPhase(+b.dataset.p); });
  setPhase(0);


  /* ------------------------------------------------------------------
     Keep every slide title on a single line: shrink until it fits
     ------------------------------------------------------------------ */
  function fitTitles() {
    $$('.slide .title').forEach((t) => {
      t.style.fontSize = '';
      t.style.whiteSpace = 'nowrap';
      let size = parseFloat(getComputedStyle(t).fontSize);
      const avail = t.parentElement.clientWidth;
      while (t.scrollWidth > avail && size > 44) {
        size -= 1;
        t.style.fontSize = size + 'px';
      }
      // narrow column: two balanced lines read better than a tiny single line
      if (t.scrollWidth > avail) { t.style.whiteSpace = 'normal'; t.style.fontSize = '50px'; }
    });
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fitTitles);

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  const start = parseInt(location.hash.slice(1), 10);
  go(!isNaN(start) ? start - 1 : 0, { instant: true });
})();
