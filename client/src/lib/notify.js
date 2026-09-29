/** Browser notifications (PRD "nice to have"). Falls back silently when unavailable. */
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function browserNotify(title, body) {
  try {
    if (notificationsSupported() && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(title, { body, icon: '/favicon.svg', tag: title });
    }
    if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
  } catch {
    /* notifications are best-effort */
  }
}
