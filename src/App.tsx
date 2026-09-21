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
import { LangProvider, STR } from './lib/i18n';
import { useServiceWorker } from './lib/install';
import { applyStatusBar, initNativeShell, isNativeApp, onDeepLink, onNativeBack } from './lib/native';
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
import Onboarding from './components/Onboarding';

type Tab = 'home' | 'paths' | 'vault' | 'family' | 'more';

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
  const { updateReady, applyUpdate } = useServiceWorker();
  /** Resolved theme, also used to paint the native status bar. */
  const [dark, setDark] = useState(false);
  const native = useMemo(() => isNativeApp(), []);

  const lang = state.settings.lang;
  const s = STR[lang];
  const ranked = useMemo(() => rankTasks(state.tasks, lang), [state.tasks, lang]);
  const selected = selectedId ? (state.tasks.find((t) => t.id === selectedId) ?? null) : null;

  const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
    { id: 'home', label: s.navHome, Icon: HomeIcon },
    { id: 'paths', label: s.navPaths, Icon: Map },
    { id: 'vault', label: s.navVault, Icon: FolderOpen },
    { id: 'family', label: s.navFamily, Icon: Users },
    { id: 'more', label: s.navMore, Icon: Menu },
  ];

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  // direction + language
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // dark mode
  useEffect(() => {
    const root = document.documentElement;
    const mode = state.settings.darkMode;
    if (mode === 'dark') {
      root.classList.add('dark');
      setDark(true);
      return;
    }
    if (mode === 'light') {
      root.classList.remove('dark');
      setDark(false);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);
    setDark(mq.matches);
    const fn = (e: MediaQueryListEvent) => {
      root.classList.toggle('dark', e.matches);
      setDark(e.matches);
    };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [state.settings.darkMode]);

  // ── standalone-app shell ────────────────────────────────────────
  // status bar + splash + hardware back button (no-op on the web build)
  useEffect(() => {
    void initNativeShell();
  }, []);

  useEffect(() => {
    if (!native) return;
    void applyStatusBar(dark ? 'dark' : 'light');
  }, [dark, native]);

  // khallesa://new · khallesa://ai — jump straight to the right screen
  useEffect(() => {
    if (!native) return;
    return onDeepLink((action) => {
      if (action === 'new') openAdd();
      else if (action === 'ai') openAssistant();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  // Back button: task detail → current tab → home. Open sheets register
  // their own handler on top of this one, so they close first.
  useEffect(() => {
    if (!native) return;
    return onNativeBack(() => {
      if (selectedId) {
        setSelectedId(null);
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        window.scrollTo({ top: 0 });
        return true;
      }
      return false; // nothing left to unwind → exit the app
    });
  }, [native, selectedId, tab]);

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
    setState((prev) => ({
      ...prev,
      events: [{ id: uid('ev'), at: Date.now(), kind, text, taskId }, ...prev.events].slice(0, 200),
    }));
  }

  function modifyTask(id: string, fn: (t: KhTask) => KhTask) {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...fn(t), updatedAt: Date.now() } : t)),
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
    const evText = lang === 'ar' ? `بدأت مسار: ${full.title}` : `Started path: ${full.title}`;
    setState((prev) => ({
      ...prev,
      tasks: [full, ...prev.tasks],
      docs: [...docs, ...prev.docs],
      events: [{ id: uid('ev'), at: Date.now(), kind: 'created' as const, text: evText, taskId: full.id }, ...prev.events].slice(0, 200),
    }));
    if (state.settings.notificationsEnabled) {
      void ensureNotificationPermission(true).then(() => scheduleNativeReminders(full, lang));
    }
    setAddOpen(false);
    setAssistantOpen(false);
    showToast(s.tCreated);
    openTask(full.id);
  }

  function patchTask(id: string, patch: Partial<KhTask>) {
    modifyTask(id, (t) => ({ ...t, ...patch }));
    const t = state.tasks.find((x) => x.id === id);
    if (t) {
      const next = { ...t, ...patch };
      if (next.status === 'active' && next.deadline) void scheduleNativeReminders(next, lang);
      else void cancelNativeReminders(id);
    }
  }

  function toggleStep(taskId: string, stepId: string) {
    let title = '';
    let doneNow = false;
    modifyTask(taskId, (t) => ({
      ...t,
      steps: t.steps.map((stp) => {
        if (stp.id !== stepId) return stp;
        title = stp.title;
        doneNow = !stp.done;
        return { ...stp, done: !stp.done };
      }),
    }));
    if (title) {
      const ev = lang === 'ar'
        ? doneNow ? `خلصت خطوة: ${title}` : `رجعت خطوة: ${title}`
        : doneNow ? `Finished step: ${title}` : `Reopened step: ${title}`;
      log('step', ev, taskId);
      if (doneNow) showToast(s.tStepDone);
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
    if (label) {
      const ev = lang === 'ar'
        ? haveNow ? `جهزت مستند: ${label}` : `رجعت مستند: ${label}`
        : haveNow ? `Prepared doc: ${label}` : `Unmarked doc: ${label}`;
      log('doc', ev, taskId);
    }
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
    log('done', lang === 'ar' ? `خلصت مسار: ${t?.title ?? ''} 🎉` : `Finished path: ${t?.title ?? ''} 🎉`, id);
    void cancelNativeReminders(id);
    showToast(s.tCompleted);
  }

  function reopenTask(id: string) {
    modifyTask(id, (t) => ({ ...t, status: 'active' }));
    log('reopened', lang === 'ar' ? 'أعدت فتح مسار' : 'Reopened a path', id);
  }

  function deleteTask(id: string) {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
      docs: prev.docs.map((d) => (d.taskId === id ? { ...d, taskId: undefined } : d)),
    }));
    void cancelNativeReminders(id);
    setSelectedId(null);
    showToast(s.tDeleted);
  }

  // ── vault ops ─────────────────────────────────────────────────

  function addVaultPhoto(name: string, dataUrl: string, taskId?: string) {
    const doc: VaultDoc = { id: uid('doc'), name, kind: 'image', dataUrl, taskId, createdAt: Date.now() };
    setState((prev) => ({ ...prev, docs: [doc, ...prev.docs] }));
    if (taskId) modifyTask(taskId, (t) => ({ ...t, imageIds: [...t.imageIds, doc.id] }));
    showToast(s.tPhotoSaved);
  }

  function addVaultNote(text: string) {
    const doc: VaultDoc = {
      id: uid('doc'),
      name: text.slice(0, 40) || 'note',
      kind: 'note',
      text,
      createdAt: Date.now(),
    };
    setState((prev) => ({ ...prev, docs: [doc, ...prev.docs] }));
    showToast(s.tNoteSaved);
  }

  function deleteVaultDoc(id: string) {
    setState((prev) => ({
      ...prev,
      docs: prev.docs.filter((d) => d.id !== id),
      tasks: prev.tasks.map((t) => ({ ...t, imageIds: t.imageIds.filter((x) => x !== id) })),
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
    setState((prev) => ({ ...prev, members: [...prev.members, member] }));
    showToast(`${name} ${s.tMember}`);
  }

  function removeMember(id: string) {
    setState((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== id) }));
  }

  // ── settings / danger ─────────────────────────────────────────

  function patchSettings(patch: Partial<AppState['settings']>) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }

  function removeDemo() {
    setState((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => !t.demo) }));
    if (selected?.demo) setSelectedId(null);
    showToast(s.tDemoRemoved);
  }

  function clearAll() {
    setState(clearAllData({ lang }));
    setSelectedId(null);
    setTab('home');
    showToast(s.tCleared);
  }

  function finishOnboarding(prefill?: string) {
    patchSettings({ onboarded: true });
    if (prefill) {
      setTimeout(() => openAdd({ prefill }), 300);
    }
  }

  const me = state.members.find((m) => m.isMe) ?? state.members[0];
  const userName = state.settings.displayName.trim() || (me && !me.isMe ? me.name : '');

  // deep links used by the installed app shortcuts (?action=new | ?action=ai)
  useEffect(() => {
    if (!state.settings.onboarded) return;
    const action = new URLSearchParams(window.location.search).get('action');
    if (!action) return;
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    if (action === 'new') openAdd();
    if (action === 'ai') openAssistant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.onboarded]);

  // ── first run ─────────────────────────────────────────────────
  if (!state.settings.onboarded) {
    return (
      <LangProvider value={lang}>
        <Onboarding lang={lang} onLang={(l) => patchSettings({ lang: l, country: l === 'ar' ? 'مصر' : 'Egypt' })} onDone={finishOnboarding} />
      </LangProvider>
    );
  }

  return (
    <LangProvider value={lang}>
      <div className={cx('min-h-dvh', native && 'native-app')}>
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
                updateReady={updateReady}
                applyUpdate={applyUpdate}
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
    </LangProvider>
  );
}
