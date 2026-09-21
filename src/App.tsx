import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Home as HomeIcon, Map, Menu, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppState, FamilyMember, KhTask, VaultDoc } from './lib/types';
import { clearAllData, loadState, saveState } from './lib/store';
import { rankTasks } from './lib/engine';
import {
  cancelNativeReminders,
  ensureNotificationPermission,
  scheduleNativeReminders,
} from './lib/notify';
import { cx, uid } from './lib/utils';
import Home from './components/Home';
import type { AddRequest } from './components/Home';
import Paths from './components/Paths';
import Vault from './components/Vault';
import Family, { nextMemberColor } from './components/Family';
import More from './components/More';
import TaskDetail from './components/TaskDetail';
import AddFlow from './components/AddFlow';
import Assistant from './components/Assistant';

type Tab = 'home' | 'paths' | 'vault' | 'family' | 'more';

const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: 'home', label: 'الرئيسية', Icon: HomeIcon },
  { id: 'paths', label: 'مساراتي', Icon: Map },
  { id: 'vault', label: 'الوثائق', Icon: FolderOpen },
  { id: 'family', label: 'العائلة', Icon: Users },
  { id: 'more', label: 'المزيد', Icon: Menu },
];

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSession, setAddSession] = useState(0);
  const [addReq, setAddReq] = useState<AddRequest | undefined>(undefined);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSession, setAssistantSession] = useState(0);
  const [toast, setToast] = useState<{ id: string; msg: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const ranked = useMemo(() => rankTasks(state.tasks), [state.tasks]);
  const selected = selectedId ? (state.tasks.find((t) => t.id === selectedId) ?? null) : null;

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  // dark mode
  useEffect(() => {
    const root = document.documentElement;
    const mode = state.settings.darkMode;
    if (mode === 'dark') {
      root.classList.add('dark');
      return;
    }
    if (mode === 'light') {
      root.classList.remove('dark');
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);
    const fn = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [state.settings.darkMode]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(msg: string) {
    window.clearTimeout(toastTimer.current);
    setToast({ id: uid('toast'), msg });
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  function openTask(id: string) {
    setSelectedId(id);
    window.scrollTo({ top: 0 });
  }

  function openAdd(req?: AddRequest) {
    setAddReq(req);
    setAddSession((k) => k + 1);
    setAddOpen(true);
  }

  function openAssistant() {
    setAssistantSession((k) => k + 1);
    setAssistantOpen(true);
  }

  // ── task ops ──────────────────────────────────────────────────

  function log(kind: 'created' | 'step' | 'doc' | 'done' | 'reopened' | 'note', text: string, taskId?: string) {
    setState((s) => ({
      ...s,
      events: [{ id: uid('ev'), at: Date.now(), kind, text, taskId }, ...s.events].slice(0, 200),
    }));
  }

  function modifyTask(id: string, fn: (t: KhTask) => KhTask) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)),
    }));
  }

  function createTask(task: KhTask, images: Array<{ name: string; dataUrl: string }>) {
    const docs: VaultDoc[] = images.map((img) => ({
      id: uid('doc'),
      name: img.name,
      kind: 'image',
      dataUrl: img.dataUrl,
      taskId: task.id,
      createdAt: Date.now(),
    }));
    const full: KhTask = { ...task, imageIds: docs.map((d) => d.id) };
    setState((s) => ({
      ...s,
      tasks: [full, ...s.tasks],
      docs: [...docs, ...s.docs],
      events: [{ id: uid('ev'), at: Date.now(), kind: 'created' as const, text: `بدأت مسار: ${full.title}`, taskId: full.id }, ...s.events].slice(0, 200),
    }));
    if (state.settings.notificationsEnabled) {
      void ensureNotificationPermission(true).then(() => scheduleNativeReminders(full));
    }
    setAddOpen(false);
    setAssistantOpen(false);
    showToast('اتعمل المسار — يلا نخلصها 🚀');
    openTask(full.id);
  }

  function patchTask(id: string, patch: Partial<KhTask>) {
    modifyTask(id, (t) => ({ ...t, ...patch }));
    const t = state.tasks.find((x) => x.id === id);
    if (t) {
      const next = { ...t, ...patch };
      if (next.status === 'active' && next.deadline) void scheduleNativeReminders(next);
      else void cancelNativeReminders(id);
    }
  }

  function toggleStep(taskId: string, stepId: string) {
    let title = '';
    let doneNow = false;
    modifyTask(taskId, (t) => ({
      ...t,
      steps: t.steps.map((s) => {
        if (s.id !== stepId) return s;
        title = s.title;
        doneNow = !s.done;
        return { ...s, done: !s.done };
      }),
    }));
    if (title) {
      log('step', doneNow ? `خلصت خطوة: ${title}` : `رجعت خطوة: ${title}`, taskId);
      if (doneNow) showToast('خطوة خلصت — كمّل 💪');
    }
  }

  function toggleDoc(taskId: string, docId: string) {
    let label = '';
    let haveNow = false;
    modifyTask(taskId, (t) => ({
      ...t,
      docs: t.docs.map((d) => {
        if (d.id !== docId) return d;
        label = d.label;
        haveNow = !d.have;
        return { ...d, have: !d.have };
      }),
    }));
    if (label) log('doc', haveNow ? `جهزت مستند: ${label}` : `رجعت مستند: ${label}`, taskId);
  }

  function addStep(taskId: string, title: string) {
    modifyTask(taskId, (t) => ({ ...t, steps: [...t.steps, { id: uid('step'), title, done: false }] }));
  }

  function addDocLabel(taskId: string, label: string) {
    modifyTask(taskId, (t) => ({ ...t, docs: [...t.docs, { id: uid('doc'), label, have: false }] }));
  }

  function completeTask(id: string) {
    modifyTask(id, (t) => ({ ...t, status: 'done' }));
    const t = state.tasks.find((x) => x.id === id);
    log('done', `خلصت مسار: ${t?.title ?? ''} 🎉`, id);
    void cancelNativeReminders(id);
    showToast('خلصتها! عاش يا بطل 🎉');
  }

  function reopenTask(id: string) {
    modifyTask(id, (t) => ({ ...t, status: 'active' }));
    log('reopened', 'أعدت فتح مسار', id);
  }

  function deleteTask(id: string) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== id),
      docs: s.docs.map((d) => (d.taskId === id ? { ...d, taskId: undefined } : d)),
    }));
    void cancelNativeReminders(id);
    setSelectedId(null);
    showToast('اتمسح المسار');
  }

  // ── vault ops ─────────────────────────────────────────────────

  function addVaultPhoto(name: string, dataUrl: string, taskId?: string) {
    const doc: VaultDoc = { id: uid('doc'), name, kind: 'image', dataUrl, taskId, createdAt: Date.now() };
    setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
    if (taskId) modifyTask(taskId, (t) => ({ ...t, imageIds: [...t.imageIds, doc.id] }));
    showToast('اتحفظت في الوثائق 🗂️');
  }

  function addVaultNote(text: string) {
    const doc: VaultDoc = {
      id: uid('doc'),
      name: text.slice(0, 40) || 'ملاحظة',
      kind: 'note',
      text,
      createdAt: Date.now(),
    };
    setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
    showToast('اتحفظت الملاحظة ✍️');
  }

  function deleteVaultDoc(id: string) {
    setState((s) => ({
      ...s,
      docs: s.docs.filter((d) => d.id !== id),
      tasks: s.tasks.map((t) => ({ ...t, imageIds: t.imageIds.filter((x) => x !== id) })),
    }));
  }

  // ── family ops ────────────────────────────────────────────────

  function addMember(name: string, relation: string) {
    const member: FamilyMember = {
      id: uid('member'),
      name,
      relation,
      color: nextMemberColor(state.members.length),
      isMe: state.members.length === 0,
    };
    setState((s) => ({ ...s, members: [...s.members, member] }));
    showToast(`انضم ${name} للعائلة 👨‍👩‍👧‍👦`);
  }

  function removeMember(id: string) {
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
  }

  // ── settings / danger ─────────────────────────────────────────

  function patchSettings(patch: Partial<AppState['settings']>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }

  function removeDemo() {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => !t.demo) }));
    if (selected?.demo) setSelectedId(null);
    showToast('اتمسحت بيانات التجربة');
  }

  function clearAll() {
    setState(clearAllData());
    setSelectedId(null);
    setTab('home');
    showToast('اتمسح كل حاجة — بداية جديدة ✨');
  }

  const me = state.members.find((m) => m.isMe) ?? state.members[0];
  const userName = state.settings.displayName.trim() || (me && !me.isMe ? me.name : '');

  return (
    <div className="min-h-dvh">
      {selected ? (
        <TaskDetail
          task={selected}
          members={state.members}
          photos={state.docs.filter((d) => d.taskId === selected.id && d.kind === 'image')}
          onBack={() => setSelectedId(null)}
          onToggleStep={(sid) => toggleStep(selected.id, sid)}
          onToggleDoc={(did) => toggleDoc(selected.id, did)}
          onAddStep={(title) => addStep(selected.id, title)}
          onAddDoc={(label) => addDocLabel(selected.id, label)}
          onPatch={(patch) => patchTask(selected.id, patch)}
          onComplete={() => completeTask(selected.id)}
          onReopen={() => reopenTask(selected.id)}
          onDelete={() => deleteTask(selected.id)}
          onAddPhoto={(name, dataUrl) => addVaultPhoto(name, dataUrl, selected.id)}
        />
      ) : (
        <>
          {tab === 'home' && (
            <Home
              userName={userName}
              ranked={ranked}
              onAdd={openAdd}
              onOpenTask={openTask}
              onOpenAssistant={openAssistant}
              onToggleStar={(id) => {
                const t = state.tasks.find((x) => x.id === id);
                if (t) patchTask(id, { starred: !t.starred });
              }}
            />
          )}
          {tab === 'paths' && <Paths ranked={ranked} onOpenTask={openTask} onAdd={() => openAdd()} />}
          {tab === 'vault' && (
            <Vault
              docs={state.docs}
              tasks={state.tasks}
              onAddPhoto={(name, dataUrl) => addVaultPhoto(name, dataUrl)}
              onAddNote={addVaultNote}
              onDelete={deleteVaultDoc}
              onOpenTask={openTask}
            />
          )}
          {tab === 'family' && (
            <Family
              members={state.members}
              tasks={state.tasks}
              onAdd={addMember}
              onRemove={removeMember}
              onOpenTask={openTask}
            />
          )}
          {tab === 'more' && (
            <More
              settings={state.settings}
              events={state.events}
              tasks={state.tasks}
              docsCount={state.docs.length}
              hasDemo={state.tasks.some((t) => t.demo)}
              onSettings={patchSettings}
              onRemoveDemo={removeDemo}
              onClearAll={clearAll}
            />
          )}

          {/* bottom nav */}
          <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
            <div className="mx-auto grid w-full max-w-2xl grid-cols-5">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    window.scrollTo({ top: 0 });
                  }}
                  className={cx(
                    'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-extrabold transition',
                    tab === id ? 'text-brand-600 dark:text-brand-500' : 'text-neutral-400',
                  )}
                >
                  <Icon size={21} />
                  {label}
                  {tab === id && <span className="h-1 w-6 rounded-full bg-brand-500" />}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}

      {/* overlays */}
      <AddFlow
        open={addOpen}
        sessionKey={addSession}
        prefill={addReq?.prefill}
        mode={addReq?.mode}
        members={state.members}
        settings={state.settings}
        onClose={() => setAddOpen(false)}
        onCreate={createTask}
      />
      <Assistant
        open={assistantOpen}
        sessionKey={assistantSession}
        ranked={ranked}
        members={state.members}
        onClose={() => setAssistantOpen(false)}
        onCreate={(task) => createTask(task, [])}
        onOpenTask={openTask}
      />

      {/* toast */}
      {toast && (
        <div key={toast.id} className="animate-pop fixed bottom-24 left-1/2 z-[60] -translate-x-1/2">
          <div className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-extrabold whitespace-nowrap text-white shadow-xl dark:bg-white dark:text-neutral-900">
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
