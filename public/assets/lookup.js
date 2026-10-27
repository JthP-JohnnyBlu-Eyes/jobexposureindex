// Homepage job lookup: suggests matching jobs from /data/jobs.json as you type
// and moves the scale pin to the best match's score.
(function () {
  var input = document.getElementById('lookup');
  var list = document.getElementById('lookup-results');
  var pin = document.querySelector('.card .scale .pin');
  var jobs = null;

  function load() {
    if (jobs) return Promise.resolve(jobs);
    return fetch('/data/jobs.json').then(function (r) { return r.json(); }).then(function (d) { jobs = d; return d; });
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function render() {
    var q = input.value.toLowerCase().trim();
    if (q.length < 2) { list.innerHTML = ''; pin.style.animation = ''; pin.style.left = ''; return; }
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
        return;
      }
      list.innerHTML = hits.map(function (j) {
        return '<li><a href="/jobs/' + j.s + '"><span>' + esc(j.t) + '</span><span class="mini band-' + j.b + '"><span class="bar"><i style="width:' + Math.max(j.x, 2) + '%"></i></span><b>' + j.x + '</b></span></a></li>';
      }).join('');
      pin.style.animation = 'none';
      pin.style.left = hits[0].x + '%';
    });
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', render);
})();
