import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import type { Answers, Detection, FamilyMember, KhTask, RankedTask } from '../lib/types';
import { catLabel, useLang, useStrings } from '../lib/i18n';
import { buildTaskFromDetection, detect, nextStep, normAr } from '../lib/engine';
import { cx, formatShortDate, num, uid } from '../lib/utils';
import { Chip } from './ui';

interface AssistantProps {
  open: boolean;
  sessionKey: number;
  ranked: RankedTask[];
  members: FamilyMember[];
  onClose: () => void;
  onCreate: (task: KhTask) => void;
  onOpenTask: (id: string) => void;
}

interface Msg {
  id: string;
  role: 'bot' | 'user';
  text: string;
  options?: string[];
  plan?: KhTask;
  openTaskId?: string;
}

type Flow =
  | { stage: 'idle' }
  | { stage: 'asking'; detection: Detection; raw: string; qi: number; answers: Answers };

export default function Assistant({ open, sessionKey, ranked, members, onClose, onCreate, onOpenTask }: AssistantProps) {
  const s = useStrings();
  const lang = useLang();
  const rtl = lang === 'ar';
  const userCorner = rtl ? 'rounded-bl-md' : 'rounded-br-md';
  const botCorner = rtl ? 'rounded-br-md' : 'rounded-bl-md';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [flow, setFlow] = useState<Flow>({ stage: 'idle' });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMsgs([{ id: uid('m'), role: 'bot', text: s.aiHello }]);
    setInput('');
    setFlow({ stage: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, thinking]);

  function push(m: Omit<Msg, 'id'>) {
    setMsgs((prev) => [...prev, { ...m, id: uid('m') }]);
  }

  function botSay(text: string, extra?: Partial<Msg>) {
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      push({ role: 'bot', text, ...extra });
    }, 550);
  }

  function handlePriorityQuestion(text: string): boolean {
    const t = normAr(text);
    const isAr = /(اعمل ايه|اعمل إيه|المهم|اولوي|اولويات|ابدأ بايه|ابدا بايه|ماذا افعل)/.test(t);
    const isEn = /(what.*first|what should i do|priorit|most important|top tasks)/.test(t);
    if (!isAr && !isEn) return false;
    const top = ranked.filter((r) => r.bucket !== 'done').slice(0, 3);
    if (top.length === 0) {
      botSay(s.aiAllClear);
    } else {
      const lines = top.map(({ task, reason }, i) => {
        const nx = nextStep(task);
        return `${num(i + 1, lang)}⃣ ${task.title}\n   📌 ${reason}${nx ? `\n   👈 ${s.aiStartWith} ${nx.title}` : ''}`;
      });
      botSay(`${s.aiTopN} ${num(top.length, lang)} ${s.aiThings}\n\n${lines.join('\n\n')}`, {
        openTaskId: top[0].task.id,
      });
    }
    return true;
  }

  function send(textRaw?: string) {
    const text = (textRaw ?? input).trim();
    if (!text || thinking) return;
    push({ role: 'user', text });
    setInput('');

    if (flow.stage === 'idle') {
      if (handlePriorityQuestion(text)) return;
      const d = detect(text, lang);
      const f: Flow = { stage: 'asking', detection: d, raw: text, qi: 0, answers: {} };
      setFlow(f);
      askQuestion(f, `${s.aiUnderstood} *${catLabel(d.category, lang)}* ✅\n${d.title}`);
    } else {
      const answers = { ...flow.answers };
      const q = flow.detection.questions[flow.qi];
      const skipped = /^(تخطي|skip)$/i.test(text);
      if (q && !skipped) answers[q.id] = text;
      const next: Flow = { ...flow, answers, qi: flow.qi + 1 };
      setFlow(next);
      askQuestion(next);
    }
  }

  function askQuestion(f: Flow, prefix?: string) {
    if (f.stage !== 'asking') return;
    const q = f.detection.questions[f.qi];
    if (!q) {
      finishPlan(f);
      return;
    }
    const skip = q.optional ? `\n${s.aiSkip}` : '';
    const options = q.options ? [...q.options, ...(q.optional ? [lang === 'ar' ? 'تخطي' : 'Skip'] : [])] : undefined;
    botSay(`${prefix ? prefix + '\n\n' : ''}❓ ${q.label}${skip}`, options ? { options } : undefined);
  }

  function answerOption(opt: string) {
    if (flow.stage !== 'asking') return;
    push({ role: 'user', text: opt });
    const q = flow.detection.questions[flow.qi];
    const answers = { ...flow.answers };
    const skipped = /^(تخطي|Skip)$/i.test(opt);
    if (q && !skipped) answers[q.id] = opt;
    const next: Flow = { ...flow, answers, qi: flow.qi + 1 };
    setFlow(next);
    askQuestion(next);
  }

  function finishPlan(f: Extract<Flow, { stage: 'asking' }>) {
    const me = members.find((m) => m.isMe) ?? members[0];
    const task = buildTaskFromDetection(f.raw, f.detection, f.answers, 'assistant', lang, {
      ownerId: me?.id,
      assigneeId: me?.id,
      followUp: true,
    });
    setFlow({ stage: 'idle' });
    botSay(
      `${s.aiPlanReady}\n*${task.title}*\n${task.summary}\n\n📋 ${num(task.steps.length, lang)} • 📄 ${num(task.docs.length, lang)}${task.deadline ? ` • 📅 ${formatShortDate(task.deadline, lang)}` : ''}\n\n${s.aiPressMake}`,
      { plan: task },
    );
  }

  function createPlan(plan: KhTask) {
    onCreate(plan);
    push({ role: 'bot', text: `${s.aiCreated} "${plan.title}" ${s.aiCreated2}`, openTaskId: plan.id });
  }

  if (!open) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-[#f4f6f5] dark:bg-[#0c1210]">
      {/* header */}
      <div className="pt-safe flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <span className="rounded-2xl bg-gradient-to-bl from-brand-500 to-brand-700 p-2.5 text-white">
          <Bot size={22} />
        </span>
        <div className="flex-1">
          <p className="font-black">{s.aiTitle}</p>
          <p className="flex items-center gap-1 text-xs font-bold text-brand-600">
            <Sparkles size={12} /> {s.aiSub}
          </p>
        </div>
        <button onClick={onClose} aria-label={s.close} className="rounded-full bg-black/5 p-2 dark:bg-white/10">
          <X size={18} />
        </button>
      </div>

      {/* messages */}
      <div ref={listRef} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
        {msgs.map((m) => (
          <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-7 font-bold whitespace-pre-wrap shadow-sm',
                m.role === 'user' ? `${userCorner} bg-brand-500 text-white` : `${botCorner} bg-white dark:bg-neutral-900`,
              )}
            >
              {m.text}
              {m.options && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {m.options.map((o) => (
                    <Chip key={o} onClick={() => answerOption(o)}>
                      {o}
                    </Chip>
                  ))}
                </span>
              )}
              {m.plan && (
                <span className="mt-2 block rounded-xl bg-black/[0.04] p-2.5 dark:bg-white/5">
                  <span className="block text-xs font-extrabold">{s.aiFirstTwo}</span>
                  {m.plan.steps.slice(0, 2).map((stp, i) => (
                    <span key={stp.id} className="block text-xs">
                      {num(i + 1, lang)}. {stp.title}
                    </span>
                  ))}
                  <button
                    onClick={() => createPlan(m.plan as KhTask)}
                    className="mt-2 w-full rounded-xl bg-brand-500 py-2 text-sm font-black text-white"
                  >
                    {s.aiMakePath}
                  </button>
                </span>
              )}
              {m.openTaskId && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenTask(m.openTaskId as string);
                  }}
                  className="mt-2 w-full rounded-xl bg-neutral-900 py-2 text-xs font-extrabold text-white dark:bg-white dark:text-neutral-900"
                >
                  {s.aiOpenPath}
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className={cx('flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-neutral-500 shadow-sm dark:bg-neutral-900', botCorner)}>
              <Loader2 size={16} className="animate-spin" /> {s.aiThinking}
            </div>
          </div>
        )}
      </div>

      {/* quick suggestions */}
      {flow.stage === 'idle' && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-1">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {[s.aiSug1, s.aiSug2, s.aiSug3].map((sug) => (
              <button
                key={sug}
                onClick={() => send(sug)}
                className="shrink-0 rounded-full border border-brand-500/40 bg-white px-3.5 py-1.5 text-xs font-extrabold text-brand-700 shadow-sm dark:bg-neutral-900 dark:text-brand-400"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* input */}
      <div className="pb-safe border-t border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder={s.aiInputPh}
            className="flex-1 rounded-2xl border-2 border-black/10 bg-black/[0.02] px-4 py-2.5 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
          />
          <button
            onClick={() => send()}
            aria-label={s.aiSend}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white"
          >
            <Send size={18} className={rtl ? '-scale-x-100' : ''} />
          </button>
        </div>
        <p className="mx-auto mt-1.5 w-full max-w-2xl text-center text-[11px] text-neutral-400">
          {s.aiTry}
        </p>
      </div>
    </div>
  );
}
