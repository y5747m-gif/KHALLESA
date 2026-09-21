import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Check,
  Globe,
  ListChecks,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { useStrings } from '../lib/i18n';
import { ensureNotificationPermission } from '../lib/notify';
import { cx, num } from '../lib/utils';

interface OnboardingProps {
  lang: Lang;
  onLang: (l: Lang) => void;
  onDone: (prefill?: string) => void;
}

export const EXAMPLE_BY_LANG: Record<Lang, string> = {
  ar: 'رخصة العربية هتخلص الشهر الجاي',
  en: 'My car license expires next month',
};

export default function Onboarding({ lang, onLang, onDone }: OnboardingProps) {
  const s = useStrings();
  const [step, setStep] = useState(0); // 0: language, 1..3: slides, 4: notifications
  const rtl = lang === 'ar';
  const NextIcon = rtl ? ArrowLeft : ArrowRight;

  const slides = [
    { Icon: MessageSquareText, title: s.ob1T, desc: s.ob1D },
    { Icon: ListChecks, title: s.ob2T, desc: s.ob2D },
    { Icon: Sparkles, title: s.ob3T, desc: s.ob3D },
  ];

  async function enableAndFinish(prefill?: string) {
    await ensureNotificationPermission(true);
    onDone(prefill);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-600 to-brand-700 p-5">
      <div className="animate-pop w-full max-w-md rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-neutral-900">
        <img src="./logo.svg" alt="KHALLESA" className="mx-auto h-16 w-16 rounded-3xl shadow-lg" />

        {step === 0 && (
          <div className="mt-4">
            <p className="flex items-center justify-center gap-2 text-lg font-black">
              <Globe size={20} className="text-brand-600" /> {s.obLangT}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <LangCard
                selected={lang === 'ar'}
                title="العربية"
                sub="مصري ١٠٠٪ 🇪🇬"
                onClick={() => onLang('ar')}
              />
              <LangCard
                selected={lang === 'en'}
                title="English"
                sub="Full support 🇬🇧"
                onClick={() => onLang('en')}
              />
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 font-black text-white"
            >
              {s.obNext} <NextIcon size={20} />
            </button>
          </div>
        )}

        {step >= 1 && step <= 3 && (
          <div className="mt-4">
            {(() => {
              const slide = slides[step - 1];
              const Icon = slide.Icon;
              return (
                <>
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-700/20">
                    <Icon size={38} />
                  </div>
                  <h1 className="mt-3 text-2xl font-black">{slide.title}</h1>
                  <p className="mt-2 text-sm leading-7 font-bold text-neutral-500 dark:text-neutral-400">{slide.desc}</p>
                </>
              );
            })()}
            <Dots total={3} active={step - 1} />
            <div className="mt-4 flex gap-2">
              {step > 1 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-2xl bg-black/5 px-5 py-3 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
                >
                  {s.back}
                </button>
              ) : null}
              <button
                onClick={() => setStep(step + 1)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 font-black text-white"
              >
                {step === 3 ? s.obStart : s.obNext} <NextIcon size={20} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="mt-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-100 text-amber-600 dark:bg-amber-900/30">
              <BellRing size={38} />
            </div>
            <p className="mt-3 font-black">{s.obNotif}</p>
            <button
              onClick={() => enableAndFinish()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 font-black text-white"
            >
              <Check size={18} /> {s.obEnable}
            </button>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onDone()}
                className="flex-1 rounded-2xl bg-black/5 py-2.5 text-sm font-extrabold text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
              >
                {s.obLater}
              </button>
              <button
                onClick={() => enableAndFinish(EXAMPLE_BY_LANG[lang])}
                className="flex-1 rounded-2xl bg-neutral-900 py-2.5 text-sm font-extrabold text-white dark:bg-white dark:text-neutral-900"
              >
                {s.obTryEx}
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] font-bold text-neutral-400">
          {s.slogan} • {num(1, lang) === '١' ? 'الإصدار ١٫١' : 'v1.1'}
        </p>
      </div>
    </div>
  );
}

function LangCard(props: { selected: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={cx(
        'relative rounded-2xl border-3 p-4 transition',
        props.selected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/15'
          : 'border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/5',
      )}
    >
      {props.selected && (
        <span className="absolute end-2 top-2 rounded-full bg-brand-500 p-1 text-white">
          <Check size={12} />
        </span>
      )}
      <span className="block text-xl font-black">{props.title}</span>
      <span className="block text-xs font-bold text-neutral-400">{props.sub}</span>
    </button>
  );
}

function Dots({ total, active }: { total: number; active: number }) {
  return (
    <div className="mt-4 flex justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cx('h-2 rounded-full transition-all', i === active ? 'w-7 bg-brand-500' : 'w-2 bg-black/15 dark:bg-white/15')}
        />
      ))}
    </div>
  );
}
