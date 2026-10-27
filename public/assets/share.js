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
