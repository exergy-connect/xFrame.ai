(function () {
  const locales = [
  "en",
  "cz",
  "es",
  "fr",
  "it",
  "nl"
];
  const scriptName = document.currentScript && document.currentScript.src.split('/').pop() || '';
  const baseName = scriptName.replace(/\.locale\.js$/i, '');
  const defaultLocale = locales[0];
  function localeHref(locale) {
    return locale === defaultLocale ? baseName + '.html' : baseName + '.' + locale + '.html';
  }
  const sw = document.getElementById('locale-switch');
  if (!sw) return;
  if (!locales || locales.length < 2) return;
  const page = location.pathname.split('/').pop() || location.href.split('/').pop() || '';
  locales.forEach(function (locale) {
    const href = localeHref(locale);
    const opt = document.createElement('option');
    opt.value = href;
    opt.textContent = locale.toUpperCase();
    if (href === page) opt.selected = true;
    sw.appendChild(opt);
  });
  sw.hidden = false;
  sw.addEventListener('change', function () {
    const href = sw.value;
    if (href) location.href = href + location.hash;
  });
})();
