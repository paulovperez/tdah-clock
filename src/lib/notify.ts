/**
 * System notifications via the service worker (so action buttons work), with graceful fallback.
 */
import type { Reminder } from '../store/types'

let reg: ServiceWorkerRegistration | null = null

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  if (import.meta.env.DEV) return null // avoid stale caches while developing
  try {
    reg = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
    return reg
  } catch (e) {
    console.warn('SW registration failed', e)
    return null
  }
}

export function notificationsSupported() {
  return typeof Notification !== 'undefined'
}

export function permission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

export async function askPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch { /* ignore */ }
}

export async function showSystem(r: Reminder | { key: string; title: string; body: string; important?: boolean; taskId?: string; alarm?: boolean }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const isTask = 'taskId' in r && !!r.taskId
  const options: NotificationOptions & { actions?: { action: string; title: string }[]; vibrate?: number[]; renotify?: boolean } = {
    body: r.body,
    tag: r.key,
    icon: import.meta.env.BASE_URL + 'icon.svg',
    badge: import.meta.env.BASE_URL + 'icon.svg',
    requireInteraction: !!r.important || ('alarm' in r && !!r.alarm),
    renotify: true,
    vibrate: r.important ? [200, 100, 200, 100, 200] : [150],
    data: { key: r.key, taskId: isTask ? (r as Reminder).taskId : undefined },
    actions: isTask
      ? [{ action: 'done', title: '✓ Feito' }, { action: 'snooze15', title: '+15 min' }]
      : ('alarm' in r && r.alarm ? [{ action: 'snoozeAlarm', title: 'Soneca' }, { action: 'open', title: 'Abrir' }] : []),
  }
  try {
    const registration = reg ?? (await navigator.serviceWorker?.getRegistration())
    if (registration) await registration.showNotification(r.title, options)
    else new Notification(r.title, options)
  } catch {
    try { new Notification(r.title, { body: r.body, tag: r.key }) } catch { /* ignore */ }
  }
}

export async function closeSystem(tag: string) {
  try {
    const registration = reg ?? (await navigator.serviceWorker?.getRegistration())
    const list = await registration?.getNotifications({ tag })
    list?.forEach((n) => n.close())
  } catch { /* ignore */ }
}
