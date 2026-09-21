import { buildTaskFromDetection, detect } from './engine';
import type { ActivityEvent, AppSettings, AppState, FamilyMember, KhTask } from './types';
import { addDaysISO, todayISO, uid } from './utils';

const KEY = 'khallesa-v1';

export function defaultSettings(): AppSettings {
  return {
    displayName: '',
    country: 'مصر',
    darkMode: 'system',
    notificationsEnabled: true,
    apiKey: '',
    apiBase: 'https://api.openai.com/v1',
    apiModel: 'gpt-4o-mini',
  };
}

function seedTasks(): KhTask[] {
  const t1in = 'رخصة العربية هتخلص الشهر الجاي';
  const d1 = detect(t1in);
  d1.deadline = addDaysISO(todayISO(), 24);
  const t1 = buildTaskFromDetection(t1in, d1, { licenseType: 'تسيير ملاكي', unit: 'مدينة نصر' }, 'text', {
    demo: true,
  });
  t1.steps[0].done = true;
  t1.docs[0].have = true;
  t1.docs[1].have = true;
  t1.createdAt = Date.now() - 3 * 86400000;
  t1.updatedAt = Date.now() - 86400000;

  const t2in = 'فاتورة الكهرباء آخر موعد بعد 5 أيام';
  const d2 = detect(t2in);
  const t2 = buildTaskFromDetection(t2in, d2, { billType: 'كهرباء' }, 'text', { demo: true });
  t2.createdAt = Date.now() - 86400000;
  t2.updatedAt = Date.now() - 86400000;

  return [t1, t2];
}

export function createSeedState(): AppState {
  const me: FamilyMember = {
    id: uid('member'),
    name: 'أنا',
    relation: 'صاحب الحساب',
    color: '#0ea968',
    isMe: true,
  };
  const tasks = seedTasks();
  tasks[0].ownerId = me.id;
  tasks[0].assigneeId = me.id;
  tasks[1].ownerId = me.id;
  tasks[1].assigneeId = me.id;
  const events: ActivityEvent[] = tasks.map((t, i) => ({
    id: uid('ev'),
    at: Date.now() - (3 - i) * 86400000,
    kind: 'created',
    text: `بدأت مسار: ${t.title}`,
    taskId: t.id,
  }));
  return { tasks, docs: [], members: [me], events, settings: defaultSettings(), seeded: true };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!Array.isArray(parsed.tasks)) return createSeedState();
    return {
      tasks: parsed.tasks ?? [],
      docs: parsed.docs ?? [],
      members: parsed.members ?? [],
      events: parsed.events ?? [],
      settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
      seeded: true,
    };
  } catch {
    return createSeedState();
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // quota exceeded (too many photos) — state stays in memory for this session
    console.warn('KHALLESA: storage full, running in-memory');
  }
}

export function clearAllData(): AppState {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  return { tasks: [], docs: [], members: [], events: [], settings: defaultSettings(), seeded: true };
}
