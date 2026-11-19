// Share buttons on job pages: the phone's own share sheet where available, plus copy-link.
(function () {
  var box = document.querySelector('.share');
  if (!box) return;
  var copy = box.querySelector('[data-copy]');
  copy.addEventListener('click', function () {
    var url = copy.getAttribute('data-copy');
    var done = function () { copy.textContent = 'Link copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
    else prompt('Copy this link:', url);
  });
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'sh'; b.textContent = 'Share…';
    b.addEventListener('click', function () {
      navigator.share({ title: document.title, text: box.getAttribute('data-title') + ' scored ' + box.getAttribute('data-score') + '/100 on the Job Exposure Index.', url: copy.getAttribute('data-copy') }).catch(function () {});
    });
    box.insertBefore(b, box.children[1]);
  }
})();

// "Copy code" buttons next to the embed code (job pages and /widget).
(function () {
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy-code]'), function (btn) {
    btn.addEventListener('click', function () {
      var box = document.getElementById(btn.getAttribute('data-copy-code'));
      var done = function () { btn.textContent = 'Code copied'; setTimeout(function () { btn.textContent = 'Copy code'; }, 2000); };
      var fallback = function () { box.focus(); box.select(); };
      if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, fallback);
      else fallback();
    });
  });
})();
