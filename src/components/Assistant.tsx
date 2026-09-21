import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import type { Answers, Detection, FamilyMember, KhTask, RankedTask } from '../lib/types';
import { CATEGORY_META } from '../lib/types';
import { buildTaskFromDetection, detect, nextStep } from '../lib/engine';
import { normAr } from '../lib/engine';
import { cx, formatShortDateAr } from '../lib/utils';
import { uid } from '../lib/utils';
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [flow, setFlow] = useState<Flow>({ stage: 'idle' });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMsgs([
      {
        id: uid('m'),
        role: 'bot',
        text: 'أهلًا! أنا خَلِّص AI 🤖\nمش شات عادي — قولي مشكلتك وأنا أحوّلها لمشروع بخطوات.\nجرّب: "أنا مسافر يوم 15 أكتوبر" أو "رخصة العربية هتخلص".',
      },
    ]);
    setInput('');
    setFlow({ stage: 'idle' });
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

  function handlePriorityQuestion(): boolean {
    const t = normAr(input);
    if (/(اعمل ايه|اعمل إيه|المهم|اولوي|اولويات|ابدأ بايه|ابدا بايه|ماذا افعل)/.test(t)) {
      const top = ranked.filter((r) => r.bucket !== 'done').slice(0, 3);
      if (top.length === 0) {
        botSay('كله خالص يا بطل! 🎉 مفيش حاجة معلقة دلوقتي.');
      } else {
        const lines = top.map(({ task, reason }, i) => {
          const nx = nextStep(task);
          return `${i + 1}⃣ ${task.title}\n   📌 ${reason}${nx ? `\n   👈 ابدأ بـ: ${nx.title}` : ''}`;
        });
        botSay(`بص على أهم ${top.length.toLocaleString('ar-EG')} حاجات عندك دلوقتي:\n\n${lines.join('\n\n')}`, {
          openTaskId: top[0].task.id,
        });
      }
      return true;
    }
    return false;
  }

  function send(textRaw?: string) {
    const text = (textRaw ?? input).trim();
    if (!text || thinking) return;
    push({ role: 'user', text });
    setInput('');

    if (flow.stage === 'idle') {
      if (handlePriorityQuestion()) return;
      const d = detect(text);
      const f: Flow = { stage: 'asking', detection: d, raw: text, qi: 0, answers: {} };
      setFlow(f);
      askQuestion(f, `فهمت إن دي: *${CATEGORY_META[d.category].label}* ✅\n${d.title}`);
    } else {
      const answers = { ...flow.answers };
      const q = flow.detection.questions[flow.qi];
      if (q) answers[q.id] = text;
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
    const skip = q.optional ? '\n(اختياري — اكتب "تخطي" لو مش عايز تجاوب)' : '';
    botSay(`${prefix ? prefix + '\n\n' : ''}❓ ${q.label}${skip}`, q.options ? { options: q.options } : undefined);
  }

  function answerOption(opt: string) {
    if (flow.stage !== 'asking') return;
    push({ role: 'user', text: opt });
    const q = flow.detection.questions[flow.qi];
    const answers = { ...flow.answers };
    if (q) answers[q.id] = opt;
    const next: Flow = { ...flow, answers, qi: flow.qi + 1 };
    setFlow(next);
    askQuestion(next);
  }

  function finishPlan(f: Extract<Flow, { stage: 'asking' }>) {
    const me = members.find((m) => m.isMe) ?? members[0];
    const task = buildTaskFromDetection(f.raw, f.detection, f.answers, 'assistant', {
      ownerId: me?.id,
      assigneeId: me?.id,
      followUp: true,
    });
    setFlow({ stage: 'idle' });
    botSay(
      `خطتك جاهزة 🎯\n*${task.title}*\n${task.summary}\n\n📋 ${task.steps.length.toLocaleString('ar-EG')} خطوات • 📄 ${task.docs.length.toLocaleString('ar-EG')} مستندات${task.deadline ? ` • 📅 ${formatShortDateAr(task.deadline)}` : ''}

اضغط "اعمل المسار" وأنا هتابعك لحد ما تخلص.`,
      { plan: task },
    );
  }

  function createPlan(plan: KhTask) {
    onCreate(plan);
    push({ role: 'bot', text: `تمام! عملت مسار "${plan.title}" وهتابعه معاك 🚀`, openTaskId: plan.id });
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
          <p className="font-black">خَلِّص AI</p>
          <p className="flex items-center gap-1 text-xs font-bold text-brand-600">
            <Sparkles size={12} /> بيحوّل كلامك لمشاريع بخطوات
          </p>
        </div>
        <button onClick={onClose} aria-label="إغلاق" className="rounded-full bg-black/5 p-2 dark:bg-white/10">
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
                m.role === 'user'
                  ? 'rounded-bl-md bg-brand-500 text-white'
                  : 'rounded-br-md bg-white dark:bg-neutral-900',
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
                  <span className="block text-xs font-extrabold">أول خطوتين:</span>
                  {m.plan.steps.slice(0, 2).map((s, i) => (
                    <span key={s.id} className="block text-xs">
                      {(i + 1).toLocaleString('ar-EG')}. {s.title}
                    </span>
                  ))}
                  <button
                    onClick={() => createPlan(m.plan as KhTask)}
                    className="mt-2 w-full rounded-xl bg-brand-500 py-2 text-sm font-black text-white"
                  >
                    اعمل المسار 🚀
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
                  افتح المسار
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-br-md bg-white px-4 py-3 text-sm font-bold text-neutral-500 shadow-sm dark:bg-neutral-900">
              <Loader2 size={16} className="animate-spin" /> بيفكر…
            </div>
          </div>
        )}
      </div>

      {/* input */}
      <div className="pb-safe border-t border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="قولي مشكلتك…"
            className="flex-1 rounded-2xl border-2 border-black/10 bg-black/[0.02] px-4 py-2.5 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
          />
          <button
            onClick={() => send()}
            aria-label="إرسال"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white"
          >
            <Send size={18} className="-scale-x-100" />
          </button>
        </div>
        <p className="mx-auto mt-1.5 w-full max-w-2xl text-center text-[11px] text-neutral-400">
          جرّب تسأل: "أعمل إيه الأول؟" — هيرتبلك أولوياتك 🧠
        </p>
      </div>
    </div>
  );
}
