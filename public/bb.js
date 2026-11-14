/* Blok Blok site analytics. Cookieless: nothing is stored on the visitor's device. */
(function () {
  var w = window, d = document, s = d.currentScript;
  if (!s || w.__bb) return;
  var key = s.getAttribute('data-site');
  if (!key) return;
  w.__bb = 1;
  var api = s.getAttribute('data-api') || s.src.split('/').slice(0, 3).join('/');
  var hash = location.hash || '';

  // Team view: a link from the Command Center draws the heatmap over the live page.
  var heat = /[#&]bb-heat=([\w.\-]+)/.exec(hash);
  if (heat) {
    var range = /[#&]bb-range=(\w+)/.exec(hash);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var h = d.createElement('script');
    h.src = api + '/bb-heat.js';
    h.setAttribute('data-token', heat[1]);
    h.setAttribute('data-api', api);
    if (range) h.setAttribute('data-range', range[1]);
    d.head.appendChild(h);
    return;
  }

  // Team opt-out: open the site once with #bb-ignore (or #bb-track to undo).
  try {
    if (/[#&]bb-ignore\b/.test(hash)) localStorage.setItem('bb_ignore', '1');
    if (/[#&]bb-track\b/.test(hash)) localStorage.removeItem('bb_ignore');
    if (localStorage.getItem('bb_ignore')) return;
  } catch (e) {}
  if (navigator.webdriver && !s.hasAttribute('data-allow-automation')) return;

  var pid, path, maxScroll, activeMs, since, queue = [], timer, first = true;

  function post(events) {
    if (!events.length) return;
    var body = JSON.stringify({ k: key, e: events }), url = api + '/api/bb/e';
    try {
      fetch(url, { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })['catch'](function () {});
    } catch (e) {
      try { navigator.sendBeacon(url, body); } catch (e2) {}
    }
  }
  function flush(extra) {
    clearTimeout(timer); timer = 0;
    var out = queue; queue = [];
    if (extra) out.push(extra);
    post(out);
  }
  function id() {
    var a = new Uint8Array(12), o = '';
    (w.crypto || w.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) o += (a[i] + 256).toString(16).slice(1);
    return o;
  }
  function docH() {
    return Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0, 1);
  }
  function docW() {
    return Math.max(d.documentElement.scrollWidth, 1);
  }
  function measure() {
    var p = Math.round(((w.pageYOffset || 0) + w.innerHeight) / docH() * 100);
    if (p > maxScroll) maxScroll = Math.min(100, p);
  }
  function tick() {
    if (since) { activeMs += Date.now() - since; since = d.visibilityState === 'hidden' ? 0 : Date.now(); }
  }
  function leave() {
    if (!pid) return;
    measure(); tick();
    flush({ t: 'pl', pid: pid, s: maxScroll, d: activeMs });
  }
  function view() {
    leave();
    pid = id(); path = location.pathname; maxScroll = 0; activeMs = 0;
    since = d.visibilityState === 'hidden' ? 0 : Date.now();
    var e = { t: 'pv', pid: pid, p: path, w: w.innerWidth, h: w.innerHeight };
    if (first) {
      first = false;
      e.r = d.referrer || '';
      try {
        var q = new URLSearchParams(location.search);
        if (q.get('utm_source')) e.us = q.get('utm_source');
        if (q.get('utm_medium')) e.um = q.get('utm_medium');
        if (q.get('utm_campaign')) e.uc = q.get('utm_campaign');
        if (q.get('gclid') || q.get('gbraid') || q.get('wbraid')) e.g = 1;
      } catch (err) {}
    }
    post([e]);
    setTimeout(measure, 800);
  }

  // A stable CSS path for an element, anchored on the nearest id when there is one.
  function selector(el) {
    var named = el.getAttribute('data-bb');
    if (named) return '[data-bb="' + named.replace(/"/g, '') + '"]';
    var parts = [];
    while (el && el.nodeType === 1 && el !== d.body && el !== d.documentElement && parts.length < 30) {
      var i = el.id;
      if (i && /^[A-Za-z][\w\-]*$/.test(i) && !/\d{4,}/.test(i)) {
        try { if (d.querySelectorAll('#' + i).length === 1) { parts.unshift('#' + i); return parts.join('>'); } } catch (e) {}
      }
      var tag = el.tagName.toLowerCase(), n = 1, same = 0, sib = el, kids = el.parentElement ? el.parentElement.children : [];
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) n++;
      for (var k = 0; k < kids.length; k++) if (kids[k].tagName === el.tagName) same++;
      parts.unshift(same > 1 ? tag + ':nth-of-type(' + n + ')' : tag);
      el = el.parentElement;
    }
    parts.unshift('body');
    return parts.join('>');
  }
  var ACTION = 'a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],summary,label,select,input,textarea,[data-bb]';
  function label(el) {
    var t = el.getAttribute('data-bb') || el.getAttribute('aria-label');
    var tag = el.tagName.toLowerCase();
    // Visible text of buttons and links only. Never anything a visitor typed.
    if (!t && /^(a|button|summary|label)$/.test(tag) || (!t && el.getAttribute('role'))) t = el.innerText || el.textContent;
    if (!t && tag === 'input' && /^(submit|button)$/.test(el.type)) t = el.value;
    if (!t && /^(input|select|textarea)$/.test(tag)) t = el.getAttribute('name') || el.getAttribute('placeholder') || tag;
    if (!t) { var img = tag === 'img' ? el : el.querySelector && el.querySelector('img[alt]'); if (img) t = img.getAttribute('alt'); }
    return (t || '<' + tag + '>').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  d.addEventListener('click', function (ev) {
    try {
      var t = ev.target;
      if (!pid || !t || t.nodeType !== 1) return;
      var el = (t.closest && t.closest(ACTION)) || t;
      if (el === d.body || el === d.documentElement) return;
      var r = el.getBoundingClientRect(), c = { t: 'c', pid: pid, sel: selector(el), l: label(el) };
      var href = el.tagName === 'A' && el.getAttribute('href');
      if (href) c.hr = href.split('?')[0].slice(0, 200);
      c.x = +(ev.pageX / docW()).toFixed(4);
      c.y = Math.round(ev.pageY);
      c.ex = r.width ? +((ev.clientX - r.left) / r.width).toFixed(3) : 0.5;
      c.ey = r.height ? +((ev.clientY - r.top) / r.height).toFixed(3) : 0.5;
      queue.push(c);
      if (queue.length >= 20) flush();
      else if (!timer) timer = setTimeout(flush, 2500);
    } catch (e) {}
  }, true);

  var raf = 0;
  w.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; measure(); });
  }, { passive: true });

  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') leave();
    else since = Date.now();
  });
  w.addEventListener('pagehide', leave);

  // Single-page apps change the URL without loading a page.
  function moved() {
    setTimeout(function () { if (location.pathname !== path) view(); }, 0);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var out = orig.apply(this, arguments); moved(); return out; };
  });
  w.addEventListener('popstate', moved);

  if (d.prerendering) d.addEventListener('prerenderingchange', view, { once: true });
  else view();
})();
