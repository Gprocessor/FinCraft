/* FinCraft · spa-404-redirect.js — SPA 404 redirect for GitHub Pages.
   Stores the full path, then redirects to index.html which reads it back.
   Extracted from an inline <script> in 404.html for CSP compliance. */
(function () {
  var path = window.location.pathname;
  sessionStorage.setItem('_spa_redirect', path);
  window.location.href = window.location.origin + window.location.pathname.split('/').slice(0, 2).join('/') + '/';
})();
