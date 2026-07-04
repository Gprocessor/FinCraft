/* FinCraft · spa-redirect.js — handles GitHub Pages 404 redirect for SPA routing.
   Extracted from an inline <script> in index.html so index.html can enforce a
   strict Content-Security-Policy (script-src 'self') with no inline-script exception. */
(function () {
  const redirect = sessionStorage.getItem('_spa_redirect');
  if (redirect) {
    sessionStorage.removeItem('_spa_redirect');
    window.history.replaceState(null, '', redirect);
  }
})();
