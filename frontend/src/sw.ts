/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

/**
 * PWA Service Worker - 离线缓存增强
 *
 * 策略：
 * - 静态资源（HTML/JS/CSS）：Cache First，优先从缓存读取，同时后台更新
 * - API 请求：Network First，优先网络，失败则回退缓存
 * - 版本化缓存名，激活时自动清理旧版本
 */

const CACHE_NAME = 'ai-quant-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
]

/** 可缓存的 API 路径前缀（Network First + 回退缓存） */
const API_CACHE_NAME = 'api-cache-v1'
const CACHEABLE_APIS = [
  '/api/models',
  '/api/prediction/predictions/my',
  '/api/signals',
]

/** 安装阶段：预缓存静态资源，跳过等待立即激活 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

/** 激活阶段：清理旧版本缓存，立即接管所有客户端 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

/** 请求拦截：根据 URL 特征选择缓存策略 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // API 请求：Network First，网络失败回退缓存
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

  // 普通 GET 请求：Cache First，后台静默更新缓存
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
