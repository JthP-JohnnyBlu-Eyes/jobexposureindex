// Search, field filter and sorting for the all-jobs table. Reads ?q= and ?group= from the URL.
(function () {
  var q = document.getElementById('q');
  var group = document.getElementById('group');
  var count = document.getElementById('count');
  var tbody = document.querySelector('#jobs tbody');
  var rows = Array.prototype.slice.call(tbody.rows);
  var buttons = document.querySelectorAll('#jobs th button');
  var labels = { title: 'Job', score: 'Exposure', use: 'In use', emp: 'US workers', pay: 'Median pay' };
  var sortKey = 'score', desc = true;

  var params = new URLSearchParams(location.search);
  if (params.get('q')) q.value = params.get('q');
  if (params.get('group')) group.value = params.get('group');

  function apply() {
    var words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var g = group.value, shown = 0;
    rows.forEach(function (r) {
      var t = r.getAttribute('data-title');
      var ok = (!g || r.getAttribute('data-g') === g) && words.every(function (w) { return t.indexOf(w) !== -1; });
      r.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = shown === 1 ? '1 job' : shown + ' jobs';
    var p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (g) p.set('group', g);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  function sort() {
    rows.sort(function (a, b) {
      if (sortKey === 'title') {
        var x = a.getAttribute('data-title'), y = b.getAttribute('data-title');
        return desc ? y.localeCompare(x) : x.localeCompare(y);
      }
      var d = Number(a.getAttribute('data-' + sortKey)) - Number(b.getAttribute('data-' + sortKey));
      return desc ? -d : d;
    });
    rows.forEach(function (r) { tbody.appendChild(r); });
    buttons.forEach(function (b) {
      var k = b.getAttribute('data-sort');
      b.setAttribute('aria-pressed', k === sortKey ? 'true' : 'false');
      b.textContent = labels[k] + (k === sortKey ? (desc ? ' ↓' : ' ↑') : '');
    });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      if (k === sortKey) desc = !desc; else { sortKey = k; desc = k !== 'title'; }
      sort();
    });
  });
  q.addEventListener('input', apply);
  group.addEventListener('change', apply);
  apply();
})();
