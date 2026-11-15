/* Blok Blok site analytics. Cookieless: nothing is stored on the visitor's device.
 *
 *   <script defer src="https://app.blokblokstudio.com/bb.js" data-site="KEY"></script>
 *
 * Options (attributes on the script tag):
 *   data-consent="wait"   count nothing until the site calls bbConsent(true); bbConsent(false) stops again
 *   data-api="https://…"  report somewhere else than where the script came from
 *
 * A site can report its own events:  bb("Signed up", { plan: "pro" })
 * or mark an element:                <button data-bb-event="Booked a call">
 */
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
    w.bb = function () {}; w.bbConsent = function () {};
    return;
  }

  // Team opt-out: open the site once with #bb-ignore (or #bb-track to undo).
  var ignored = false;
  try {
    if (/[#&]bb-ignore\b/.test(hash)) localStorage.setItem('bb_ignore', '1');
    if (/[#&]bb-track\b/.test(hash)) localStorage.removeItem('bb_ignore');
    ignored = !!localStorage.getItem('bb_ignore');
  } catch (e) {}
  if (navigator.webdriver && !s.hasAttribute('data-allow-automation')) ignored = true;
  if (ignored) { w.bb = function () {}; w.bbConsent = function () {}; return; }

  var pid, path, maxScroll, activeMs, since, queue = [], timer, first = true, started = false;
  var waiting = s.getAttribute('data-consent') === 'wait';

  function post(events, leaving) {
    if (!events.length || w.__bbOff) return; // __bbOff: the site's consent banner switched counting off
    var body = JSON.stringify({ k: key, e: events }), url = api + '/api/bb/e';
    // A closing page drops ordinary requests; the beacon queue survives it.
    try { if (leaving && navigator.sendBeacon && navigator.sendBeacon(url, body)) return; } catch (e0) {}
    try {
      fetch(url, { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })['catch'](function () {});
    } catch (e) {
      try { navigator.sendBeacon(url, body); } catch (e2) {}
    }
  }
  function flush(extra, leaving) {
    clearTimeout(timer); timer = 0;
    var out = queue; queue = [];
    if (extra) out.push(extra);
    post(out, leaving);
  }
  function later(ev) {
    queue.push(ev);
    if (queue.length >= 20) flush();
    else if (!timer) timer = setTimeout(flush, 2500);
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

  // ── Loading speed, as this visitor experienced it (first page of the visit only) ──
  var vit = {}, vitPid = null, clsValue = 0, clsWin = 0, clsStart = 0, clsLast = 0;
  function watch(type, fn, opts) {
    try {
      var o = new PerformanceObserver(function (list) { list.getEntries().forEach(fn); });
      var cfg = { type: type, buffered: true };
      if (opts) for (var k in opts) cfg[k] = opts[k];
      o.observe(cfg);
    } catch (e) {}
  }
  function vitals() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.responseStart > 0) vit.t = Math.round(nav.responseStart);
    } catch (e) {}
    watch('paint', function (e) { if (e.name === 'first-contentful-paint') vit.f = Math.round(e.startTime); });
    watch('largest-contentful-paint', function (e) { vit.l = Math.round(e.startTime); });
    watch('layout-shift', function (e) {
      if (e.hadRecentInput) return;
      // Shifts are grouped into bursts (under 1s apart, 5s at most); the worst burst is the score.
      if (clsWin && e.startTime - clsLast < 1000 && e.startTime - clsStart < 5000) clsWin += e.value;
      else { clsWin = e.value; clsStart = e.startTime; }
      clsLast = e.startTime;
      if (clsWin > clsValue) { clsValue = clsWin; vit.c = +clsValue.toFixed(4); }
    });
    watch('event', function (e) {
      if (e.interactionId && (!vit.i || e.duration > vit.i)) vit.i = Math.round(e.duration);
    }, { durationThreshold: 40 });
  }

  function measure() {
    var p = Math.round(((w.pageYOffset || 0) + w.innerHeight) / docH() * 100);
    if (p > maxScroll) {
      maxScroll = Math.min(100, p);
      report();
    }
  }
  // Report progress while the page is still open, in case the goodbye message never arrives (phones).
  var progress = 0;
  function report() {
    if (progress) return;
    progress = setTimeout(function () { progress = 0; if (pid) { tick(); flush(leaveEvent()); } }, 5000);
  }
  function tick() {
    if (since) { activeMs += Date.now() - since; since = d.visibilityState === 'hidden' ? 0 : Date.now(); }
  }
  function leaveEvent() {
    var e = { t: 'pl', pid: pid, s: maxScroll, d: activeMs };
    if (pid === vitPid) e.v = vit;
    return e;
  }
  function leave() {
    if (!pid) return;
    measure(); tick();
    flush(leaveEvent(), true);
  }
  function view() {
    leave();
    pid = id(); path = location.pathname; maxScroll = 0; activeMs = 0; formsBegun = {};
    since = d.visibilityState === 'hidden' ? 0 : Date.now();
    var e = { t: 'pv', pid: pid, p: path, w: w.innerWidth, h: w.innerHeight };
    if (first) {
      first = false;
      vitPid = pid;
      e.r = d.referrer || '';
      e.l = navigator.language || '';
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav && nav.responseStatus) e.st = nav.responseStatus;
      } catch (err0) {}
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
    setTimeout(report, 3000); // speed numbers for visitors who never scroll
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
  var ACTION = 'a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],summary,label,select,input,textarea,[data-bb],[data-bb-event]';
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

  // ── Events ──
  function event(name, value, props) {
    if (!pid || !name) return;
    var e = { t: 'e', pid: pid, n: String(name).slice(0, 60) };
    if (value) e.v = String(value).slice(0, 200);
    if (props && typeof props === 'object') e.p = props;
    later(e);
  }
  var FILES = /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|rtf|mp3|wav|mp4|mov|avi|dmg|exe|apk|ics|vcf|epub)$/i;
  function linkEvent(a) {
    var href = a.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) return event('Email link', href.slice(7).split('?')[0]);
    if (/^tel:/i.test(href)) return event('Phone link', href.slice(4));
    var u;
    try { u = new URL(href, location.href); } catch (e) { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    if (FILES.test(u.pathname)) return event('File download', u.pathname.split('/').pop());
    if (u.hostname.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) event('Outbound link', u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : ''));
  }
  // A form is known by its own name, or failing that by the words on its send button.
  function formName(f) {
    var n = f.getAttribute('data-bb') || f.getAttribute('aria-label') || f.getAttribute('name') || f.id;
    if (!n) {
      var send = f.querySelector('[type="submit"],button:not([type="button"])');
      var words = send && (send.innerText || send.value || '').replace(/\s+/g, ' ').trim();
      n = words ? 'Form: ' + words : 'Form';
    }
    return n.slice(0, 120);
  }
  var formsBegun = {}, lastClicks = [];

  d.addEventListener('click', function (ev) {
    try {
      var t = ev.target;
      if (!pid || !t || t.nodeType !== 1) return;
      var el = (t.closest && t.closest(ACTION)) || t;
      if (el === d.body || el === d.documentElement) return;
      var r = el.getBoundingClientRect(), sel = selector(el), c = { t: 'c', pid: pid, sel: sel, l: label(el) };
      var a = t.closest && t.closest('a[href]');
      if (a) { c.hr = (a.getAttribute('href') || '').split('?')[0].slice(0, 200); linkEvent(a); }
      c.x = +(ev.pageX / docW()).toFixed(4);
      c.y = Math.round(ev.pageY);
      c.ex = r.width ? +((ev.clientX - r.left) / r.width).toFixed(3) : 0.5;
      c.ey = r.height ? +((ev.clientY - r.top) / r.height).toFixed(3) : 0.5;
      later(c);
      var named = t.closest && t.closest('[data-bb-event]');
      if (named) event(named.getAttribute('data-bb-event'), label(named));
      // Three quick clicks on one spot: something looked clickable and did nothing.
      var now = Date.now();
      lastClicks = lastClicks.filter(function (k) { return now - k.at < 800; });
      lastClicks.push({ at: now, x: ev.clientX, y: ev.clientY });
      var near = lastClicks.filter(function (k) { return Math.abs(k.x - ev.clientX) < 30 && Math.abs(k.y - ev.clientY) < 30; });
      if (near.length >= 3) {
        lastClicks = [];
        event('Rage click', c.l + ' · ' + sel.slice(-100));
      }
    } catch (e) {}
  }, true);

  d.addEventListener('focusin', function (ev) {
    try {
      var t = ev.target, f = t && t.form;
      if (!f || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || /^(hidden|submit|button)$/.test(t.type)) return;
      var n = formName(f);
      if (!formsBegun[n]) { formsBegun[n] = 1; event('Form started', n); }
    } catch (e) {}
  }, true);
  d.addEventListener('submit', function (ev) {
    try { if (ev.target && ev.target.tagName === 'FORM') { event('Form sent', formName(ev.target)); flush(); } } catch (e) {}
  }, true);

  var raf = 0;
  w.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; if (pid) measure(); });
  }, { passive: true });

  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') leave();
    else since = Date.now();
  });
  w.addEventListener('pagehide', leave);

  // Single-page apps change the URL without loading a page.
  function moved() {
    setTimeout(function () { if (started && location.pathname !== path) view(); }, 0);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var out = orig.apply(this, arguments); moved(); return out; };
  });
  w.addEventListener('popstate', moved);

  function start() {
    if (started) return;
    started = true;
    if (d.prerendering) d.addEventListener('prerenderingchange', view, { once: true });
    else view();
  }

  vitals();
  w.bb = function (name, props) { event(name, null, props); };
  w.bbConsent = function (ok) {
    w.__bbOff = !ok;
    if (ok) start();
  };
  if (!waiting) start();
})();
