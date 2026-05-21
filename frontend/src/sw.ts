/// <reference lib="webworker" />

const CACHE_NAME = 'ai-quant-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
]

const API_CACHE_NAME = 'api-cache-v1'
const CACHEABLE_APIS = [
  '/api/models',
  '/api/prediction/predictions/my',
  '/api/signals',
]

const _self = self as unknown as ServiceWorkerGlobalScope

_self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  _self.skipWaiting()
})

_self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  ;(_self as any).clients.claim()
})

_self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  if (CACHEABLE_APIS.some((api) => url.pathname.startsWith(api))) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          })
          .catch(() => cache.match(event.request))
      )
    )
    return
  }

  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
            }
            return response
          })
          .catch(() => cached)
        return cached || fetched
      })
    )
  }
})
