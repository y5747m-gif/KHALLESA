import type {
  Answers,
  CategoryId,
  Consequence,
  Detection,
  KhTask,
  PathId,
  PlanDoc,
  PlanStep,
  Question,
  RankedTask,
  SourceRef,
  TrustLevel,
} from './types';
import { addDaysISO, daysUntil, formatShortDateAr, toISODate, uid } from './utils';

// ═══════════════════════════════════════════════════════════════════
//  محرك خَلِّصها — يحوّل "المشكلة" إلى "خطة تنفيذ"
//  Problem → Action Plan → Execution → Proof
// ═══════════════════════════════════════════════════════════════════

// ─── Arabic normalization ──────────────────────────────────────────

const AR_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normAr(s: string): string {
  return s
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

const BOUND = '[\\s،,.:؛!؟()\\-_"\'/]';
function hasWord(text: string, kw: string): boolean {
  if (kw.length <= 4) {
    return new RegExp(`(^|${BOUND})${kw}($|${BOUND})`).test(text);
  }
  return text.includes(kw);
}

// ─── date parsing (Arabic) ─────────────────────────────────────────

const AR_MONTHS: Array<{ m: number; names: string[] }> = [
  { m: 1, names: ['يناير', 'جانفي', 'january', 'jan'] },
  { m: 2, names: ['فبراير', 'فيفري', 'february', 'feb'] },
  { m: 3, names: ['مارس', 'marsh', 'march', 'mar'] },
  { m: 4, names: ['ابريل', 'افريل', 'april', 'apr'] },
  { m: 5, names: ['مايو', 'ماي', 'may'] },
  { m: 6, names: ['يونيو', 'يونيه', ' جوان', 'june', 'jun'] },
  { m: 7, names: ['يوليو', 'يوليه', 'جويلية', 'july', 'jul'] },
  { m: 8, names: ['اغسطس', 'اوت', 'august', 'aug'] },
  { m: 9, names: ['سبتمبر', 'september', 'sep', 'sept'] },
  { m: 10, names: ['اكتوبر', 'october', 'oct'] },
  { m: 11, names: ['نوفمبر', 'november', 'nov'] },
  { m: 12, names: ['ديسمبر', 'december', 'dec'] },
];

function monthFromName(t: string): number | null {
  for (const { m, names } of AR_MONTHS) {
    if (names.some((n) => n.trim() && t.includes(n.trim()))) return m;
  }
  return null;
}

/** Extract a deadline from Egyptian-Arabic free text. Returns ISO date or undefined. */
export function parseDateFromText(raw: string, from: Date = new Date()): string | undefined {
  const t = ` ${normAr(raw)} `;
  const base = toISODate(from);

  if (/(بكره|بكرا|غدا|النهارده .{0,8}بكره)/.test(t)) return addDaysISO(base, 1);
  if (/(بعد بكره|بعد بكرا)/.test(t)) return addDaysISO(base, 2);
  if (/(الاسبوع الجاي|الاسبوع القادم|خلال اسبوع)/.test(t)) return addDaysISO(base, 7);
  if (/(الشهر الجاي|الشهر القادم|الشهر اللي جاي)/.test(t)) {
    const d = new Date(from.getFullYear(), from.getMonth() + 1, Math.min(from.getDate(), 28));
    return toISODate(d);
  }
  if (/(اخر الشهر|نهايه الشهر|نهاية الشهر)/.test(t)) {
    const d = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    return toISODate(d);
  }

  // بعد / خلال + عدد + وحدة
  const rel = /(بعد|خلال)\s+(\d+)\s*(يوم|ايام|اسبوع|اسابيع|شهر|شهور|سنه|سنين|سنه)/.exec(t);
  if (rel) {
    const n = Number(rel[2]);
    const unit = rel[3];
    if (unit.startsWith('يوم') || unit.startsWith('ايام')) return addDaysISO(base, n);
    if (unit.startsWith('اسبوع') || unit.startsWith('اسابيع')) return addDaysISO(base, n * 7);
    if (unit.startsWith('شهر') || unit.startsWith('شهور')) return addDaysISO(base, n * 30);
    return addDaysISO(base, n * 365);
  }
  if (/(يومين)/.test(t)) return addDaysISO(base, 2);
  if (/(اسبوعين)/.test(t)) return addDaysISO(base, 14);
  if (/(شهرين)/.test(t)) return addDaysISO(base, 60);

  // يوم 15 أكتوبر / 15 أكتوبر / 15/10 / 15-10-2026
  const named = /(?:يوم\s+)?(\d{1,2})\s+([ء-غف-يa-z]+)\s*(20\d{2})?/.exec(t);
  if (named) {
    const day = Number(named[1]);
    const mon = monthFromName(named[2]);
    if (day >= 1 && day <= 31 && mon) {
      const year = named[3] ? Number(named[3]) : from.getFullYear();
      let d = new Date(year, mon - 1, day);
      if (!named[3] && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
        d = new Date(year + 1, mon - 1, day);
      }
      return toISODate(d);
    }
  }
  const numeric = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20?\d{2}))?/.exec(t);
  if (numeric) {
    const day = Number(numeric[1]);
    const mon = Number(numeric[2]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let year = numeric[3] ? Number(numeric[3]) : from.getFullYear();
      if (year < 100) year += 2000;
      let d = new Date(year, mon - 1, day);
      if (!numeric[3] && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
        d = new Date(year + 1, mon - 1, day);
      }
      return toISODate(d);
    }
  }
  return undefined;
}

// ─── extraction helpers ────────────────────────────────────────────

const PRODUCT_WORDS: Array<{ match: string[]; label: string }> = [
  { match: ['غساله'], label: 'غسالة' },
  { match: ['تلاجه', 'ثلاجه'], label: 'ثلاجة' },
  { match: ['تكييف', 'مكيف'], label: 'تكييف' },
  { match: ['موبايل', 'تليفون', 'ايفون', 'سامسونج'], label: 'موبايل' },
  { match: ['لابتوب', 'لاب توب'], label: 'لابتوب' },
  { match: ['تلفزيون', 'تلفاز', 'شاشه'], label: 'شاشة/تلفزيون' },
  { match: ['بوتاجاز', 'فرن'], label: 'بوتاجاز' },
  { match: ['سخان'], label: 'سخان' },
  { match: ['مكنسه'], label: 'مكنسة' },
  { match: ['مروحه'], label: 'مروحة' },
  { match: ['ديب فريزر', 'فريزر'], label: 'فريزر' },
  { match: ['غساله اطباق'], label: 'غسالة أطباق' },
  { match: ['راوتر'], label: 'راوتر' },
  { match: ['عربيه', 'سياره'], label: 'سيارة' },
];

const UTILITY_WORDS: Array<{ match: string[]; label: string; key: string }> = [
  { match: ['كهربا'], label: 'الكهرباء', key: 'electricity' },
  { match: ['مياه', 'ميه'], label: 'المياه', key: 'water' },
  { match: ['غاز'], label: 'الغاز', key: 'gas' },
  { match: ['انترنت', 'نت', 'راوتر', 'باقه'], label: 'الإنترنت', key: 'internet' },
  { match: ['موبايل', 'خط', 'رصيد'], label: 'الموبايل', key: 'mobile' },
  { match: ['ارضي', 'تليفون ارضي'], label: 'التليفون الأرضي', key: 'landline' },
  { match: ['قسط', 'اقساط'], label: 'الأقساط', key: 'installment' },
  { match: ['اشتراك'], label: 'الاشتراك', key: 'subscription' },
];

function findProduct(t: string): string | undefined {
  for (const p of PRODUCT_WORDS) {
    if (p.match.some((w) => hasWord(t, w))) return p.label;
  }
  return undefined;
}

function findUtility(t: string): { label: string; key: string } | undefined {
  for (const u of UTILITY_WORDS) {
    if (u.match.some((w) => hasWord(t, w))) return { label: u.label, key: u.key };
  }
  return undefined;
}

function findAmount(raw: string): string | undefined {
  const t = normAr(raw);
  const m = /(\d[\d.,]*)\s*(جنيه|جنيه|ج\.?\s?م|egp|le|ج\b)/.exec(t);
  if (m) return `${m[1]} جنيه`;
  return undefined;
}

function findMerchant(raw: string): string | undefined {
  const t = normAr(raw);
  const m = /(?:من\s+(?:متجر|محل|معرض|توكيل)\s+)([ء-غف-ي ]{2,24})/.exec(t);
  if (!m) return undefined;
  const name = m[1].replace(/\s*بـ\s*$/, '').trim();
  return name || undefined;
}

function findInvoiceNo(raw: string): string | undefined {
  const t = normAr(raw);
  const m = /فاتوره\s*(?:رقم\s*)?([a-z0-9\-]{3,})/.exec(t);
  if (m) return m[1].toUpperCase();
  return undefined;
}

// ─── category detection ────────────────────────────────────────────

interface Rule {
  cat: CategoryId;
  any: Array<[string, number]>;
  combos: Array<{ all: string[]; bonus: number }>;
}

const RULES: Rule[] = [
  {
    cat: 'car_license',
    any: [
      ['رخصه', 2], ['مرور', 2], ['تسيير', 3], ['قياده', 2], ['مخالفات', 3],
      ['مخالفه', 3], ['فحص فني', 3], ['براءه ذمه', 3], ['وحده المرور', 3], ['تجديد الرخصه', 3],
    ],
    combos: [
      { all: ['عربيه', 'تجديد'], bonus: 3 }, { all: ['عربيه', 'رخصه'], bonus: 3 },
      { all: ['رخصه', 'هتخلص'], bonus: 3 }, { all: ['رخصه', 'انته'], bonus: 2 },
      { all: ['نقل', 'ملكيه'], bonus: 3 }, { all: ['توكيل', 'عربيه'], bonus: 2 },
    ],
  },
  {
    cat: 'national_id',
    any: [['بطاقه', 2], ['رقم قومي', 3], ['سجل مدني', 3], ['احوال مدنيه', 3], ['استماره بطاقه', 3]],
    combos: [{ all: ['بدل فاقد', 'بطاقه'], bonus: 3 }, { all: ['تجديد', 'بطاقه'], bonus: 2 }],
  },
  {
    cat: 'passport',
    any: [['جواز', 3], ['باسبور', 3], ['جوازات', 2]],
    combos: [{ all: ['بدل فاقد', 'جواز'], bonus: 2 }, { all: ['تجديد', 'جواز'], bonus: 2 }],
  },
  {
    cat: 'travel',
    any: [
      ['مسافر', 3], ['سفريه', 3], ['رحله', 2], ['طياره', 3], ['طيران', 2],
      ['مطار', 2], ['فندق', 2], ['تاشيره', 2], ['اجازه', 1], ['شهر عسل', 3], ['حجز', 1],
    ],
    combos: [
      { all: ['فيزا', 'سفر'], bonus: 3 }, { all: ['فيزا', 'شنجن'], bonus: 3 },
      { all: ['حجز', 'فندق'], bonus: 2 }, { all: ['حجز', 'طيران'], bonus: 2 },
      { all: ['سفر', 'يوم'], bonus: 2 },
    ],
  },
  {
    cat: 'move',
    any: [
      ['انقل', 3], ['عزل', 3], ['عفش', 3], ['شقه جديده', 3], ['عقد ايجار', 3],
      ['ايجار', 2], ['تمليك', 2], ['سمسار', 2], ['نقل', 1], ['شقه', 1], ['سكن', 1],
    ],
    combos: [
      { all: ['انقل', 'شقه'], bonus: 2 }, { all: ['نقل', 'عفش'], bonus: 2 },
      { all: ['شقه', 'جديده'], bonus: 2 },
    ],
  },
  {
    cat: 'bill',
    any: [
      ['فاتوره', 2], ['كهربا', 2], ['مياه', 2], ['ميه', 2], ['غاز', 2],
      ['انترنت', 2], ['باقه', 2], ['ارضي', 2], ['قسط', 2], ['اقساط', 2],
      ['اشتراك', 2], ['عداد', 2], ['مستحق', 1], ['ادفع', 1],
    ],
    combos: [
      { all: ['ادفع', 'فاتوره'], bonus: 2 }, { all: ['فاتوره', 'نت'], bonus: 2 },
      { all: ['شحن', 'عداد'], bonus: 2 },
    ],
  },
  {
    cat: 'return',
    any: [
      ['ارجاع', 3], ['استرجاع', 3], ['مرتجع', 3], ['استبدال', 2], ['ارجع', 2],
      ['سياسه الارجاع', 3], ['عايز ارجع', 3],
    ],
    combos: [{ all: ['ارجع', 'منتج'], bonus: 2 }, { all: ['ارجاع', 'منتج'], bonus: 2 }],
  },
  {
    cat: 'warranty',
    any: [
      ['ضمان', 3], ['عطلان', 3], ['بايظ', 3], ['خربان', 3], ['مش شغال', 3],
      ['عطل', 2], ['توكيل', 1], ['صيانه', 2], ['بلاغ', 1], ['عيب صناعه', 3],
    ],
    combos: [
      { all: ['توكيل', 'صيانه'], bonus: 2 }, { all: ['حصلت', 'مشكله'], bonus: 1 },
      { all: ['في', 'الضمان'], bonus: 2 },
    ],
  },
  {
    cat: 'purchase',
    any: [
      ['اشتري', 3], ['فاتوره شرا', 3], ['ايصال شرا', 3], ['ريسيت', 2],
      ['غساله', 1], ['تلاجه', 1], ['تكييف', 1], ['موبايل', 1], ['لابتوب', 1],
      ['شاشه', 1], ['بوتاجاز', 1], ['سخان', 1], ['متجر', 1], ['معرض', 1],
    ],
    combos: [
      { all: ['فاتوره', 'ضمان'], bonus: 3 }, { all: ['اشتري', 'فاتوره'], bonus: 2 },
      { all: ['صورت', 'فاتوره'], bonus: 2 }, { all: ['صوره', 'فاتوره'], bonus: 2 },
    ],
  },
  {
    cat: 'gov_request',
    any: [
      ['بدل فاقد', 3], ['مستند ناقص', 3], ['اترفض', 3], ['مرفوض', 3],
      ['رفض الطلب', 3], ['تم رفض', 3], ['استكمال', 2], ['شهر عقاري', 3],
      ['توكيل', 1], ['تصريح', 2], ['شهاده ميلاد', 3], ['قيد عائلي', 3],
      ['مصلحه حكوميه', 2], ['ورقه حكوميه', 2], ['نقص المستند', 3], ['برجاء التوجه', 2],
    ],
    combos: [
      { all: ['توكيل', 'رسمي'], bonus: 2 }, { all: ['توكيل', 'شهر عقاري'], bonus: 2 },
      { all: ['الطلب', 'ناقص'], bonus: 2 },
    ],
  },
];

function scoreCategory(t: string, rule: Rule): number {
  let s = 0;
  for (const [kw, w] of rule.any) {
    if (hasWord(t, kw)) s += w;
  }
  for (const c of rule.combos) {
    if (c.all.every((w) => hasWord(t, w))) s += c.bonus;
  }
  return s;
}

export function detect(raw: string): Detection {
  const t = ` ${normAr(raw)} `;
  const scores = RULES.map((r) => ({ cat: r.cat, s: scoreCategory(t, r) })).sort(
    (a, b) => b.s - a.s,
  );
  const best = scores[0];
  const second = scores[1];

  let category: CategoryId = 'generic';
  let confidence: Detection['confidence'] = 'low';
  if (best.s >= 5) {
    category = best.cat;
    confidence = 'high';
  } else if (best.s >= 3) {
    category = best.cat;
    confidence = best.s - second.s >= 2 ? 'high' : 'medium';
  } else if (best.s >= 1.5) {
    category = best.cat;
    confidence = 'medium';
  }

  // فاتورة + منتج/ضمان = عملية شراء مش فاتورة مرافق
  if (category === 'bill' && (hasWord(t, 'ضمان') || findProduct(t))) {
    const purchase = scores.find((x) => x.cat === 'purchase');
    if (purchase && purchase.s >= 1) {
      category = 'purchase';
      confidence = 'medium';
    }
  }

  const extracted: Record<string, string> = {};
  const deadline = parseDateFromText(raw);
  if (deadline) extracted.deadlineHint = formatShortDateAr(deadline);
  const amount = findAmount(raw);
  if (amount) extracted.amount = amount;
  const merchant = findMerchant(raw);
  if (merchant) extracted.merchant = merchant;
  const invoice = findInvoiceNo(raw);
  if (invoice) extracted.invoiceNo = invoice;
  const product = findProduct(t);
  if (product) extracted.product = product;
  const utility = findUtility(t);
  if (utility) {
    extracted.utility = utility.label;
    extracted.utilityKey = utility.key;
  }
  if (category === 'gov_request' && /(رفض|ناقص|استكمال)/.test(t)) {
    const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    extracted.reason = clean;
  }

  return {
    category,
    confidence,
    title: buildTitle(category, extracted, raw),
    deadline,
    extracted,
    questions: [...(CATEGORY_QUESTIONS[category] ?? []), DEADLINE_QUESTION],
  };
}

function buildTitle(category: CategoryId, ex: Record<string, string>, raw: string): string {
  switch (category) {
    case 'car_license':
      return 'تجديد رخصة السيارة';
    case 'national_id':
      return 'بطاقة الرقم القومي';
    case 'passport':
      return 'جواز السفر';
    case 'travel':
      return ex.deadlineHint ? `رحلة ${ex.deadlineHint}` : 'تجهيز للسفر';
    case 'move':
      return 'النقل لسكن جديد';
    case 'bill':
      return ex.utility ? `فاتورة ${ex.utility}` : 'دفع فاتورة';
    case 'return':
      return ex.product ? `إرجاع ${ex.product}` : 'إرجاع منتج';
    case 'warranty':
      return ex.product ? `عطل ${ex.product} — مطالبة ضمان` : 'بلاغ عطل في الضمان';
    case 'purchase':
      return ex.product ? `شراء ${ex.product}` : 'حماية عملية شراء';
    case 'gov_request':
      return ex.reason ? 'طلب مرفوض — استكمال مستندات' : 'طلب/إجراء حكومي';
    default:
      return raw.replace(/\s+/g, ' ').trim().slice(0, 44) || 'مهمة جديدة';
  }
}

// ─── clarifying questions ──────────────────────────────────────────

const DEADLINE_QUESTION: Question = {
  id: 'deadline',
  label: 'آخر موعد؟ (اختياري — اكتب زي: 15 أكتوبر / بكرة / بعد أسبوع)',
  placeholder: 'مثال: 18 أكتوبر',
  optional: true,
};

const CATEGORY_QUESTIONS: Record<CategoryId, Question[]> = {
  car_license: [
    { id: 'licenseType', label: 'نوع الرخصة؟', options: ['تسيير ملاكي', 'قيادة خاصة', 'قيادة مهنية', 'موتوسيكل'], optional: false },
    { id: 'unit', label: 'وحدة المرور؟ (اختياري)', placeholder: 'مثال: مرور مدينة نصر', optional: true },
  ],
  national_id: [
    { id: 'idAction', label: 'عايز تعمل إيه في البطاقة؟', options: ['تجديد', 'بدل فاقد', 'بدل تالف', 'أول مرة'], optional: false },
  ],
  passport: [
    { id: 'passAction', label: 'عايز تعمل إيه في الجواز؟', options: ['استخراج أول مرة', 'تجديد', 'بدل فاقد', 'بدل تالف'], optional: false },
  ],
  travel: [
    { id: 'destination', label: 'مسافر فين؟ (اختياري)', placeholder: 'مثال: السعودية / دبي / الساحل', optional: true },
    { id: 'companions', label: 'مسافر لوحدك؟', options: ['لوحدي', 'مع العائلة', 'مع أصحاب', 'شغل'], optional: true },
  ],
  move: [
    { id: 'moveType', label: 'الشقة الجديدة؟', options: ['إيجار', 'تمليك', 'لسه بدوّر'], optional: false },
    { id: 'area', label: 'المنطقة؟ (اختياري)', placeholder: 'مثال: فيصل، الجيزة', optional: true },
  ],
  bill: [
    { id: 'billType', label: 'فاتورة إيه؟', options: ['كهرباء', 'مياه', 'غاز', 'إنترنت', 'موبايل', 'أقساط', 'أخرى'], optional: false },
  ],
  return: [
    { id: 'store', label: 'اشتريت منين؟ (اختياري)', placeholder: 'اسم المتجر', optional: true },
    { id: 'buyDate', label: 'تاريخ الشراء؟ (اختياري)', placeholder: 'مثال: 10 سبتمبر', optional: true },
  ],
  warranty: [
    { id: 'product', label: 'المنتج إيه؟ (اختياري)', placeholder: 'مثال: غسالة LG', optional: true },
    { id: 'warrantyValid', label: 'الضمان لسه ساري؟', options: ['أيوه ساري', 'مش متأكد', 'انتهى'], optional: true },
  ],
  purchase: [
    { id: 'store', label: 'اشتريت منين؟ (اختياري)', placeholder: 'اسم المتجر', optional: true },
  ],
  gov_request: [
    { id: 'authority', label: 'الجهة إيه؟ (اختياري)', placeholder: 'مثال: السجل المدني / الحي', optional: true },
  ],
  generic: [
    { id: 'place', label: 'المكان المرتبط بيها؟ (اختياري)', placeholder: 'مثال: الشغل / البيت', optional: true },
  ],
};

// ─── plan templates ────────────────────────────────────────────────

export interface BuiltPlan {
  title: string;
  summary: string;
  pathId: PathId;
  trust: TrustLevel;
  deadline?: string;
  steps: PlanStep[];
  docs: PlanDoc[];
  consequences: Consequence[];
  sources: SourceRef[];
}

function st(title: string, detail?: string, actionLabel?: string, actionUrl?: string): PlanStep {
  return { id: uid('step'), title, detail, done: false, actionLabel, actionUrl };
}

function dc(label: string, hint?: string): PlanDoc {
  return { id: uid('doc'), label, hint, have: false };
}

function buildPlan(category: CategoryId, ex: Record<string, string>, a: Answers, dl?: string): BuiltPlan {
  switch (category) {
    case 'car_license': {
      const lt = a.licenseType || 'تسيير ملاكي';
      return {
        title: `تجديد الرخصة (${lt})`,
        summary: `خطة تجديد الرخصة خطوة بخطوة: من الاستعلام عن المخالفات لحد استلام الرخصة الجديدة.${a.unit ? ` — وحدة ${a.unit}.` : ''}`,
        pathId: 'car',
        trust: 'official',
        deadline: dl,
        steps: [
          st('استعلم عن المخالفات', 'اعرف عليك كام قبل ما تتحرك — أونلاين بالرقم القومي ورقم اللوحة.', 'استعلام المخالفات', 'https://ppo.gov.eg'),
          st('ادفع المخالفات وطلّع شهادة براءة الذمة', 'صلاحيتها محدودة (حوالي 15 يوم) — خلّص باقي الخطوات بسرعة بعدها.'),
          st('جهّز المستندات', 'بطاقة سارية + الرخصة الحالية + وثيقة التأمين الإجباري + نماذج الفحص من وحدة المرور.'),
          st('روح وحدة المرور وافحص', lt.includes('قيادة') ? 'كشف طبي + اختبارات حسب نوع رخصة القيادة.' : 'الفحص الفني للسيارة + مطابقة البصمة والطفاية والمثلث.'),
          st('ادفع الرسوم والضريبة', 'في الخزينة أو إلكترونيًا — احتفظ بالإيصالات كلها.'),
          st('استلم الرخصة وصوّرها', 'صوّر الرخصة الجديدة واحفظها في وثائق خَلِّصها عشان تلاقيها أي وقت.'),
        ],
        docs: [
          dc('بطاقة رقم قومي سارية'),
          dc('الرخصة الحالية'),
          dc('شهادة المخالفات (براءة الذمة)', 'صالحة لمدة محدودة'),
          dc('وثيقة التأمين الإجباري'),
          dc('إيصالات الدفع'),
        ],
        consequences: [
          { level: 'danger', text: 'القيادة برخصة منتهية قد تعرّضك لغرامة أو سحب الرخصة حسب قانون المرور.' },
          { level: 'warn', text: 'لو شهادة المخالفات انتهت صلاحيتها هتحتاج تطلع واحدة جديدة.' },
        ],
        sources: [
          { sourceId: 'moi-traffic', note: 'تجديد وخدمات التراخيص' },
          { sourceId: 'ppo-traffic', note: 'المخالفات وبراءة الذمة' },
          { sourceId: 'digital-egypt', note: 'خدمات المركبات أونلاين' },
        ],
      };
    }
    case 'national_id': {
      const act = a.idAction || 'تجديد';
      return {
        title: `البطاقة — ${act}`,
        summary: `خطة ${act} بطاقة الرقم القومي من السجل المدني: الاستمارة والمستندات والاستلام.`,
        pathId: 'docs',
        trust: 'official',
        deadline: dl,
        steps: [
          st('اشتري الاستمارة واملاها', 'استمارة عادية أو مستعجلة من السجل المدني — المستعجلة بتطلع أسرع برسوم أعلى.'),
          st('جهّز المستندات', 'شهادة الميلاد + مستند إثبات المهنة/الحالة الاجتماعية + إيصال مرافق لإثبات السكن لو مطلوب.'),
          st('روح السجل المدني وسلّم الورق', 'احجز دورك بدري — وخد معاك صور شخصية لو مطلوبة.'),
          st('اتصوّر واستلم إيصال الاستلام', 'احتفظ بالإيصال — هو إثباتك لحد ما تستلم البطاقة.'),
          st('استلم البطاقة الجديدة وصوّرها', 'راجع البيانات قبل ما تمشي، وصوّرها للوثائق.'),
        ],
        docs: [dc('شهادة الميلاد'), dc('مستند المهنة/المؤهل'), dc('إثبات السكن (إيصال مرافق)'), dc('البطاقة القديمة (لو تجديد/تالف)'), dc('إيصال الاستلام')],
        consequences: [
          { level: 'warn', text: 'التأخير في تجديد البطاقة قد يترتب عليه غرامات حسب التعليمات المعلنة — تحقق من السجل المدني.' },
          { level: 'info', text: 'بطاقة سارية ضرورية لأي تعامل بنكي أو حكومي.' },
        ],
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'moi-main', note: 'قطاع الأحوال المدنية' }],
      };
    }
    case 'passport': {
      const act = a.passAction || 'استخراج أول مرة';
      return {
        title: `جواز السفر — ${act}`,
        summary: `خطة ${act} لجواز السفر من مصلحة الجوازات: المستندات والرسوم والاستلام.`,
        pathId: 'docs',
        trust: 'official',
        deadline: dl,
        steps: [
          st('جهّز المستندات', 'بطاقة سارية + 3-4 صور حديثة بخلفية بيضاء + شهادة الميلاد + موقف التجنيد (للذكور) + المؤهل.'),
          st('املا النموذج في الجوازات', 'نموذج طلب الحصول على جواز سفر — عادي أو مستعجل حسب احتياجك.'),
          st('ادفع الرسوم واستلم الإيصال', 'احتفظ بالإيصال — فيه موعد الاستلام.'),
          st('استلم الجواز وصوّره', 'راجع الاسم والبيانات، وصوّر أول صفحتين للوثائق.'),
        ],
        docs: [dc('بطاقة رقم قومي سارية'), dc('صور شخصية حديثة'), dc('شهادة الميلاد'), dc('موقف التجنيد'), dc('إيصال الاستلام')],
        consequences: [
          { level: 'warn', text: 'من غير جواز ساري مش هتعرف تحجز أو تسافر — والمعاملة المستعجلة أغلى.' },
        ],
        sources: [{ sourceId: 'moi-main', note: 'مصلحة الجوازات والهجرة' }, { sourceId: 'digital-egypt' }],
      };
    }
    case 'travel': {
      return {
        title: ex.deadlineHint ? `رحلة ${a.destination || ''} ${ex.deadlineHint}`.trim() : `رحلة ${a.destination || 'جديدة'}`.trim(),
        summary: `مشروع سفر كامل: مستندات، حجوزات، تأمين، وتجهيزات — عشان تسافر وانت مطمن.${a.destination ? ` الوجهة: ${a.destination}.` : ''}`,
        pathId: 'travel',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('تأكد من صلاحية الجواز', 'معظم الدول تطلب صلاحية 6 شهور على الأقل من تاريخ السفر.'),
          st('خلّص التأشيرة لو مطلوبة', 'راجع شروط تأشيرة الوجهة بدري — بعضها بياخد أسابيع.'),
          st('احجز الطيران والفندق', 'قارن الأسعار، وراجع سياسة الإلغاء قبل الدفع.'),
          st('اعمل تأمين سفر', 'مهم خصوصًا للرحلات الدولية — بيغطي الطوارئ الطبية وإلغاء الرحلة.'),
          st('جهّز وسائل الدفع', 'كروت سارية + حد ائتماني مناسب + شوية كاش بعملة البلد.'),
          st('جهّز الأمتعة والأوراق', 'صوّر الجواز والتأشيرة والحجوزات واحفظها في الوثائق + نسخة على موبايلك.'),
        ],
        docs: [dc('جواز السفر'), dc('التأشيرة'), dc('تذاكر الطيران'), dc('حجز الفندق'), dc('وثيقة تأمين السفر')],
        consequences: [
          { level: 'danger', text: 'جواز منتهي أو تأشيرة ناقصة ممكن تمنعك من السفر يوم الرحلة نفسه.' },
          { level: 'warn', text: 'الحجز المتأخر غالبًا أغلى وخياراته أقل.' },
        ],
        sources: [{ sourceId: 'egyptair' }, { sourceId: 'moi-main', note: 'الجوازات' }],
      };
    }
    case 'move': {
      const type = a.moveType || 'إيجار';
      return {
        title: `النقل لشقة (${type})${a.area ? ` — ${a.area}` : ''}`,
        summary: `خطة انتقال كاملة: قبل الانتقال، يوم الانتقال، وبعد الانتقال — من العقد لحد أول فاتورة.`,
        pathId: 'home',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('عاين الشقة واتفق على العقد', `${type === 'إيجار' ? 'راجع مدة العقد والقيمة والزيادة السنوية والتأمين — ووثّق العقد لو أمكن.' : 'راجع الملكية والتراخيص — واستشير محامي قبل دفع أي عربون.'}`),
          st('رتّب المرافق', 'كهرباء + مياه + غاز: نقل ملكية العدادات أو تعاقد جديد حسب الحالة.'),
          st('انقل الإنترنت والتليفون', 'قدّم طلب نقل الخدمة قبل الانتقال بأسبوع على الأقل.'),
          st('احجز نقل العفش', 'شركة نقل موثوقة + كراتين وتغليف للحاجات القابلة للكسر.'),
          st('يوم الانتقال: صوّر قراءات العدادات', 'صوّر كل العدادات (قديم وجديد) — الصور دي بتحميك من أي نزاع.'),
          st('استلم المفاتيح وافحص الشقة', 'كهرباء، سباكة، نجارة — وسجّل أي ملاحظة في محضر الاستلام.'),
          st('بعد الانتقال: حدّث بياناتك', 'عنوان البطاقة/البنك/الشغل — واحفظ كل العقود في الوثائق.'),
        ],
        docs: [dc('عقد الإيجار/التمليك'), dc('إيصالات المرافق'), dc('صور قراءات العدادات'), dc('محضر الاستلام'), dc('إيصالات نقل العفش')],
        consequences: [
          { level: 'warn', text: 'من غير عقد موثق وقراءات عدادات مصوّرة، أي نزاع لاحق هيبقى صعب إثباته.' },
        ],
        sources: [{ sourceId: 'electricity' }, { sourceId: 'water' }, { sourceId: 'digital-egypt', note: 'خدمات التوثيق' }],
      };
    }
    case 'bill': {
      const bt = a.billType || ex.utility || 'الفاتورة';
      const srcs: SourceRef[] =
        bt.includes('كهرباء') ? [{ sourceId: 'electricity' }, { sourceId: 'fawry' }]
        : bt.includes('مياه') ? [{ sourceId: 'water' }, { sourceId: 'fawry' }]
        : [{ sourceId: 'fawry' }, { sourceId: 'instapay' }];
      return {
        title: `فاتورة ${bt}${ex.amount ? ` — ${ex.amount}` : ''}`,
        summary: `ادفع فاتورة ${bt} واحتفظ بالإيصال — وفعّل المتابعة عشان متفوتش الشهر الجاي.`,
        pathId: 'money',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('اعرف قيمة الفاتورة وآخر موعد', ex.amount ? `المبلغ المستخرج: ${ex.amount} — تأكد منه من الإيصال.` : 'من الإيصال أو تطبيق الجهة أو رسائل الموبايل.'),
          st('ادفع من القناة المناسبة', 'فوري / انستاباي / تطبيق الجهة / الفرع — اختار الأسهل ليك.'),
          st('احفظ إيصال الدفع', 'صوّر الإيصال واحفظه في الوثائق — مهم لو حصل أي خطأ.'),
          st('فعّل المتابعة الشهرية', 'اضغط "ابدأ المتابعة" وخَلِّصها هيفكرك قبل الموعد كل شهر.'),
        ],
        docs: [dc('صورة الفاتورة'), dc('إيصال الدفع')],
        consequences: [
          { level: 'warn', text: 'التأخير قد يترتب عليه رسوم إضافية أو انقطاع الخدمة وفق شروط الجهة.' },
        ],
        sources: srcs,
      };
    }
    case 'return': {
      return {
        title: ex.product ? `إرجاع ${ex.product}` : 'إرجاع منتج',
        summary: `ارجع حقك صح: سياسة الإرجاع، تجهيز المنتج والفاتورة، والمتابعة لحد رد المبلغ.${ex.merchant || a.store ? ` المتجر: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('راجع سياسة الإرجاع والمدة', 'شوف المدة المسموحة وشروط الاستبدال/رد المبلغ قبل ما تتحرك.'),
          st('جهّز المنتج والفاتورة', 'المنتج بحالته الأصلية + العلبة + الفاتورة — صوّر كل حاجة قبل التسليم.'),
          st('تواصل مع المتجر', 'خدمة العملاء أو الفرع — واسأل عن خطوات الإرجاع المعتمدة عندهم.'),
          st('سلّم المرتجع وخد إيصال', 'إيصال استلام المرتجع هو إثباتك — متسلّمش من غيره.'),
          st('تابع رد المبلغ', 'تابع حسابك البنكي/المحفظة — ولو اتأخر صعّد لجهاز حماية المستهلك.'),
        ],
        docs: [dc('فاتورة الشراء'), dc('صور المنتج قبل التسليم'), dc('إيصال استلام المرتجع')],
        consequences: [
          { level: 'danger', text: 'بعد انتهاء مدة الإرجاع قد تفقد حقك في الاستبدال أو رد المبلغ.' },
        ],
        sources: [{ sourceId: 'cpa', note: 'لو المتجر رفض حقك القانوني' }],
      };
    }
    case 'warranty': {
      const prod = a.product || ex.product || 'المنتج';
      return {
        title: `عطل ${prod} — مطالبة ضمان`,
        summary: `ملف مطالبة ضمان مرتب: إثبات العطل + إثبات الشراء + متابعة البلاغ لحد الإصلاح.${ex.merchant || a.store ? ` جهة الشراء: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'home',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('صوّر المشكلة', 'صور وفيديو قصير يوضح العطل — ده أقوى إثبات عندك.'),
          st('جمّع أوراقك', 'الفاتورة + شهادة الضمان + الرقم التسلسلي للمنتج.'),
          st('كلّم الضمان وسجّل بلاغ', 'خد رقم البلاغ واسم الموظف وموعد الزيارة المتوقع — وسجّلهم هنا.'),
          st('تابع الإصلاح', 'لو الموعد فات من غير زيارة، اتصل تاني وارفع شكوى برقم البلاغ.'),
          st('استلم تقرير الصيانة', 'اقرأ التقرير قبل التوقيع — واحفظ نسخة في الوثائق.'),
        ],
        docs: [dc('صور/فيديو العطل'), dc('فاتورة الشراء'), dc('شهادة الضمان'), dc('رقم البلاغ'), dc('تقرير الصيانة')],
        consequences: [
          { level: 'warn', text: 'التأخير في الإبلاغ قد يصعّب إثبات أن العطل من عيوب الصناعة المشمولة بالضمان.' },
        ],
        sources: [{ sourceId: 'cpa', note: 'لو الضمان رفض الإصلاح المستحق' }],
      };
    }
    case 'purchase': {
      return {
        title: ex.product ? `شراء ${ex.product}` : 'حماية عملية شراء',
        summary: `حمّلت فاتورتك؟ خَلِّصها هيحمي عملية الشراء: الإرجاع، الضمان، والإثباتات — كلها في مكان واحد.${ex.amount ? ` المبلغ: ${ex.amount}.` : ''}${ex.merchant || a.store ? ` المتجر: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money',
        trust: 'trusted',
        deadline: dl,
        steps: [
          st('احفظ الفاتورة', 'صوّر الفاتورة الورقية أو احفظ الإلكترونية في الوثائق.'),
          st('سجّل الضمان', 'سجّل المنتج على موقع الوكيل لو متاح — وفعّل الضمان من تاريخ الشراء.'),
          st('اعرف مدة الإرجاع', 'سجّل آخر موعد للإرجاع عشان خَلِّصها يتابعك قبله.'),
          st('لو حصل عطل: اعمل مطالبة', 'من صفحة المهمة اضغط "حصلت مشكلة" وخَلِّصها يجهزلك ملف المطالبة.'),
        ],
        docs: [dc('فاتورة الشراء'), dc('شهادة الضمان'), dc('صور المنتج')],
        consequences: [
          { level: 'info', text: 'الفاتورة هي إثبات الشراء الوحيد المعتمد — ضياعها يضعف أي مطالبة لاحقة.' },
        ],
        sources: [{ sourceId: 'cpa', note: 'حقوقك كمستهلك' }],
      };
    }
    case 'gov_request': {
      const rejected = Boolean(ex.reason);
      return {
        title: rejected ? 'طلب مرفوض — استكمال مستندات' : `طلب حكومي${a.authority ? ` — ${a.authority}` : ''}`,
        summary: rejected
          ? `طلبك اترفض بسبب نقص مستندات. الخطة: نحدد الناقص، نستخرجه، ونعيد التقديم قبل الموعد.${dl ? ` آخر موعد: ${formatShortDateAr(dl)}.` : ''}`
          : `حوّل الإجراء الحكومي لخطوات واضحة: المستندات، التقديم، والمتابعة لحد الاستلام.${a.authority ? ` الجهة: ${a.authority}.` : ''}`,
        pathId: 'docs',
        trust: 'official',
        deadline: dl,
        steps: [
          st('حدد المطلوب بالظبط', rejected ? `سبب الرفض المستخرج: "${ex.reason}" — تأكد منه من الخطاب الأصلي.` : 'من موقع الجهة أو خطاب الطلب: إيه المستندات والنماذج المطلوبة؟'),
          st('استخرج المستند الناقص', 'روح الجهة المختصة بالمستند ده ومعاك بطاقتك — واسأل عن مدة الاستخراج.'),
          st('أعد تقديم الطلب', 'قدّم الملف كامل قبل آخر موعد — وخد رقم متابعة.'),
          st('احفظ إيصال التقديم', 'صوّر الإيصال وأي أرقام متابعة في الوثائق.'),
          st('تابع لحد الاستلام', 'تابع حالة الطلب بالرقم — ولو اتأخر عن المعلن اسأل في الجهة.'),
        ],
        docs: [dc('خطاب الرفض/الطلب'), dc('المستندات المطلوبة'), dc('إيصال التقديم')],
        consequences: [
          { level: 'danger', text: rejected ? 'لو عدّى آخر موعد من غير استكمال، غالبًا هتحتاج تبدأ الطلب من الأول.' : 'الأوراق الناقصة هي أشهر سبب لتعطيل أي طلب حكومي.' },
        ],
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'public-guide', note: 'ابحث عن خدمتك بالاسم' }],
      };
    }
    default: {
      return {
        title: buildTitle('generic', ex, a.place ? `${ex} ` : ''),
        summary: 'خطة تنفيذ عامة — وضّح المطلوب، قسّمه خطوات، وخلّصه خطوة خطوة.',
        pathId: 'other',
        trust: 'verify',
        deadline: dl,
        steps: [
          st('وضّح المطلوب بالظبط', 'اكتب في ملاحظات المهمة: إيه النتيجة النهائية اللي عايز توصلها؟'),
          st('قسّمها لخطوات صغيرة', 'عدّل خطوات الخطة دي على مقاس مشكلتك من صفحة المهمة.'),
          st('حدد أول خطوة ونفذها النهاردة', 'أصغر خطوة ممكنة — البداية أهم من الكمال.'),
          st('احفظ إثبات الانتهاء', 'صورة، إيصال، أو ملاحظة — عشان سجل إنجازك يكبر.'),
        ],
        docs: [dc('أي مستندات مرتبطة')],
        consequences: [
          { level: 'info', text: 'المهام اللي من غير موعد غالبًا بتتأجل — حدد آخر موعد حتى لو تقريبي.' },
        ],
        sources: [{ sourceId: 'public-guide', note: 'لو الإجراء حكومي ابحث عنه هنا' }],
      };
    }
  }
}

export function buildTaskFromDetection(
  rawInput: string,
  detection: Detection,
  answers: Answers,
  origin: KhTask['origin'],
  extra?: Partial<KhTask>,
): KhTask {
  const answerDeadline = parseDateFromText(Object.values(answers).join(' '));
  const deadline = detection.deadline ?? answerDeadline ?? parseDateFromText(answers.deadline ?? '');
  const plan = buildPlan(detection.category, detection.extracted, answers, deadline);
  const now = Date.now();
  return {
    id: uid('task'),
    title: detection.category === 'generic' ? detection.title : plan.title,
    category: detection.category,
    pathId: plan.pathId,
    summary: plan.summary,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deadline: plan.deadline,
    steps: plan.steps,
    docs: plan.docs,
    consequences: plan.consequences,
    sources: plan.sources,
    trust: plan.trust,
    followUp: true,
    origin,
    rawInput,
    imageIds: [],
    starred: false,
    ...extra,
  };
}

export function questionsForCategory(cat: CategoryId): Question[] {
  return [...(CATEGORY_QUESTIONS[cat] ?? []), DEADLINE_QUESTION];
}

export function titleForCategory(
  cat: CategoryId,
  ex: Record<string, string>,
  raw: string,
): string {
  return buildTitle(cat, ex, raw);
}

export function allCategories(): CategoryId[] {
  return ['car_license', 'national_id', 'passport', 'travel', 'move', 'bill', 'return', 'warranty', 'purchase', 'gov_request', 'generic'];
}

// ─── prioritization — "ماذا أفعل الآن؟" ─────────────────────────────

export function rankTasks(tasks: KhTask[], from: Date = new Date()): RankedTask[] {
  const ranked: RankedTask[] = tasks.map((task) => {
    if (task.status === 'done') {
      return { task, bucket: 'done' as const, daysLeft: daysUntil(task.deadline, from), reason: 'خلصت ✅', score: -1 };
    }
    const days = daysUntil(task.deadline, from);
    const hasDanger = task.consequences.some((c) => c.level === 'danger');
    const boost = (task.starred ? 40 : 0) + (hasDanger ? 25 : 0) + (task.followUp ? 10 : 0);
    if (days === null) {
      return {
        task,
        bucket: 'waiting' as const,
        daysLeft: null,
        reason: 'من غير موعد — حدد موعد عشان تظهر في أولوياتك',
        score: 20 + boost,
      };
    }
    if (days < 0) {
      return {
        task,
        bucket: 'now' as const,
        daysLeft: days,
        reason: `متأخرة بـ ${Math.abs(days).toLocaleString('ar-EG')} يوم — خلّصها الأول`,
        score: 1000 + Math.abs(days) * 10 + boost,
      };
    }
    if (days <= 3) {
      return {
        task,
        bucket: 'now' as const,
        daysLeft: days,
        reason: days === 0 ? 'آخر موعد النهاردة!' : `فاضل ${days === 1 ? 'يوم واحد' : 'يومين'} بس`,
        score: 500 - days * 10 + boost,
      };
    }
    if (days <= 14) {
      return {
        task,
        bucket: 'soon' as const,
        daysLeft: days,
        reason: `باقي ${days.toLocaleString('ar-EG')} يوم — جهّز ورقها من دلوقتي`,
        score: 300 - days * 5 + boost,
      };
    }
    if (days <= 30) {
      return {
        task,
        bucket: 'soon' as const,
        daysLeft: days,
        reason: `باقي ${days.toLocaleString('ar-EG')} يوم — على الرادار`,
        score: 150 - days + boost,
      };
    }
    return {
      task,
      bucket: 'waiting' as const,
      daysLeft: days,
      reason: `باقي ${days.toLocaleString('ar-EG')} يوم — لسه بدري`,
      score: 30 + boost,
    };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

export function nextStep(task: KhTask): PlanStep | null {
  return task.steps.find((s) => !s.done) ?? null;
}

export function progressOf(task: KhTask): number {
  const total = task.steps.length + task.docs.length;
  if (total === 0) return task.status === 'done' ? 100 : 0;
  const doneCount = task.steps.filter((s) => s.done).length + task.docs.filter((d) => d.have).length;
  return Math.round((doneCount / total) * 100);
}

// ─── ملف المطالبة (للضمان/الإرجاع) ────────────────────────────────

export function buildClaimFile(task: KhTask, memberName?: string): string {
  const lines = [
    '═══════════════════════════════',
    '  ملف مطالبة — أعدّه تطبيق خَلِّصها',
    '═══════════════════════════════',
    `الموضوع: ${task.title}`,
    `التاريخ: ${new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(new Date())}`,
    memberName ? `مقدّم المطالبة: ${memberName}` : '',
    '',
    '— تفاصيل المشكلة —',
    task.rawInput || task.summary,
    '',
    '— المستندات المرفقة —',
    ...task.docs.map((d) => `${d.have ? '[✓]' : '[ ]'} ${d.label}`),
    '',
    '— خطوات المتابعة —',
    ...task.steps.map((s, i) => `${i + 1}. ${s.title}${s.done ? ' (تم)' : ''}`),
    '',
    '— المصادر —',
    ...task.sources.map((s) => `• ${s.sourceId}${s.note ? ` — ${s.note}` : ''}`),
    '',
    'أُعدّ هذا الملف لتنظيم المطالبة ولا يغني عن مراجعة شروط الضمان/المتجر.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}
