const CACHE_NAME = 'ronix-steel-rev10-readable-v1';
const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

const READABILITY_STYLE = `
<style id="ronix-readability-rev10">
/* RONIX Rev10 — professional readability upgrade (~15%) */
@media screen {
  th {
    font-size: 15px !important;
    line-height: 1.35 !important;
    padding: 12px 11px !important;
    font-weight: 900 !important;
  }
  td {
    font-size: 15px !important;
    line-height: 1.48 !important;
    padding: 11px 11px !important;
    font-weight: 600 !important;
  }
  .scope-list li {
    font-size: 15px !important;
    line-height: 1.58 !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
  }
  .terms-section .scope-list li,
  .exclusions-section .scope-list li {
    padding-top: 15px !important;
    padding-bottom: 15px !important;
  }
  .terms-section .scope-list li span,
  .exclusions-section .scope-list li span,
  #durationLine,
  #durationSuffixText {
    line-height: 1.72 !important;
  }
  .branch-title {
    font-size: 14px !important;
    line-height: 1.45 !important;
  }
  .info-card p {
    font-size: 14.5px !important;
    line-height: 1.55 !important;
  }
  .total-table td {
    font-size: 14.5px !important;
    font-weight: 800 !important;
  }
}

@media print {
  /* Approx. 15% larger text while keeping compact spacing for 2-page output */
  th {
    font-size: 10.1px !important;
    line-height: 1.25 !important;
    padding: 1.85mm 1.75mm !important;
  }
  td {
    font-size: 10px !important;
    line-height: 1.28 !important;
    padding: 1.65mm 1.75mm !important;
  }
  .scope-list li {
    font-size: 9.55px !important;
    line-height: 1.38 !important;
    padding: .34mm 0 !important;
  }
  .branch-title {
    font-size: 10px !important;
    line-height: 1.25 !important;
  }
  .total-table td {
    font-size: 10.1px !important;
    line-height: 1.25 !important;
  }
  .terms-section .scope-list li,
  .exclusions-section .scope-list li {
    padding: 3.2mm 0 !important;
  }
}
</style>`;

async function enhanceHtmlResponse(response) {
  try {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();
    if (!html.includes('ronix-readability-rev10')) {
      html = html.replace('</head>', `${READABILITY_STYLE}\n</head>`);
    }

    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.delete('content-length');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return response;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isDocument = event.request.mode === 'navigate' || event.request.destination === 'document';

  if (isDocument) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request, { cache: 'no-store' });
        const rawCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, rawCopy));
        return await enhanceHtmlResponse(networkResponse);
      } catch (error) {
        const cached = await caches.match(event.request) || await caches.match('./index.html');
        return cached ? await enhanceHtmlResponse(cached) : Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
