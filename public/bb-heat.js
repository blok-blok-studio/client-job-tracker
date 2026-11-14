/* Blok Blok heatmap view. Loaded only from a team link (#bb-heat=...), never for visitors. */
(function () {
  var w = window, d = document, s = d.currentScript;
  if (!s || w.__bbHeat) return;
  w.__bbHeat = 1;
  var token = s.getAttribute('data-token'), api = s.getAttribute('data-api');
  var state = {
    range: s.getAttribute('data-range') || '7d',
    device: w.innerWidth < 768 ? 'mobile' : w.innerWidth < 1024 ? 'tablet' : 'desktop',
    clicks: true, heat: true, scroll: true, path: null, data: null, error: null, loading: false,
  };
  var BLUE = '#2561D8';

  var host = d.createElement('div');
  host.setAttribute('data-bb-overlay', '');
  host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;';
  d.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,sans-serif}' +
    '#layer{position:absolute;top:0;left:0;pointer-events:none}' +
    'canvas{position:fixed;top:0;left:0;pointer-events:none;opacity:.75}' +
    '.box{position:absolute;border:2px solid ' + BLUE + ';background:rgba(37,97,216,.16);border-radius:4px}' +
    '.n{position:absolute;right:-2px;bottom:-2px;background:' + BLUE + ';color:#fff;font-size:12px;font-weight:600;line-height:1;padding:3px 6px;border-radius:4px 0 4px 0;white-space:nowrap}' +
    '.n.out{bottom:auto;top:100%;border-radius:0 0 4px 4px}' +
    '.line{position:absolute;left:0;height:0;border-top:2px dashed rgba(37,97,216,.85)}' +
    '.line span{position:absolute;right:8px;top:-12px;background:' + BLUE + ';color:#fff;font-size:12px;font-weight:600;padding:4px 8px;border-radius:4px;white-space:nowrap}' +
    '#bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:calc(100vw - 16px);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;background:#111;color:#fff;border:1px solid #2a2a2a;border-radius:12px;padding:8px 12px;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.5)}' +
    '#bar b{font-weight:600}#bar .dim{color:#a0a0a0}' +
    'select,button{font:inherit;color:#fff;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:6px 10px;cursor:pointer;min-height:32px}' +
    'button.on{background:' + BLUE + ';border-color:' + BLUE + '}button:focus-visible,select:focus-visible{outline:2px solid #93B0EE;outline-offset:1px}' +
    '</style>' +
    '<canvas></canvas><div id="layer"></div>' +
    '<div id="bar" role="toolbar" aria-label="Heatmap">' +
    '<span id="stat"></span>' +
    '<select id="range" aria-label="Period"><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="12mo">12 months</option></select>' +
    '<select id="device" aria-label="Device"><option value="all">All devices</option><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select>' +
    '<button id="clicks" type="button">Click counts</button><button id="heat" type="button">Heatmap</button><button id="scroll" type="button">Scroll depth</button>' +
    '<button id="close" type="button">Close</button></div>';

  var $ = function (i) { return root.getElementById(i); };
  var layer = $('layer'), canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  $('range').value = state.range; $('device').value = state.device;
  $('range').onchange = function () { state.range = this.value; load(); };
  $('device').onchange = function () { state.device = this.value; load(); };
  ['clicks', 'heat', 'scroll'].forEach(function (k) {
    $(k).onclick = function () { state[k] = !state[k]; layout(); };
  });
  $('close').onclick = function () { location.reload(); };

  function docH() { return Math.max(d.documentElement.scrollHeight, d.body.scrollHeight); }
  function docW() { return d.documentElement.scrollWidth; }

  function load() {
    state.path = location.pathname; state.loading = true; state.error = null; status();
    var url = api + '/api/bb/heat?token=' + encodeURIComponent(token) + '&path=' + encodeURIComponent(state.path) +
      '&range=' + state.range + '&device=' + state.device + '&tz=' + -new Date().getTimezoneOffset();
    fetch(url, { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (j) {
      state.loading = false;
      if (j.error) { state.error = j.error; state.data = null; } else state.data = j;
      layout();
    })['catch'](function () { state.loading = false; state.error = 'Could not load the numbers.'; state.data = null; layout(); });
  }

  function status(hidden) {
    var el = $('stat'), x = state.data;
    if (state.loading) el.textContent = 'Loading…';
    else if (state.error) el.textContent = state.error;
    else if (x) {
      el.innerHTML = '<b></b> <span class="dim"></span>';
      el.firstChild.textContent = x.views.toLocaleString() + (x.views === 1 ? ' view · ' : ' views · ') + x.clicks.toLocaleString() + (x.clicks === 1 ? ' click' : ' clicks');
      el.lastChild.textContent = state.path + (hidden ? ' · ' + hidden.toLocaleString() + ' clicks on things not showing now' : '');
    }
    ['clicks', 'heat', 'scroll'].forEach(function (k) { $(k).className = state[k] ? 'on' : ''; $(k).setAttribute('aria-pressed', state[k]); });
  }

  var pts = []; // click positions in page coordinates
  function find(sel) { try { return d.querySelector(sel); } catch (e) { return null; } }

  function layout() {
    var x = state.data, sx = w.pageXOffset, sy = w.pageYOffset, W = docW(), H = docH(), hidden = 0;
    layer.style.width = W + 'px'; layer.style.height = H + 'px';
    layer.textContent = ''; pts = [];
    if (x) {
      var rects = {};
      x.elements.forEach(function (e) {
        var el = find(e.selector), r = el && el.getBoundingClientRect();
        if (!r || (!r.width && !r.height)) { hidden += e.count; return; }
        rects[e.selector] = r;
        if (!state.clicks) return;
        var box = d.createElement('div'); box.className = 'box';
        box.style.cssText = 'left:' + (r.left + sx) + 'px;top:' + (r.top + sy) + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
        var n = d.createElement('span'); n.className = r.height < 44 ? 'n out' : 'n'; n.textContent = e.count.toLocaleString();
        box.appendChild(n); layer.appendChild(box);
      });
      var gone = {};
      x.points.forEach(function (p) {
        var r = rects[p[0]];
        if (r) { pts.push([r.left + sx + r.width * p[1], r.top + sy + r.height * p[2]]); return; }
        // Element no longer on the page at all: fall back to where the click landed.
        if (gone[p[0]] === undefined) gone[p[0]] = !find(p[0]);
        if (gone[p[0]]) pts.push([p[3] * W, p[4]]);
      });
      if (state.scroll && x.views) {
        x.reach.forEach(function (pct, i) {
          if (i === 9 || pct === (x.reach[i + 1])) return; // skip repeats and the very bottom
          var line = d.createElement('div'); line.className = 'line';
          line.style.top = Math.round(H * (i + 1) / 10) + 'px'; line.style.width = W + 'px';
          var tag = d.createElement('span'); tag.textContent = pct + '% scroll this far';
          line.appendChild(tag); layer.appendChild(line);
        });
      }
    }
    status(hidden);
    paint();
  }

  // Classic heat rendering: stack soft grey dots, then colour by how dark they got.
  var ramp = (function () {
    var c = d.createElement('canvas'); c.width = 256; c.height = 1;
    var g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.15, '#2561D8'); grad.addColorStop(0.45, '#22c55e'); grad.addColorStop(0.7, '#facc15'); grad.addColorStop(1, '#ef4444');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 1);
    return g.getImageData(0, 0, 256, 1).data;
  })();
  function paint() {
    var vw = w.innerWidth, vh = w.innerHeight, scale = 0.5; // half resolution keeps scrolling smooth
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    canvas.width = Math.ceil(vw * scale); canvas.height = Math.ceil(vh * scale);
    if (!state.heat || !pts.length) return;
    var sx = w.pageXOffset, sy = w.pageYOffset, R = 28 * scale, drawn = 0;
    var alpha = Math.max(0.08, Math.min(0.5, 12 / Math.sqrt(pts.length)));
    for (var i = 0; i < pts.length; i++) {
      var px = (pts[i][0] - sx) * scale, py = (pts[i][1] - sy) * scale;
      if (py < -R || py > canvas.height + R) continue;
      var g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, 'rgba(0,0,0,' + alpha + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(px - R, py - R, R * 2, R * 2); drawn++;
    }
    if (!drawn) return;
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height), px4 = img.data;
    for (var j = 0; j < px4.length; j += 4) {
      var a = px4[j + 3];
      if (!a) continue;
      var o = a * 4;
      px4[j] = ramp[o]; px4[j + 1] = ramp[o + 1]; px4[j + 2] = ramp[o + 2]; px4[j + 3] = Math.min(255, a * 1.6 + 30);
    }
    ctx.putImageData(img, 0, 0);
  }

  var raf = 0;
  w.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; paint(); });
  }, { passive: true });
  w.addEventListener('resize', layout);
  // Pages move: menus open, images load, routes change. Re-measure once a second.
  setInterval(function () {
    if (location.pathname !== state.path) load();
    else if (!state.loading) layout();
  }, 1000);
  load();
})();
