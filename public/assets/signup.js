// Kit signup for every form on the page: post in the background, fall back to a normal post.
document.querySelectorAll('form.signup').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('input[type=email]');
    var button = form.querySelector('button');
    var note = form.nextElementSibling;
    if (!email.value || !email.checkValidity()) {
      note.textContent = 'Enter a full email address, like you@example.com.';
      email.focus();
      return;
    }
    button.disabled = true;
    note.textContent = 'Signing you up...';
    fetch(form.action, { method: 'POST', headers: { 'Accept': 'application/json' }, body: new FormData(form) })
      .then(function (res) {
        if (!res.ok) throw new Error('Signup failed');
        note.textContent = 'Almost done. Check your inbox and confirm your email to get the weekly report.';
        form.reset();
      })
      .catch(function () { form.submit(); })
      .finally(function () { button.disabled = false; });
  });
});
