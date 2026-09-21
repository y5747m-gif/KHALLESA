import type { BuiltPlan } from './engine';
import type { AppSettings } from './types';
import { uid } from './utils';

// ─── Optional LLM enhancement (OpenAI-compatible, user key) ──────────

const SYSTEM_AR = `أنت "خَلِّصها"، مساعد مصري عملي يحوّل المشاكل لخطط تنفيذ.
أجب بصيغة JSON فقط بهذا الشكل:
{"summary":"...","steps":[{"title":"...","detail":"..."}],"docs":["..."]}
القواعد:
- اللهجة مصرية مبسطة وواضحة، الجمل قصيرة وعملية.
- من 4 إلى 7 خطوات مرتبة تنفيذيًا ومناسبة لمصر.
- لا تخترع رسومًا أو مواعيد أو قوانين محددة — لو مش متأكد اكتب "راجع الجهة الرسمية".
- المستندات: قائمة قصيرة بأسماء المستندات فقط.`;

const SYSTEM_EN = `You are "KHALLESA", a practical assistant that turns problems into action plans.
Reply with JSON only in this shape:
{"summary":"...","steps":[{"title":"...","detail":"..."}],"docs":["..."]}
Rules:
- Simple, clear, practical English; short sentences.
- 4 to 7 ordered steps suitable for Egypt.
- Never invent specific fees, dates or laws — when unsure write "check the official authority".
- Documents: a short list of document names only.`;

export async function enhanceWithAI(
  plan: BuiltPlan,
  rawInput: string,
  settings: AppSettings,
): Promise<Partial<BuiltPlan> | null> {
  const key = settings.apiKey.trim();
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${settings.apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.apiModel || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.4,
        messages: [
          { role: 'system', content: settings.lang === 'ar' ? SYSTEM_AR : SYSTEM_EN },
          {
            role: 'user',
            content: `User problem: ${rawInput}\nCurrent plan:\n${JSON.stringify({ title: plan.title, summary: plan.summary, steps: plan.steps.map((s) => s.title), docs: plan.docs.map((d) => d.label) })}\nImprove the plan for the same problem.`,
          },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      summary?: string;
      steps?: Array<{ title?: string; detail?: string }>;
      docs?: string[];
    };
    const out: Partial<BuiltPlan> = {};
    if (typeof parsed.summary === 'string' && parsed.summary.length > 10) {
      out.summary = parsed.summary.slice(0, 400);
    }
    if (Array.isArray(parsed.steps) && parsed.steps.length >= 3) {
      out.steps = parsed.steps.slice(0, 8).map((s) => ({
        id: uid('step'),
        title: String(s.title ?? 'Step').slice(0, 120),
        detail: s.detail ? String(s.detail).slice(0, 300) : undefined,
        done: false,
      }));
    }
    if (Array.isArray(parsed.docs) && parsed.docs.length > 0) {
      out.docs = parsed.docs.slice(0, 8).map((d) => ({
        id: uid('doc'),
        label: String(d).slice(0, 120),
        have: false,
      }));
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
