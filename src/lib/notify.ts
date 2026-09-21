import { Capacitor } from '@capacitor/core';
import type { KhTask } from './types';
import { daysUntil, parseISODate } from './utils';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Tasks that deserve the user's attention right now (overdue or ≤ 3 days). */
export function getAttentionTasks(tasks: KhTask[], from: Date = new Date()): KhTask[] {
  return tasks.filter((t) => {
    if (t.status !== 'active') return false;
    const d = daysUntil(t.deadline, from);
    return d !== null && d <= 3;
  });
}

export async function ensureNotificationPermission(enabled: boolean): Promise<boolean> {
  if (!enabled) return false;
  try {
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

/** Schedule native reminders: day-before 9AM + deadline-day 9AM. No-op on web. */
export async function scheduleNativeReminders(task: KhTask): Promise<void> {
  try {
    if (!isNative() || !task.deadline || task.status !== 'active') return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const d = parseISODate(task.deadline);
    if (!d) return;
    const idBase = Math.abs(hashCode(task.id)) % 100000;
    const at = (dayOffset: number) => {
      const dt = new Date(d);
      dt.setDate(dt.getDate() + dayOffset);
      dt.setHours(9, 0, 0, 0);
      return dt;
    };
    const now = new Date();
    const notifs = [];
    const before = at(-1);
    if (before.getTime() > now.getTime()) {
      notifs.push({
        id: idBase + 1,
        title: 'خَلِّصها — بكرة آخر موعد ⏰',
        body: `${task.title}: باقي يوم واحد`,
        schedule: { at: before },
        smallIcon: 'ic_launcher',
      });
    }
    const day = at(0);
    if (day.getTime() > now.getTime()) {
      notifs.push({
        id: idBase + 2,
        title: 'خَلِّصها — النهاردة آخر موعد 🔴',
        body: task.title,
        schedule: { at: day },
        smallIcon: 'ic_launcher',
      });
    }
    if (notifs.length > 0) await LocalNotifications.schedule({ notifications: notifs });
  } catch {
    /* notifications are best-effort */
  }
}

export async function cancelNativeReminders(taskId: string): Promise<void> {
  try {
    if (!isNative()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const idBase = Math.abs(hashCode(taskId)) % 100000;
    await LocalNotifications.cancel({ notifications: [{ id: idBase + 1 }, { id: idBase + 2 }] });
  } catch {
    /* noop */
  }
}

/** Fire an immediate local notification (used for test + in-app nudges on native). */
export async function pingNow(title: string, body: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{ id: Math.floor(Math.random() * 90000) + 1000, title, body }],
      });
      return true;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
