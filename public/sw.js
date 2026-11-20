/* TDAH Clock service worker: offline app shell + actionable notifications. */
const CACHE = 'tdah-clock-v3'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // network first for the page, cached shell when offline
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res })
        .catch(() => caches.match('./index.html')),
    )
    return
  }
  // cache first for hashed assets
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})

self.addEventListener('notificationclick', (e) => {
  const action = e.action || 'open'
  const data = e.notification.data || {}
  e.notification.close()
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const msg = { type: 'notification-action', action, key: data.key, taskId: data.taskId }
    if (all.length) {
      all[0].postMessage(msg)
      if (action === 'open' || action === 'snoozeAlarm' || !e.action) return all[0].focus()
      return
    }
    const params = new URLSearchParams({ na: action, key: data.key || '', task: data.taskId || '' })
    return self.clients.openWindow('./?' + params.toString())
  })())
})
