// Homepage: the job lookup and the spectrum of every US job, both drawn from /data/jobs.json.
// Typing a job (or tapping a suggestion chip) lists matches, shows the best match on the score
// card and moves the "your job" marker along the spectrum to it.
(function () {
  var input = document.getElementById('lookup');
  var list = document.getElementById('lookup-results');
  var spec = document.getElementById('spectrum');
  var svg = spec && spec.querySelector('svg');
  var marker = spec && spec.querySelector('.marker');
  var tip = spec && spec.querySelector('.tip');
  var card = document.getElementById('score');
  var COLORS = { low: '#3FA796', moderate: '#9DB15A', elevated: '#E3B341', high: '#E8743B', 'very-high': '#D9473A' };
  var BANDS = { low: 'Low', moderate: 'Moderate', elevated: 'Elevated', high: 'High', 'very-high': 'Very high' };
  var jobs = null, sorted = [];

  function load() {
    if (jobs) return Promise.resolve(jobs);
    return fetch('/data/jobs.json').then(function (r) { return r.json(); }).then(function (d) { jobs = d; return d; });
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // Spectrum: one bar per job, sorted from least to most exposed, bar height = score.
  function draw(all) {
    sorted = all.slice().sort(function (a, b) { return a.x - b.x || a.t.localeCompare(b.t); });
    var n = sorted.length, ns = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', '0 0 ' + n + ' 100');
    var frag = document.createDocumentFragment();
    sorted.forEach(function (j, i) {
      var r = document.createElementNS(ns, 'rect');
      var h = Math.max(j.x, 1.5);
      r.setAttribute('x', i + 0.12); r.setAttribute('width', 0.76);
      r.setAttribute('y', 100 - h); r.setAttribute('height', h);
      r.setAttribute('fill', COLORS[j.b] || COLORS.low);
      frag.appendChild(r);
    });
    svg.appendChild(frag);

    var half = sorted.filter(function (j) { return j.x >= 50; }).length;
    var zone = spec.querySelector('.zone');
    zone.style.left = ((n - half) / n * 100) + '%';
    document.querySelectorAll('[data-half]').forEach(function (el) { el.textContent = half; });
    document.querySelectorAll('[data-total]').forEach(function (el) { el.textContent = n; });
    spec.classList.add('drawn');
  }

  function place(j) {
    var i = sorted.indexOf(j);
    if (i < 0) return;
    marker.style.left = ((i + 0.5) / sorted.length * 100) + '%';
    marker.querySelector('b').textContent = j.x;
    marker.querySelector('span').textContent = j.t;
    marker.classList.toggle('flip', i / sorted.length > 0.6);
    marker.hidden = false;
  }

  function show(j) {
    if (!card) return;
    var set = function (k, v) { card.querySelector('[data-k="' + k + '"]').textContent = v; };
    card.querySelector('.label-top').firstChild.textContent = 'Your search';
    set('title', j.t); set('score', j.x); set('band', BANDS[j.b] + ' AI exposure');
    card.querySelector('.pin').style.left = Math.min(Math.max(j.x, 1), 99) + '%';
    card.querySelector('[data-k="job"]').href = '/jobs/' + j.s;
    card.querySelector('[data-k="shl"]').href = 'https://skillhalflife.com/?job=' + j.s + '&utm_source=jobexposureindex&utm_medium=homepage';
  }

  function render() {
    var q = input.value.toLowerCase().trim();
    if (q.length < 2) { list.innerHTML = ''; if (marker) marker.hidden = true; return; }
    load().then(function (all) {
      var words = q.split(/\s+/);
      var hits = all.filter(function (j) {
        var t = j.t.toLowerCase();
        return words.every(function (w) { return t.indexOf(w) !== -1; });
      }).sort(function (a, b) {
        var sa = a.t.toLowerCase().indexOf(q) === 0 ? 0 : 1, sb = b.t.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        return sa - sb || a.t.length - b.t.length;
      }).slice(0, 6);
      if (!hits.length) {
        list.innerHTML = '<li class="empty">No match yet. Try a shorter or more general title.</li>';
        if (marker) marker.hidden = true;
        return;
      }
      list.innerHTML = hits.map(function (j) {
        return '<li><a href="/jobs/' + j.s + '"><span>' + esc(j.t) + '</span><span class="mini band-' + j.b + '"><span class="bar"><i style="width:' + Math.max(j.x, 2) + '%"></i></span><b>' + j.x + '</b></span></a></li>';
      }).join('');
      show(hits[0]);
      if (marker && sorted.length) place(hits[0]);
    });
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', render);
  document.querySelectorAll('.chips button').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.textContent; render(); });
  });

  if (!spec) return;
  // Hover or drag along the spectrum to read any job; click to open its page.
  function at(e) {
    var box = svg.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - box.left;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.floor(x / box.width * sorted.length)));
    return { j: sorted[i], x: x, w: box.width };
  }
  svg.addEventListener('pointermove', function (e) {
    if (!sorted.length) return;
    var p = at(e);
    tip.innerHTML = esc(p.j.t) + ' <b>' + p.j.x + '</b>';
    tip.style.left = Math.min(Math.max(p.x, 90), p.w - 90) + 'px';
    tip.hidden = false;
  });
  svg.addEventListener('pointerleave', function () { tip.hidden = true; });
  svg.addEventListener('click', function (e) { if (sorted.length) location.href = '/jobs/' + at(e).j.s; });

  load().then(draw);
})();
