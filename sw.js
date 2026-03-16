const CACHE_NAME = 'kf-assets-v1';

const ASSETS_TO_CACHE = [
  '/assets/bell.png',
  '/assets/bell_unmute.png',
  '/assets/blue lock icon.png',
  '/assets/blue-news-icon.png',
  '/assets/bluehead.png',
  '/assets/bookmarkscreenshot.png',
  '/assets/bookmarkspng.png',
  '/assets/brightness.png',
  '/assets/bubble.png',
  '/assets/capturewithcursor.png',
  '/assets/chevron_sort.png',
  '/assets/chevron_sort_blue.png',
  '/assets/chevron_sort_green.png',
  '/assets/chevron_sort_white.png',
  '/assets/comfy-default.png',
  '/assets/comfy-pressed.png',
  '/assets/compact-default.png',
  '/assets/compact-pressed.png',
  '/assets/favicon-32x32.png',
  '/assets/forest copy.png',
  '/assets/forest.png',
  '/assets/green lock icon.png',
  '/assets/green-news-icon.png',
  '/assets/greenhead.png',
  '/assets/hat.png',
  '/assets/head.png',
  '/assets/hermes-blink.png',
  '/assets/hermes-mouthopen.png',
  '/assets/hermes-sleep2.png',
  '/assets/hermes-sleep3.png',
  '/assets/hermes-sleep4.png',
  '/assets/hermes.png',
  '/assets/iconny thingy.png',
  '/assets/icons8-chevron-up-90.png',
  '/assets/icons8-chevron-up-90_blue.png',
  '/assets/icons8-chevron-up-90_green.png',
  '/assets/icons8-chevron-up-90_white.png',
  '/assets/icons8-comment-288.png',
  '/assets/icons8-comment-288_white.png',
  '/assets/icons8-comment-72.png',
  '/assets/icons8-comment.svg',
  '/assets/icons8-comment_blue.svg',
  '/assets/icons8-hamburger-menu-500.png',
  '/assets/icons8-hamburger-menu-500_blue.png',
  '/assets/icons8-hamburger-menu-500_green.png',
  '/assets/icons8-hamburger-menu-500_white.png',
  '/assets/icons8-messages.svg',
  '/assets/icons8-moon-96_green.png',
  '/assets/icons8-open.svg',
  '/assets/icons8-paint-96.png',
  '/assets/icons8-paint-96_blue.png',
  '/assets/icons8-paint-96_green.png',
  '/assets/icons8-paint-96_white.png',
  '/assets/icons8-pin-96.png',
  '/assets/icons8-sorting-arrowheads-90.png',
  '/assets/icons8-sorting-arrowheads-90_white.png',
  '/assets/icons8-stripe-500_blue.png',
  '/assets/icons8-stripe-500_green.png',
  '/assets/icons8-stripe.svg',
  '/assets/icons8-stripe_white.svg',
  '/assets/icons8-tag-96.png',
  '/assets/icons8-tag-96_blue.png',
  '/assets/icons8-tag-96_green.png',
  '/assets/icons8-tag-96_white.png',
  '/assets/icons8-themes-90.png',
  '/assets/icons8-themes-90_blue.png',
  '/assets/icons8-themes-90_green.png',
  '/assets/icons8-themes-90_white.png',
  '/assets/icons8-user-90.png',
  '/assets/icons8-user-90_blue.png',
  '/assets/icons8-user-90_green.png',
  '/assets/instagradient.png',
  '/assets/left-arrow-svgrepo-com.svg',
  '/assets/lock icon.png',
  '/assets/login-default.png',
  '/assets/login-pressed.png',
  '/assets/menupic.png',
  '/assets/moon.png',
  '/assets/moon2.png',
  '/assets/moon2_blue.png',
  '/assets/news-icon.png',
  '/assets/pengcil.png',
  '/assets/plus.svg',
  '/assets/plus_blue.svg',
  '/assets/plus_green.svg',
  '/assets/plus_white.svg',
  '/assets/screenshot.png',
  '/assets/search-default.png',
  '/assets/search-favicon.png',
  '/assets/search-pressed.png',
  '/assets/settings-sliders.png',
  '/assets/shareicon.png',
  '/assets/shareiconbluebird.png',
  '/assets/shareicondark.png',
  '/assets/shareiconforest.png',
  '/assets/sun.png',
  '/assets/theme-screenshot.PNG',
  '/assets/vector.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.includes('/assets/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
