import type { Lang } from './i18n';
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
import { addDaysISO, daysUntil, formatShortDate, num, toISODate, uid } from './utils';

// ═══════════════════════════════════════════════════════════════════
//  KHALLESA engine (bilingual AR/EN)
//  Problem → Action Plan → Execution → Proof
// ═══════════════════════════════════════════════════════════════════

// ─── normalization ─────────────────────────────────────────────────

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

// ─── date parsing (Arabic + English) ───────────────────────────────

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

function resolveDay(day: number, mon: number, year: number | undefined, from: Date): string {
  const y = year ?? from.getFullYear();
  let d = new Date(y, mon - 1, day);
  if (year === undefined && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
    d = new Date(y + 1, mon - 1, day);
  }
  return toISODate(d);
}

/** Extract a deadline from Arabic/English free text. Returns ISO date or undefined. */
export function parseDateFromText(raw: string, from: Date = new Date()): string | undefined {
  const t = ` ${normAr(raw)} `;
  const base = toISODate(from);

  // Arabic relative
  if (/(بكره|بكرا|غدا|النهارده .{0,8}بكره)/.test(t)) return addDaysISO(base, 1);
  if (/(بعد بكره|بعد بكرا)/.test(t)) return addDaysISO(base, 2);
  if (/(الاسبوع الجاي|الاسبوع القادم|خلال اسبوع)/.test(t)) return addDaysISO(base, 7);
  if (/(الشهر الجاي|الشهر القادم|الشهر اللي جاي)/.test(t)) {
    return toISODate(new Date(from.getFullYear(), from.getMonth() + 1, Math.min(from.getDate(), 28)));
  }
  if (/(اخر الشهر|نهايه الشهر|نهاية الشهر)/.test(t)) {
    return toISODate(new Date(from.getFullYear(), from.getMonth() + 1, 0));
  }
  // English relative
  if (/(day after tomorrow)/.test(t)) return addDaysISO(base, 2);
  if (/(tomorrow|tmrw)/.test(t)) return addDaysISO(base, 1);
  if (/(next week)/.test(t)) return addDaysISO(base, 7);
  if (/(next month)/.test(t)) {
    return toISODate(new Date(from.getFullYear(), from.getMonth() + 1, Math.min(from.getDate(), 28)));
  }
  if (/(end of (the )?month)/.test(t)) {
    return toISODate(new Date(from.getFullYear(), from.getMonth() + 1, 0));
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
  // in / after / within + N + unit
  const relEn = /(after|in|within)\s+(\d+)\s*(day|week|month|year)s?/.exec(t);
  if (relEn) {
    const n = Number(relEn[2]);
    const unit = relEn[3];
    if (unit === 'day') return addDaysISO(base, n);
    if (unit === 'week') return addDaysISO(base, n * 7);
    if (unit === 'month') return addDaysISO(base, n * 30);
    return addDaysISO(base, n * 365);
  }
  if (/(يومين)/.test(t)) return addDaysISO(base, 2);
  if (/(اسبوعين)/.test(t)) return addDaysISO(base, 14);
  if (/(شهرين)/.test(t)) return addDaysISO(base, 60);

  // يوم 15 أكتوبر / 15 أكتوبر
  const named = /(?:يوم\s+)?(\d{1,2})\s+([ء-غف-يa-z]+)\s*(20\d{2})?/.exec(t);
  if (named) {
    const day = Number(named[1]);
    const mon = monthFromName(named[2]);
    if (day >= 1 && day <= 31 && mon) {
      return resolveDay(day, mon, named[3] ? Number(named[3]) : undefined, from);
    }
  }
  // October 15 / Oct 15th (english month-first)
  for (const { m, names } of AR_MONTHS) {
    for (const n of names) {
      if (!/^[a-z]/.test(n)) continue;
      const mm = new RegExp(`${n.trim()}\\w*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(20\\d{2})?`).exec(t);
      if (mm) {
        const day = Number(mm[1]);
        if (day >= 1 && day <= 31) {
          return resolveDay(day, m, mm[2] ? Number(mm[2]) : undefined, from);
        }
      }
    }
  }
  // 15/10 / 15-10-2026
  const numeric = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20?\d{2}))?/.exec(t);
  if (numeric) {
    const day = Number(numeric[1]);
    const mon = Number(numeric[2]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      let year = numeric[3] ? Number(numeric[3]) : from.getFullYear();
      if (year < 100) year += 2000;
      return resolveDay(day, mon, numeric[3] ? year : undefined, from);
    }
  }
  return undefined;
}

// ─── extraction helpers ────────────────────────────────────────────

const PRODUCT_WORDS: Array<{ match: string[]; ar: string; en: string }> = [
  { match: ['غساله', 'washing machine', 'washer'], ar: 'غسالة', en: 'washing machine' },
  { match: ['تلاجه', 'ثلاجه', 'fridge', 'refrigerator'], ar: 'ثلاجة', en: 'fridge' },
  { match: ['تكييف', 'مكيف', 'air conditioner', 'aircondition'], ar: 'تكييف', en: 'A/C' },
  { match: ['موبايل', 'تليفون', 'ايفون', 'سامسونج', 'mobile', 'phone', 'iphone'], ar: 'موبايل', en: 'mobile' },
  { match: ['لابتوب', 'لاب توب', 'laptop'], ar: 'لابتوب', en: 'laptop' },
  { match: ['تلفزيون', 'تلفاز', 'شاشه', 'tv', 'television', 'screen'], ar: 'شاشة/تلفزيون', en: 'TV' },
  { match: ['بوتاجاز', 'فرن', 'stove', 'oven', 'cooker'], ar: 'بوتاجاز', en: 'stove' },
  { match: ['سخان', 'heater', 'boiler'], ar: 'سخان', en: 'heater' },
  { match: ['مكنسه', 'vacuum'], ar: 'مكنسة', en: 'vacuum' },
  { match: ['مروحه', 'fan'], ar: 'مروحة', en: 'fan' },
  { match: ['ديب فريزر', 'فريزر', 'freezer', 'deep freezer'], ar: 'فريزر', en: 'freezer' },
  { match: ['غساله اطباق', 'dishwasher'], ar: 'غسالة أطباق', en: 'dishwasher' },
  { match: ['راوتر', 'router'], ar: 'راوتر', en: 'router' },
  { match: ['عربيه', 'سياره', 'car', 'vehicle'], ar: 'سيارة', en: 'car' },
];

const UTILITY_WORDS: Array<{ match: string[]; ar: string; en: string; key: string }> = [
  { match: ['كهربا', 'electric', 'power'], ar: 'الكهرباء', en: 'Electricity', key: 'electricity' },
  { match: ['مياه', 'ميه', 'water'], ar: 'المياه', en: 'Water', key: 'water' },
  { match: ['غاز', 'gas'], ar: 'الغاز', en: 'Gas', key: 'gas' },
  { match: ['انترنت', 'نت', 'راوتر', 'باقه', 'internet', 'wifi', 'broadband'], ar: 'الإنترنت', en: 'Internet', key: 'internet' },
  { match: ['موبايل', 'خط', 'رصيد', 'mobile', 'cell'], ar: 'الموبايل', en: 'Mobile', key: 'mobile' },
  { match: ['ارضي', 'تليفون ارضي', 'landline'], ar: 'التليفون الأرضي', en: 'Landline', key: 'landline' },
  { match: ['قسط', 'اقساط', 'installment'], ar: 'الأقساط', en: 'Installments', key: 'installment' },
  { match: ['اشتراك', 'subscription'], ar: 'الاشتراك', en: 'Subscription', key: 'subscription' },
];

function findProduct(t: string): { ar: string; en: string } | undefined {
  for (const p of PRODUCT_WORDS) {
    if (p.match.some((w) => hasWord(t, w))) return { ar: p.ar, en: p.en };
  }
  return undefined;
}

function findUtility(t: string): { ar: string; en: string; key: string } | undefined {
  for (const u of UTILITY_WORDS) {
    if (u.match.some((w) => hasWord(t, w))) return { ar: u.ar, en: u.en, key: u.key };
  }
  return undefined;
}

function findAmount(raw: string): string | undefined {
  const t = normAr(raw);
  const m = /(\d[\d.,]*)\s*(جنيه|جنيه|ج\.?\s?م|egp|le|ج\b|pounds?|\$)/.exec(t)
    || /(egp|le)\s*(\d[\d.,]*)/.exec(t);
  if (!m) return undefined;
  const n = m[1] && /\d/.test(m[1]) ? m[1] : m[2];
  return `${n} EGP`;
}

function findMerchant(raw: string): string | undefined {
  const t = normAr(raw);
  const mAr = /(?:من\s+(?:متجر|محل|معرض|توكيل)\s+)([ء-غف-ي ]{2,24})/.exec(t);
  if (mAr) {
    const name = mAr[1].replace(/\s*بـ\s*$/, '').trim();
    if (name) return name;
  }
  const mEn = /(?:from|at)\s+(?:the\s+)?(?:store|shop)\s+([a-z][a-z .&]{1,22})/.exec(t);
  if (mEn) return mEn[1].trim();
  return undefined;
}

function findInvoiceNo(raw: string): string | undefined {
  const t = normAr(raw);
  const m = /فاتوره\s*(?:رقم\s*)?([a-z0-9\-]{3,})/.exec(t)
    || /invoice\s*(?:no|number|#)?\s*([a-z0-9\-]{3,})/.exec(t);
  if (m) return m[1].toUpperCase();
  return undefined;
}

// ─── category detection (AR + EN rules) ─────────────────────────────

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
      ['license', 2], ['licence', 2], ['traffic', 2], ['car license', 3], ['driving license', 3],
      ['license renewal', 3], ['traffic fine', 3], ['traffic ticket', 2], ['vehicle registration', 2],
    ],
    combos: [
      { all: ['عربيه', 'تجديد'], bonus: 3 }, { all: ['عربيه', 'رخصه'], bonus: 3 },
      { all: ['رخصه', 'هتخلص'], bonus: 3 }, { all: ['رخصه', 'انته'], bonus: 2 },
      { all: ['نقل', 'ملكيه'], bonus: 3 }, { all: ['توكيل', 'عربيه'], bonus: 2 },
      { all: ['car', 'license'], bonus: 3 }, { all: ['license', 'expire'], bonus: 3 },
      { all: ['license', 'renew'], bonus: 3 }, { all: ['driving', 'test'], bonus: 2 },
    ],
  },
  {
    cat: 'national_id',
    any: [
      ['بطاقه', 2], ['رقم قومي', 3], ['سجل مدني', 3], ['احوال مدنيه', 3], ['استماره بطاقه', 3],
      ['national id', 3], ['id card', 3], ['civil registry', 2], ['id renewal', 2],
    ],
    combos: [
      { all: ['بدل فاقد', 'بطاقه'], bonus: 3 }, { all: ['تجديد', 'بطاقه'], bonus: 2 },
      { all: ['renew', 'id'], bonus: 2 }, { all: ['lost', 'id'], bonus: 2 },
    ],
  },
  {
    cat: 'passport',
    any: [['جواز', 3], ['باسبور', 3], ['جوازات', 2], ['passport', 3], ['travel document', 2]],
    combos: [
      { all: ['بدل فاقد', 'جواز'], bonus: 2 }, { all: ['تجديد', 'جواز'], bonus: 2 },
      { all: ['renew', 'passport'], bonus: 2 }, { all: ['new', 'passport'], bonus: 2 },
    ],
  },
  {
    cat: 'travel',
    any: [
      ['مسافر', 3], ['سفريه', 3], ['رحله', 2], ['طياره', 3], ['طيران', 2],
      ['مطار', 2], ['فندق', 2], ['تاشيره', 2], ['اجازه', 1], ['شهر عسل', 3], ['حجز', 1],
      ['travel', 2], ['traveling', 3], ['travelling', 3], ['flight', 3], ['trip', 2],
      ['hotel', 2], ['airport', 2], ['vacation', 2], ['honeymoon', 3], ['visa', 2], ['booking', 1],
    ],
    combos: [
      { all: ['فيزا', 'سفر'], bonus: 3 }, { all: ['فيزا', 'شنجن'], bonus: 3 },
      { all: ['حجز', 'فندق'], bonus: 2 }, { all: ['حجز', 'طيران'], bonus: 2 },
      { all: ['سفر', 'يوم'], bonus: 2 },
      { all: ['book', 'flight'], bonus: 2 }, { all: ['book', 'hotel'], bonus: 2 },
      { all: ['travel', 'visa'], bonus: 2 },
    ],
  },
  {
    cat: 'move',
    any: [
      ['انقل', 3], ['عزل', 3], ['عفش', 3], ['شقه جديده', 3], ['عقد ايجار', 3],
      ['ايجار', 2], ['تمليك', 2], ['سمسار', 2], ['نقل', 1], ['شقه', 1], ['سكن', 1],
      ['moving', 3], ['relocate', 3], ['apartment', 2], ['flat', 2], ['rent', 2],
      ['lease', 2], ['landlord', 2], ['furniture', 2], ['new home', 2],
    ],
    combos: [
      { all: ['انقل', 'شقه'], bonus: 2 }, { all: ['نقل', 'عفش'], bonus: 2 },
      { all: ['شقه', 'جديده'], bonus: 2 },
      { all: ['move', 'apartment'], bonus: 3 }, { all: ['new', 'apartment'], bonus: 2 },
      { all: ['rent', 'apartment'], bonus: 2 },
    ],
  },
  {
    cat: 'bill',
    any: [
      ['فاتوره', 2], ['كهربا', 2], ['مياه', 2], ['ميه', 2], ['غاز', 2],
      ['انترنت', 2], ['باقه', 2], ['ارضي', 2], ['قسط', 2], ['اقساط', 2],
      ['اشتراك', 2], ['عداد', 2], ['مستحق', 1], ['ادفع', 1],
      ['bill', 2], ['invoice', 2], ['electricity', 2], ['electric', 2], ['gas', 2],
      ['internet', 2], ['recharge', 2], ['topup', 2], ['subscription', 2], ['installment', 2],
      ['payment', 1], ['overdue', 1], ['utility', 1],
    ],
    combos: [
      { all: ['ادفع', 'فاتوره'], bonus: 2 }, { all: ['فاتوره', 'نت'], bonus: 2 },
      { all: ['شحن', 'عداد'], bonus: 2 },
      { all: ['pay', 'bill'], bonus: 2 }, { all: ['electricity', 'bill'], bonus: 3 },
      { all: ['phone', 'bill'], bonus: 2 }, { all: ['pay', 'invoice'], bonus: 2 },
    ],
  },
  {
    cat: 'return',
    any: [
      ['ارجاع', 3], ['استرجاع', 3], ['مرتجع', 3], ['استبدال', 2], ['ارجع', 2],
      ['سياسه الارجاع', 3], ['عايز ارجع', 3],
      ['refund', 3], ['return policy', 3], ['exchange', 2],
    ],
    combos: [
      { all: ['ارجع', 'منتج'], bonus: 2 }, { all: ['ارجاع', 'منتج'], bonus: 2 },
      { all: ['return', 'product'], bonus: 2 }, { all: ['want', 'refund'], bonus: 2 },
    ],
  },
  {
    cat: 'warranty',
    any: [
      ['ضمان', 3], ['عطلان', 3], ['بايظ', 3], ['خربان', 3], ['مش شغال', 3],
      ['عطل', 2], ['توكيل', 1], ['صيانه', 2], ['بلاغ', 1], ['عيب صناعه', 3],
      ['warranty', 3], ['broken', 3], ['not working', 3], ['defect', 2], ['faulty', 2],
      ['repair', 2], ['malfunction', 3], ['manufacturing defect', 3],
    ],
    combos: [
      { all: ['توكيل', 'صيانه'], bonus: 2 }, { all: ['حصلت', 'مشكله'], bonus: 1 },
      { all: ['في', 'الضمان'], bonus: 2 },
      { all: ['warranty', 'claim'], bonus: 3 }, { all: ['under', 'warranty'], bonus: 2 },
    ],
  },
  {
    cat: 'purchase',
    any: [
      ['اشتري', 3], ['فاتوره شرا', 3], ['ايصال شرا', 3], ['ريسيت', 2],
      ['غساله', 1], ['تلاجه', 1], ['تكييف', 1], ['موبايل', 1], ['لابتوب', 1],
      ['شاشه', 1], ['بوتاجاز', 1], ['سخان', 1], ['متجر', 1], ['معرض', 1],
      ['bought', 3], ['purchase', 3], ['receipt', 2], ['buy', 2],
      ['washing machine', 1], ['fridge', 1], ['laptop', 1], ['store', 1],
    ],
    combos: [
      { all: ['فاتوره', 'ضمان'], bonus: 3 }, { all: ['اشتري', 'فاتوره'], bonus: 2 },
      { all: ['صورت', 'فاتوره'], bonus: 2 }, { all: ['صوره', 'فاتوره'], bonus: 2 },
      { all: ['invoice', 'warranty'], bonus: 3 }, { all: ['bought', 'receipt'], bonus: 2 },
    ],
  },
  {
    cat: 'gov_request',
    any: [
      ['بدل فاقد', 3], ['مستند ناقص', 3], ['اترفض', 3], ['مرفوض', 3],
      ['رفض الطلب', 3], ['تم رفض', 3], ['استكمال', 2], ['شهر عقاري', 3],
      ['توكيل', 1], ['تصريح', 2], ['شهاده ميلاد', 3], ['قيد عائلي', 3],
      ['مصلحه حكوميه', 2], ['ورقه حكوميه', 2], ['نقص المستند', 3], ['برجاء التوجه', 2],
      ['replaced lost', 2], ['rejected', 3], ['rejection', 3], ['refused', 3],
      ['incomplete', 2], ['missing document', 3], ['required documents', 2],
      ['birth certificate', 3], ['government', 2], ['permit', 2], ['authorization', 2],
    ],
    combos: [
      { all: ['توكيل', 'رسمي'], bonus: 2 }, { all: ['توكيل', 'شهر عقاري'], bonus: 2 },
      { all: ['الطلب', 'ناقص'], bonus: 2 },
      { all: ['request', 'rejected'], bonus: 3 }, { all: ['application', 'rejected'], bonus: 3 },
      { all: ['need', 'documents'], bonus: 1 },
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

export function detect(raw: string, lang: Lang = 'ar'): Detection {
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

  if (category === 'bill' && (hasWord(t, 'ضمان') || hasWord(t, 'warranty') || findProduct(t))) {
    const purchase = scores.find((x) => x.cat === 'purchase');
    if (purchase && purchase.s >= 1) {
      category = 'purchase';
      confidence = 'medium';
    }
  }

  const extracted: Record<string, string> = {};
  const deadline = parseDateFromText(raw);
  if (deadline) extracted.deadlineHint = formatShortDate(deadline, lang);
  const amount = findAmount(raw);
  if (amount) extracted.amount = amount;
  const merchant = findMerchant(raw);
  if (merchant) extracted.merchant = merchant;
  const invoice = findInvoiceNo(raw);
  if (invoice) extracted.invoiceNo = invoice;
  const product = findProduct(t);
  if (product) {
    extracted.productAr = product.ar;
    extracted.productEn = product.en;
  }
  const utility = findUtility(t);
  if (utility) {
    extracted.utilityAr = utility.ar;
    extracted.utilityEn = utility.en;
    extracted.utilityKey = utility.key;
  }
  if (category === 'gov_request' && /(رفض|ناقص|استكمال|reject|refus|missing|incomplete)/.test(t)) {
    extracted.reason = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  return {
    category,
    confidence,
    title: buildTitle(category, extracted, raw, lang),
    deadline,
    extracted,
    questions: questionsForCategory(category, lang),
  };
}

function pick(ex: Record<string, string>, arKey: string, enKey: string, lang: Lang): string | undefined {
  return lang === 'ar' ? ex[arKey] : ex[enKey];
}

function buildTitle(category: CategoryId, ex: Record<string, string>, raw: string, lang: Lang): string {
  const product = pick(ex, 'productAr', 'productEn', lang);
  const utility = pick(ex, 'utilityAr', 'utilityEn', lang);
  if (lang === 'en') {
    switch (category) {
      case 'car_license': return 'Car license renewal';
      case 'national_id': return 'National ID';
      case 'passport': return 'Passport';
      case 'travel': return ex.deadlineHint ? `Trip ${ex.deadlineHint}` : 'Trip preparation';
      case 'move': return 'Moving to a new home';
      case 'bill': return utility ? `${utility} bill` : 'Pay a bill';
      case 'return': return product ? `Return ${product}` : 'Return a product';
      case 'warranty': return product ? `${product} fault — warranty claim` : 'Warranty fault report';
      case 'purchase': return product ? `Buying ${product}` : 'Protect a purchase';
      case 'gov_request': return ex.reason ? 'Rejected request — missing documents' : 'Government request';
      default: return raw.replace(/\s+/g, ' ').trim().slice(0, 44) || 'New task';
    }
  }
  switch (category) {
    case 'car_license': return 'تجديد رخصة السيارة';
    case 'national_id': return 'بطاقة الرقم القومي';
    case 'passport': return 'جواز السفر';
    case 'travel': return ex.deadlineHint ? `رحلة ${ex.deadlineHint}` : 'تجهيز للسفر';
    case 'move': return 'النقل لسكن جديد';
    case 'bill': return utility ? `فاتورة ${utility}` : 'دفع فاتورة';
    case 'return': return product ? `إرجاع ${product}` : 'إرجاع منتج';
    case 'warranty': return product ? `عطل ${product} — مطالبة ضمان` : 'بلاغ عطل في الضمان';
    case 'purchase': return product ? `شراء ${product}` : 'حماية عملية شراء';
    case 'gov_request': return ex.reason ? 'طلب مرفوض — استكمال مستندات' : 'طلب/إجراء حكومي';
    default: return raw.replace(/\s+/g, ' ').trim().slice(0, 44) || 'مهمة جديدة';
  }
}

// ─── clarifying questions (bilingual) ───────────────────────────────

function deadlineQ(lang: Lang): Question {
  return lang === 'ar'
    ? { id: 'deadline', label: 'آخر موعد؟ (اختياري — اكتب زي: 15 أكتوبر / بكرة / بعد أسبوع)', placeholder: 'مثال: 18 أكتوبر', optional: true }
    : { id: 'deadline', label: 'Deadline? (optional — e.g. October 15 / tomorrow / in a week)', placeholder: 'Example: October 18', optional: true };
}

const AR_QUESTIONS: Record<CategoryId, Question[]> = {
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

const EN_QUESTIONS: Record<CategoryId, Question[]> = {
  car_license: [
    { id: 'licenseType', label: 'License type?', options: ['Private car', 'Driving license', 'Professional', 'Motorcycle'], optional: false },
    { id: 'unit', label: 'Traffic unit? (optional)', placeholder: 'Example: Nasr City traffic', optional: true },
  ],
  national_id: [
    { id: 'idAction', label: 'What do you need for the ID?', options: ['Renew', 'Lost replacement', 'Damaged replacement', 'First time'], optional: false },
  ],
  passport: [
    { id: 'passAction', label: 'What do you need for the passport?', options: ['First issue', 'Renew', 'Lost replacement', 'Damaged replacement'], optional: false },
  ],
  travel: [
    { id: 'destination', label: 'Where to? (optional)', placeholder: 'Example: Dubai / Sahel', optional: true },
    { id: 'companions', label: 'Traveling alone?', options: ['Alone', 'With family', 'With friends', 'Work'], optional: true },
  ],
  move: [
    { id: 'moveType', label: 'The new place?', options: ['Rent', 'Own', 'Still looking'], optional: false },
    { id: 'area', label: 'Area? (optional)', placeholder: 'Example: Faisal, Giza', optional: true },
  ],
  bill: [
    { id: 'billType', label: 'Which bill?', options: ['Electricity', 'Water', 'Gas', 'Internet', 'Mobile', 'Installments', 'Other'], optional: false },
  ],
  return: [
    { id: 'store', label: 'Bought from? (optional)', placeholder: 'Store name', optional: true },
    { id: 'buyDate', label: 'Purchase date? (optional)', placeholder: 'Example: September 10', optional: true },
  ],
  warranty: [
    { id: 'product', label: 'Which product? (optional)', placeholder: 'Example: LG washer', optional: true },
    { id: 'warrantyValid', label: 'Is the warranty still valid?', options: ['Yes, valid', 'Not sure', 'Expired'], optional: true },
  ],
  purchase: [
    { id: 'store', label: 'Bought from? (optional)', placeholder: 'Store name', optional: true },
  ],
  gov_request: [
    { id: 'authority', label: 'Which authority? (optional)', placeholder: 'Example: Civil registry / district', optional: true },
  ],
  generic: [
    { id: 'place', label: 'Related place? (optional)', placeholder: 'Example: Work / home', optional: true },
  ],
};

export function questionsForCategory(cat: CategoryId, lang: Lang = 'ar'): Question[] {
  const base = lang === 'ar' ? AR_QUESTIONS : EN_QUESTIONS;
  return [...(base[cat] ?? []), deadlineQ(lang)];
}

export function titleForCategory(cat: CategoryId, ex: Record<string, string>, raw: string, lang: Lang = 'ar'): string {
  return buildTitle(cat, ex, raw, lang);
}

export function allCategories(): CategoryId[] {
  return ['car_license', 'national_id', 'passport', 'travel', 'move', 'bill', 'return', 'warranty', 'purchase', 'gov_request', 'generic'];
}

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

function buildPlanAr(category: CategoryId, ex: Record<string, string>, a: Answers, dl?: string): BuiltPlan {
  switch (category) {
    case 'car_license': {
      const lt = a.licenseType || 'تسيير ملاكي';
      return {
        title: `تجديد الرخصة (${lt})`,
        summary: `خطة تجديد الرخصة خطوة بخطوة: من الاستعلام عن المخالفات لحد استلام الرخصة الجديدة.${a.unit ? ` — وحدة ${a.unit}.` : ''}`,
        pathId: 'car', trust: 'official', deadline: dl,
        steps: [
          st('استعلم عن المخالفات', 'اعرف عليك كام قبل ما تتحرك — أونلاين بالرقم القومي ورقم اللوحة.', 'استعلام المخالفات', 'https://ppo.gov.eg'),
          st('ادفع المخالفات وطلّع شهادة براءة الذمة', 'صلاحيتها محدودة (حوالي 15 يوم) — خلّص باقي الخطوات بسرعة بعدها.'),
          st('جهّز المستندات', 'بطاقة سارية + الرخصة الحالية + وثيقة التأمين الإجباري + نماذج الفحص من وحدة المرور.'),
          st('روح وحدة المرور وافحص', lt.includes('قيادة') ? 'كشف طبي + اختبارات حسب نوع رخصة القيادة.' : 'الفحص الفني للسيارة + مطابقة البصمة والطفاية والمثلث.'),
          st('ادفع الرسوم والضريبة', 'في الخزينة أو إلكترونيًا — احتفظ بالإيصالات كلها.'),
          st('استلم الرخصة وصوّرها', 'صوّر الرخصة الجديدة واحفظها في وثائق خَلِّصها عشان تلاقيها أي وقت.'),
        ],
        docs: [dc('بطاقة رقم قومي سارية'), dc('الرخصة الحالية'), dc('شهادة المخالفات (براءة الذمة)', 'صالحة لمدة محدودة'), dc('وثيقة التأمين الإجباري'), dc('إيصالات الدفع')],
        consequences: [
          { level: 'danger', text: 'القيادة برخصة منتهية قد تعرّضك لغرامة أو سحب الرخصة حسب قانون المرور.' },
          { level: 'warn', text: 'لو شهادة المخالفات انتهت صلاحيتها هتحتاج تطلع واحدة جديدة.' },
        ],
        sources: [
          { sourceId: 'moi-traffic', note: 'تجديد وخدمات التراخيص', noteEn: 'Renewals & licensing' },
          { sourceId: 'ppo-traffic', note: 'المخالفات وبراءة الذمة', noteEn: 'Fines & clearance' },
          { sourceId: 'digital-egypt', note: 'خدمات المركبات أونلاين', noteEn: 'Vehicle services online' },
        ],
      };
    }
    case 'national_id': {
      const act = a.idAction || 'تجديد';
      return {
        title: `البطاقة — ${act}`,
        summary: `خطة ${act} بطاقة الرقم القومي من السجل المدني: الاستمارة والمستندات والاستلام.`,
        pathId: 'docs', trust: 'official', deadline: dl,
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
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'moi-main', note: 'قطاع الأحوال المدنية', noteEn: 'Civil registry sector' }],
      };
    }
    case 'passport': {
      const act = a.passAction || 'استخراج أول مرة';
      return {
        title: `جواز السفر — ${act}`,
        summary: `خطة ${act} لجواز السفر من مصلحة الجوازات: المستندات والرسوم والاستلام.`,
        pathId: 'docs', trust: 'official', deadline: dl,
        steps: [
          st('جهّز المستندات', 'بطاقة سارية + 3-4 صور حديثة بخلفية بيضاء + شهادة الميلاد + موقف التجنيد (للذكور) + المؤهل.'),
          st('املا النموذج في الجوازات', 'نموذج طلب الحصول على جواز سفر — عادي أو مستعجل حسب احتياجك.'),
          st('ادفع الرسوم واستلم الإيصال', 'احتفظ بالإيصال — فيه موعد الاستلام.'),
          st('استلم الجواز وصوّره', 'راجع الاسم والبيانات، وصوّر أول صفحتين للوثائق.'),
        ],
        docs: [dc('بطاقة رقم قومي سارية'), dc('صور شخصية حديثة'), dc('شهادة الميلاد'), dc('موقف التجنيد'), dc('إيصال الاستلام')],
        consequences: [{ level: 'warn', text: 'من غير جواز ساري مش هتعرف تحجز أو تسافر — والمعاملة المستعجلة أغلى.' }],
        sources: [{ sourceId: 'moi-main', note: 'مصلحة الجوازات والهجرة', noteEn: 'Passports & immigration' }, { sourceId: 'digital-egypt' }],
      };
    }
    case 'travel': {
      return {
        title: 'رحلة ' + ([a.destination, ex.deadlineHint].filter(Boolean).join(' ') || 'جديدة'),
        summary: `مشروع سفر كامل: مستندات، حجوزات، تأمين، وتجهيزات — عشان تسافر وانت مطمن.${a.destination ? ` الوجهة: ${a.destination}.` : ''}`,
        pathId: 'travel', trust: 'trusted', deadline: dl,
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
        sources: [{ sourceId: 'egyptair' }, { sourceId: 'moi-main', note: 'الجوازات', noteEn: 'Passports' }],
      };
    }
    case 'move': {
      const type = a.moveType || 'إيجار';
      return {
        title: `النقل لشقة (${type})${a.area ? ` — ${a.area}` : ''}`,
        summary: 'خطة انتقال كاملة: قبل الانتقال، يوم الانتقال، وبعد الانتقال — من العقد لحد أول فاتورة.',
        pathId: 'home', trust: 'trusted', deadline: dl,
        steps: [
          st('عاين الشقة واتفق على العقد', type === 'تمليك' ? 'راجع الملكية والتراخيص — واستشير محامي قبل دفع أي عربون.' : 'راجع مدة العقد والقيمة والزيادة السنوية والتأمين — ووثّق العقد لو أمكن.'),
          st('رتّب المرافق', 'كهرباء + مياه + غاز: نقل ملكية العدادات أو تعاقد جديد حسب الحالة.'),
          st('انقل الإنترنت والتليفون', 'قدّم طلب نقل الخدمة قبل الانتقال بأسبوع على الأقل.'),
          st('احجز نقل العفش', 'شركة نقل موثوقة + كراتين وتغليف للحاجات القابلة للكسر.'),
          st('يوم الانتقال: صوّر قراءات العدادات', 'صوّر كل العدادات (قديم وجديد) — الصور دي بتحميك من أي نزاع.'),
          st('استلم المفاتيح وافحص الشقة', 'كهرباء، سباكة، نجارة — وسجّل أي ملاحظة في محضر الاستلام.'),
          st('بعد الانتقال: حدّث بياناتك', 'عنوان البطاقة/البنك/الشغل — واحفظ كل العقود في الوثائق.'),
        ],
        docs: [dc('عقد الإيجار/التمليك'), dc('إيصالات المرافق'), dc('صور قراءات العدادات'), dc('محضر الاستلام'), dc('إيصالات نقل العفش')],
        consequences: [{ level: 'warn', text: 'من غير عقد موثق وقراءات عدادات مصوّرة، أي نزاع لاحق هيبقى صعب إثباته.' }],
        sources: [{ sourceId: 'electricity' }, { sourceId: 'water' }, { sourceId: 'digital-egypt', note: 'خدمات التوثيق', noteEn: 'Notarization services' }],
      };
    }
    case 'bill': {
      const bt = a.billType || ex.utilityAr || 'الفاتورة';
      const srcs: SourceRef[] =
        bt.includes('كهرباء') ? [{ sourceId: 'electricity' }, { sourceId: 'fawry' }]
        : bt.includes('مياه') ? [{ sourceId: 'water' }, { sourceId: 'fawry' }]
        : [{ sourceId: 'fawry' }, { sourceId: 'instapay' }];
      return {
        title: `فاتورة ${bt}${ex.amount ? ` — ${ex.amount}` : ''}`,
        summary: `ادفع فاتورة ${bt} واحتفظ بالإيصال — وفعّل المتابعة عشان متفوتش الشهر الجاي.`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('اعرف قيمة الفاتورة وآخر موعد', ex.amount ? `المبلغ المستخرج: ${ex.amount} — تأكد منه من الإيصال.` : 'من الإيصال أو تطبيق الجهة أو رسائل الموبايل.'),
          st('ادفع من القناة المناسبة', 'فوري / انستاباي / تطبيق الجهة / الفرع — اختار الأسهل ليك.'),
          st('احفظ إيصال الدفع', 'صوّر الإيصال واحفظه في الوثائق — مهم لو حصل أي خطأ.'),
          st('فعّل المتابعة الشهرية', 'اضغط "ابدأ المتابعة" وخَلِّصها هيفكرك قبل الموعد كل شهر.'),
        ],
        docs: [dc('صورة الفاتورة'), dc('إيصال الدفع')],
        consequences: [{ level: 'warn', text: 'التأخير قد يترتب عليه رسوم إضافية أو انقطاع الخدمة وفق شروط الجهة.' }],
        sources: srcs,
      };
    }
    case 'return': {
      return {
        title: ex.productAr ? `إرجاع ${ex.productAr}` : 'إرجاع منتج',
        summary: `ارجع حقك صح: سياسة الإرجاع، تجهيز المنتج والفاتورة، والمتابعة لحد رد المبلغ.${ex.merchant || a.store ? ` المتجر: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('راجع سياسة الإرجاع والمدة', 'شوف المدة المسموحة وشروط الاستبدال/رد المبلغ قبل ما تتحرك.'),
          st('جهّز المنتج والفاتورة', 'المنتج بحالته الأصلية + العلبة + الفاتورة — صوّر كل حاجة قبل التسليم.'),
          st('تواصل مع المتجر', 'خدمة العملاء أو الفرع — واسأل عن خطوات الإرجاع المعتمدة عندهم.'),
          st('سلّم المرتجع وخد إيصال', 'إيصال استلام المرتجع هو إثباتك — متسلّمش من غيره.'),
          st('تابع رد المبلغ', 'تابع حسابك البنكي/المحفظة — ولو اتأخر صعّد لجهاز حماية المستهلك.'),
        ],
        docs: [dc('فاتورة الشراء'), dc('صور المنتج قبل التسليم'), dc('إيصال استلام المرتجع')],
        consequences: [{ level: 'danger', text: 'بعد انتهاء مدة الإرجاع قد تفقد حقك في الاستبدال أو رد المبلغ.' }],
        sources: [{ sourceId: 'cpa', note: 'لو المتجر رفض حقك القانوني', noteEn: 'If the store denies your legal right' }],
      };
    }
    case 'warranty': {
      const prod = a.product || ex.productAr || 'المنتج';
      return {
        title: `عطل ${prod} — مطالبة ضمان`,
        summary: `ملف مطالبة ضمان مرتب: إثبات العطل + إثبات الشراء + متابعة البلاغ لحد الإصلاح.${ex.merchant || a.store ? ` جهة الشراء: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'home', trust: 'trusted', deadline: dl,
        steps: [
          st('صوّر المشكلة', 'صور وفيديو قصير يوضح العطل — ده أقوى إثبات عندك.'),
          st('جمّع أوراقك', 'الفاتورة + شهادة الضمان + الرقم التسلسلي للمنتج.'),
          st('كلّم الضمان وسجّل بلاغ', 'خد رقم البلاغ واسم الموظف وموعد الزيارة المتوقع — وسجّلهم هنا.'),
          st('تابع الإصلاح', 'لو الموعد فات من غير زيارة، اتصل تاني وارفع شكوى برقم البلاغ.'),
          st('استلم تقرير الصيانة', 'اقرأ التقرير قبل التوقيع — واحفظ نسخة في الوثائق.'),
        ],
        docs: [dc('صور/فيديو العطل'), dc('فاتورة الشراء'), dc('شهادة الضمان'), dc('رقم البلاغ'), dc('تقرير الصيانة')],
        consequences: [{ level: 'warn', text: 'التأخير في الإبلاغ قد يصعّب إثبات أن العطل من عيوب الصناعة المشمولة بالضمان.' }],
        sources: [{ sourceId: 'cpa', note: 'لو الضمان رفض الإصلاح المستحق', noteEn: 'If the warranty denies due repair' }],
      };
    }
    case 'purchase': {
      return {
        title: ex.productAr ? `شراء ${ex.productAr}` : 'حماية عملية شراء',
        summary: `حمّلت فاتورتك؟ خَلِّصها هيحمي عملية الشراء: الإرجاع، الضمان، والإثباتات — كلها في مكان واحد.${ex.amount ? ` المبلغ: ${ex.amount}.` : ''}${ex.merchant || a.store ? ` المتجر: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('احفظ الفاتورة', 'صوّر الفاتورة الورقية أو احفظ الإلكترونية في الوثائق.'),
          st('سجّل الضمان', 'سجّل المنتج على موقع الوكيل لو متاح — وفعّل الضمان من تاريخ الشراء.'),
          st('اعرف مدة الإرجاع', 'سجّل آخر موعد للإرجاع عشان خَلِّصها يتابعك قبله.'),
          st('لو حصل عطل: اعمل مطالبة', 'من صفحة المهمة اضغط "حصلت مشكلة" وخَلِّصها يجهزلك ملف المطالبة.'),
        ],
        docs: [dc('فاتورة الشراء'), dc('شهادة الضمان'), dc('صور المنتج')],
        consequences: [{ level: 'info', text: 'الفاتورة هي إثبات الشراء الوحيد المعتمد — ضياعها يضعف أي مطالبة لاحقة.' }],
        sources: [{ sourceId: 'cpa', note: 'حقوقك كمستهلك', noteEn: 'Your consumer rights' }],
      };
    }
    case 'gov_request': {
      const rejected = Boolean(ex.reason);
      return {
        title: rejected ? 'طلب مرفوض — استكمال مستندات' : `طلب حكومي${a.authority ? ` — ${a.authority}` : ''}`,
        summary: rejected
          ? `طلبك اترفض بسبب نقص مستندات. الخطة: نحدد الناقص، نستخرجه، ونعيد التقديم قبل الموعد.${dl ? ` آخر موعد: ${formatShortDate(dl, 'ar')}.` : ''}`
          : `حوّل الإجراء الحكومي لخطوات واضحة: المستندات، التقديم، والمتابعة لحد الاستلام.${a.authority ? ` الجهة: ${a.authority}.` : ''}`,
        pathId: 'docs', trust: 'official', deadline: dl,
        steps: [
          st('حدد المطلوب بالظبط', rejected ? `سبب الرفض المستخرج: "${ex.reason}" — تأكد منه من الخطاب الأصلي.` : 'من موقع الجهة أو خطاب الطلب: إيه المستندات والنماذج المطلوبة؟'),
          st('استخرج المستند الناقص', 'روح الجهة المختصة بالمستند ده ومعاك بطاقتك — واسأل عن مدة الاستخراج.'),
          st('أعد تقديم الطلب', 'قدّم الملف كامل قبل آخر موعد — وخد رقم متابعة.'),
          st('احفظ إيصال التقديم', 'صوّر الإيصال وأي أرقام متابعة في الوثائق.'),
          st('تابع لحد الاستلام', 'تابع حالة الطلب بالرقم — ولو اتأخر عن المعلن اسأل في الجهة.'),
        ],
        docs: [dc('خطاب الرفض/الطلب'), dc('المستندات المطلوبة'), dc('إيصال التقديم')],
        consequences: [{ level: 'danger', text: rejected ? 'لو عدّى آخر موعد من غير استكمال، غالبًا هتحتاج تبدأ الطلب من الأول.' : 'الأوراق الناقصة هي أشهر سبب لتعطيل أي طلب حكومي.' }],
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'public-guide', note: 'ابحث عن خدمتك بالاسم', noteEn: 'Search for your service by name' }],
      };
    }
    default: {
      return {
        title: 'مهمة جديدة',
        summary: 'خطة تنفيذ عامة — وضّح المطلوب، قسّمه خطوات، وخلّصه خطوة خطوة.',
        pathId: 'other', trust: 'verify', deadline: dl,
        steps: [
          st('وضّح المطلوب بالظبط', 'اكتب في ملاحظات المهمة: إيه النتيجة النهائية اللي عايز توصلها؟'),
          st('قسّمها لخطوات صغيرة', 'عدّل خطوات الخطة دي على مقاس مشكلتك من صفحة المهمة.'),
          st('حدد أول خطوة ونفذها النهاردة', 'أصغر خطوة ممكنة — البداية أهم من الكمال.'),
          st('احفظ إثبات الانتهاء', 'صورة، إيصال، أو ملاحظة — عشان سجل إنجازك يكبر.'),
        ],
        docs: [dc('أي مستندات مرتبطة')],
        consequences: [{ level: 'info', text: 'المهام اللي من غير موعد غالبًا بتتأجل — حدد آخر موعد حتى لو تقريبي.' }],
        sources: [{ sourceId: 'public-guide', note: 'لو الإجراء حكومي ابحث عنه هنا', noteEn: 'If it is a gov procedure, search here' }],
      };
    }
  }
}

function buildPlanEn(category: CategoryId, ex: Record<string, string>, a: Answers, dl?: string): BuiltPlan {
  switch (category) {
    case 'car_license': {
      const lt = a.licenseType || 'Private car';
      return {
        title: `License renewal (${lt})`,
        summary: `Step-by-step license renewal plan: from checking fines to receiving the new license.${a.unit ? ` Unit: ${a.unit}.` : ''}`,
        pathId: 'car', trust: 'official', deadline: dl,
        steps: [
          st('Check your fines', 'Know what you owe before you move — online with your national ID and plate number.', 'Check fines', 'https://ppo.gov.eg'),
          st('Pay fines & get the clearance certificate', 'It has limited validity (~15 days) — finish the next steps quickly.'),
          st('Prepare the documents', 'Valid ID + current license + mandatory insurance + inspection forms from the traffic unit.'),
          st('Go to the traffic unit & inspect', lt.includes('Driving') ? 'Medical check + tests per driving license type.' : 'Technical inspection + matching numbers, extinguisher & triangle.'),
          st('Pay fees & taxes', 'At the treasury or online — keep all receipts.'),
          st('Receive the license & snap it', 'Photograph the new license and save it in the KHALLESA vault.'),
        ],
        docs: [dc('Valid national ID'), dc('Current license'), dc('Fines clearance certificate', 'Limited validity'), dc('Mandatory insurance policy'), dc('Payment receipts')],
        consequences: [
          { level: 'danger', text: 'Driving with an expired license may lead to fines or license withdrawal under traffic law.' },
          { level: 'warn', text: 'If the clearance certificate expires you will need a new one.' },
        ],
        sources: [
          { sourceId: 'moi-traffic', note: 'تجديد وخدمات التراخيص', noteEn: 'Renewals & licensing' },
          { sourceId: 'ppo-traffic', note: 'المخالفات وبراءة الذمة', noteEn: 'Fines & clearance' },
          { sourceId: 'digital-egypt', note: 'خدمات المركبات أونلاين', noteEn: 'Vehicle services online' },
        ],
      };
    }
    case 'national_id': {
      const act = a.idAction || 'Renew';
      return {
        title: `National ID — ${act}`,
        summary: `${act} your national ID at the civil registry: form, documents and pickup.`,
        pathId: 'docs', trust: 'official', deadline: dl,
        steps: [
          st('Buy & fill the form', 'Regular or urgent form — urgent is faster with higher fees.'),
          st('Prepare the documents', 'Birth certificate + profession/marital proof + utility bill for address if needed.'),
          st('Go to the civil registry', 'Go early — bring personal photos if required.'),
          st('Get photographed & take the pickup slip', 'Keep the slip — your proof until pickup.'),
          st('Pick up & snap the new ID', 'Verify the data before leaving, and snap it for the vault.'),
        ],
        docs: [dc('Birth certificate'), dc('Profession/qualification proof'), dc('Address proof (utility bill)'), dc('Old ID (renew/damaged)'), dc('Pickup slip')],
        consequences: [
          { level: 'warn', text: 'Late renewal may incur fines per announced instructions — verify at the registry.' },
          { level: 'info', text: 'A valid ID is required for any bank or government transaction.' },
        ],
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'moi-main', note: 'قطاع الأحوال المدنية', noteEn: 'Civil registry sector' }],
      };
    }
    case 'passport': {
      const act = a.passAction || 'First issue';
      return {
        title: `Passport — ${act}`,
        summary: `${act} your passport at the passports authority: documents, fees and pickup.`,
        pathId: 'docs', trust: 'official', deadline: dl,
        steps: [
          st('Prepare the documents', 'Valid ID + 3-4 recent white-background photos + birth certificate + military status (males) + qualification.'),
          st('Fill the form at the passports office', 'Regular or urgent — pick per your need.'),
          st('Pay & take the receipt', 'Keep the receipt — it shows the pickup date.'),
          st('Pick up & snap the passport', 'Verify name and data, snap the first pages for the vault.'),
        ],
        docs: [dc('Valid national ID'), dc('Recent personal photos'), dc('Birth certificate'), dc('Military status'), dc('Pickup receipt')],
        consequences: [{ level: 'warn', text: 'Without a valid passport you cannot book or travel — urgent processing costs more.' }],
        sources: [{ sourceId: 'moi-main', note: 'مصلحة الجوازات والهجرة', noteEn: 'Passports & immigration' }, { sourceId: 'digital-egypt' }],
      };
    }
    case 'travel': {
      return {
        title: 'Trip ' + ([a.destination, ex.deadlineHint].filter(Boolean).join(' ') || 'preparation'),
        summary: `A complete travel project: documents, bookings, insurance and packing — travel worry-free.${a.destination ? ` Destination: ${a.destination}.` : ''}`,
        pathId: 'travel', trust: 'trusted', deadline: dl,
        steps: [
          st('Check passport validity', 'Most countries require 6+ months validity from travel date.'),
          st('Sort the visa if needed', 'Check destination visa rules early — some take weeks.'),
          st('Book flights & hotel', 'Compare prices and review cancellation policy before paying.'),
          st('Get travel insurance', 'Key for international trips — covers medical emergencies & cancellations.'),
          st('Prepare payment methods', 'Valid cards + enough limit + some cash in local currency.'),
          st('Pack bags & papers', 'Snap passport, visa and bookings into the vault + a copy on your phone.'),
        ],
        docs: [dc('Passport'), dc('Visa'), dc('Flight tickets'), dc('Hotel booking'), dc('Travel insurance')],
        consequences: [
          { level: 'danger', text: 'An expired passport or missing visa can block you from traveling on the day itself.' },
          { level: 'warn', text: 'Late booking is usually pricier with fewer options.' },
        ],
        sources: [{ sourceId: 'egyptair' }, { sourceId: 'moi-main', note: 'الجوازات', noteEn: 'Passports' }],
      };
    }
    case 'move': {
      const type = a.moveType || 'Rent';
      return {
        title: `Moving (${type})${a.area ? ` — ${a.area}` : ''}`,
        summary: 'A complete moving plan: before, on, and after moving day — from contract to first bill.',
        pathId: 'home', trust: 'trusted', deadline: dl,
        steps: [
          st('Inspect & agree the contract', type === 'Own' ? 'Verify ownership and permits — consult a lawyer before any deposit.' : 'Check duration, value, annual increase & deposit — notarize if possible.'),
          st('Arrange utilities', 'Electricity + water + gas: transfer meters or make new contracts.'),
          st('Transfer internet & phone', 'Request the transfer at least a week before moving.'),
          st('Book the movers', 'A trusted moving company + boxes and wrapping for fragile items.'),
          st('Moving day: snap meter readings', 'Photograph all meters (old & new) — photos protect you from disputes.'),
          st('Take keys & inspect the place', 'Electricity, plumbing, carpentry — note everything in the handover report.'),
          st('After: update your data', 'ID/bank/work address — and save all contracts in the vault.'),
        ],
        docs: [dc('Rent/ownership contract'), dc('Utility bills'), dc('Meter reading photos'), dc('Handover report'), dc('Mover receipts')],
        consequences: [{ level: 'warn', text: 'Without a documented contract and meter photos, any later dispute is hard to prove.' }],
        sources: [{ sourceId: 'electricity' }, { sourceId: 'water' }, { sourceId: 'digital-egypt', note: 'خدمات التوثيق', noteEn: 'Notarization services' }],
      };
    }
    case 'bill': {
      const bt = a.billType || ex.utilityEn || 'Bill';
      const key = ex.utilityKey || '';
      const srcs: SourceRef[] =
        key === 'electricity' ? [{ sourceId: 'electricity' }, { sourceId: 'fawry' }]
        : key === 'water' ? [{ sourceId: 'water' }, { sourceId: 'fawry' }]
        : [{ sourceId: 'fawry' }, { sourceId: 'instapay' }];
      return {
        title: `${bt} bill${ex.amount ? ` — ${ex.amount}` : ''}`,
        summary: `Pay the ${bt} bill, keep the receipt — and enable follow-up so you never miss next month.`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('Know the amount & deadline', ex.amount ? `Extracted amount: ${ex.amount} — verify it on the receipt.` : 'From the receipt, the authority app, or SMS.'),
          st('Pay via a suitable channel', 'Fawry / InstaPay / authority app / branch — pick the easiest.'),
          st('Save the payment receipt', 'Snap the receipt into the vault — vital if any error occurs.'),
          st('Enable monthly follow-up', 'Press "Start follow-up" and KHALLESA reminds you before each due date.'),
        ],
        docs: [dc('Bill photo'), dc('Payment receipt')],
        consequences: [{ level: 'warn', text: 'Late payment may add fees or suspend the service per the authority terms.' }],
        sources: srcs,
      };
    }
    case 'return': {
      return {
        title: ex.productEn ? `Return ${ex.productEn}` : 'Return a product',
        summary: `Get your right back properly: return policy, product + invoice prep, and follow-up until refund.${ex.merchant || a.store ? ` Store: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('Review the return policy & window', 'Check the allowed period and exchange/refund terms first.'),
          st('Prepare product & invoice', 'Original condition + box + invoice — photograph everything before handover.'),
          st('Contact the store', 'Customer service or branch — ask about their approved return steps.'),
          st('Hand over & take a receipt', 'The return receipt is your proof — never hand over without one.'),
          st('Track the refund', 'Watch your bank/wallet — if delayed, escalate to consumer protection.'),
        ],
        docs: [dc('Purchase invoice'), dc('Product photos before handover'), dc('Return handover receipt')],
        consequences: [{ level: 'danger', text: 'After the return window ends you may lose exchange/refund rights.' }],
        sources: [{ sourceId: 'cpa', note: 'لو المتجر رفض حقك القانوني', noteEn: 'If the store denies your legal right' }],
      };
    }
    case 'warranty': {
      const prod = a.product || ex.productEn || 'product';
      return {
        title: `${prod} fault — warranty claim`,
        summary: `A tidy warranty claim file: fault proof + purchase proof + report follow-up until repair.${ex.merchant || a.store ? ` Seller: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'home', trust: 'trusted', deadline: dl,
        steps: [
          st('Capture the fault', 'Photos + a short video showing the fault — your strongest proof.'),
          st('Gather your papers', 'Invoice + warranty certificate + product serial number.'),
          st('Call warranty & file a report', 'Take the report number, agent name & expected visit — log them here.'),
          st('Follow up the repair', 'If the date passes with no visit, call again and escalate with the report number.'),
          st('Receive the service report', 'Read it before signing — save a copy in the vault.'),
        ],
        docs: [dc('Fault photos/video'), dc('Purchase invoice'), dc('Warranty certificate'), dc('Report number'), dc('Service report')],
        consequences: [{ level: 'warn', text: 'Late reporting makes it harder to prove a covered manufacturing defect.' }],
        sources: [{ sourceId: 'cpa', note: 'لو الضمان رفض الإصلاح المستحق', noteEn: 'If the warranty denies due repair' }],
      };
    }
    case 'purchase': {
      return {
        title: ex.productEn ? `Buying ${ex.productEn}` : 'Protect a purchase',
        summary: `Got your invoice? KHALLESA protects the purchase: returns, warranty & proofs — all in one place.${ex.amount ? ` Amount: ${ex.amount}.` : ''}${ex.merchant || a.store ? ` Store: ${ex.merchant || a.store}.` : ''}`,
        pathId: 'money', trust: 'trusted', deadline: dl,
        steps: [
          st('Save the invoice', 'Snap the paper invoice or save the electronic one in the vault.'),
          st('Register the warranty', 'Register on the agent site if available — activate from purchase date.'),
          st('Know the return window', 'Log the last return date so KHALLESA follows up before it.'),
          st('If a fault happens: file a claim', 'From the path page press the claim option and KHALLESA preps your file.'),
        ],
        docs: [dc('Purchase invoice'), dc('Warranty certificate'), dc('Product photos')],
        consequences: [{ level: 'info', text: 'The invoice is the only approved purchase proof — losing it weakens any later claim.' }],
        sources: [{ sourceId: 'cpa', note: 'حقوقك كمستهلك', noteEn: 'Your consumer rights' }],
      };
    }
    case 'gov_request': {
      const rejected = Boolean(ex.reason);
      return {
        title: rejected ? 'Rejected request — missing documents' : `Government request${a.authority ? ` — ${a.authority}` : ''}`,
        summary: rejected
          ? `Your request was rejected over missing documents. Plan: identify, extract, and re-submit before the deadline.${dl ? ` Deadline: ${formatShortDate(dl, 'en')}.` : ''}`
          : `Turn the government procedure into clear steps: documents, submission and follow-up to pickup.${a.authority ? ` Authority: ${a.authority}.` : ''}`,
        pathId: 'docs', trust: 'official', deadline: dl,
        steps: [
          st('Pin down exactly what is needed', rejected ? `Extracted rejection reason: "${ex.reason}" — verify it on the original letter.` : 'From the authority site or letter: which documents and forms?'),
          st('Extract the missing document', 'Go to its authority with your ID — ask about processing time.'),
          st('Re-submit the request', 'Submit the full file before the deadline — take a tracking number.'),
          st('Save the submission receipt', 'Snap the receipt and tracking numbers into the vault.'),
          st('Follow up to pickup', 'Track by number — if it exceeds announced time, ask at the authority.'),
        ],
        docs: [dc('Rejection/request letter'), dc('Required documents'), dc('Submission receipt')],
        consequences: [{ level: 'danger', text: rejected ? 'If the deadline passes without completion, you will likely restart the request.' : 'Missing papers are the #1 cause of stalled government requests.' }],
        sources: [{ sourceId: 'digital-egypt' }, { sourceId: 'public-guide', note: 'ابحث عن خدمتك بالاسم', noteEn: 'Search for your service by name' }],
      };
    }
    default: {
      return {
        title: 'New task',
        summary: 'A general action plan — clarify the goal, split into steps, finish step by step.',
        pathId: 'other', trust: 'verify', deadline: dl,
        steps: [
          st('Clarify exactly what is needed', 'Write the end result you want in the task notes.'),
          st('Split into small steps', 'Edit this plan steps to fit your problem from the path page.'),
          st('Set a first step & do it today', 'The smallest possible step — starting beats perfection.'),
          st('Save completion proof', 'A photo, receipt or note — grow your achievement log.'),
        ],
        docs: [dc('Any related documents')],
        consequences: [{ level: 'info', text: 'Tasks without deadlines usually slip — set one even if approximate.' }],
        sources: [{ sourceId: 'public-guide', note: 'لو الإجراء حكومي ابحث عنه هنا', noteEn: 'If it is a gov procedure, search here' }],
      };
    }
  }
}

function buildPlan(category: CategoryId, ex: Record<string, string>, a: Answers, dl: string | undefined, lang: Lang): BuiltPlan {
  return lang === 'ar' ? buildPlanAr(category, ex, a, dl) : buildPlanEn(category, ex, a, dl);
}

export function buildTaskFromDetection(
  rawInput: string,
  detection: Detection,
  answers: Answers,
  origin: KhTask['origin'],
  lang: Lang = 'ar',
  extra?: Partial<KhTask>,
): KhTask {
  const answerDeadline = parseDateFromText(Object.values(answers).join(' '));
  const deadline = detection.deadline ?? answerDeadline ?? parseDateFromText(answers.deadline ?? '');
  const plan = buildPlan(detection.category, detection.extracted, answers, deadline, lang);
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

// ─── prioritization — "What should I do now?" ───────────────────────

export function rankTasks(tasks: KhTask[], lang: Lang = 'ar', from: Date = new Date()): RankedTask[] {
  const ranked: RankedTask[] = tasks.map((task) => {
    if (task.status === 'done') {
      return { task, bucket: 'done' as const, daysLeft: daysUntil(task.deadline, from), reason: lang === 'ar' ? 'خلصت ✅' : 'Done ✅', score: -1 };
    }
    const days = daysUntil(task.deadline, from);
    const hasDanger = task.consequences.some((c) => c.level === 'danger');
    const boost = (task.starred ? 40 : 0) + (hasDanger ? 25 : 0) + (task.followUp ? 10 : 0);
    const n = (v: number) => num(Math.abs(v), lang);
    if (days === null) {
      return {
        task, bucket: 'waiting' as const, daysLeft: null,
        reason: lang === 'ar' ? 'من غير موعد — حدد موعد عشان تظهر في أولوياتك' : 'No deadline — set one to see it in priorities',
        score: 20 + boost,
      };
    }
    if (days < 0) {
      return {
        task, bucket: 'now' as const, daysLeft: days,
        reason: lang === 'ar' ? `متأخرة بـ ${n(days)} يوم — خلّصها الأول` : `Overdue by ${n(days)} days — finish it first`,
        score: 1000 + Math.abs(days) * 10 + boost,
      };
    }
    if (days <= 3) {
      const r = lang === 'ar'
        ? days === 0 ? 'آخر موعد النهاردة!' : days === 1 ? 'فاضل يوم واحد بس' : 'فاضل يومين بس'
        : days === 0 ? 'Deadline is today!' : `Only ${days} day${days === 1 ? '' : 's'} left`;
      return { task, bucket: 'now' as const, daysLeft: days, reason: r, score: 500 - days * 10 + boost };
    }
    if (days <= 14) {
      return {
        task, bucket: 'soon' as const, daysLeft: days,
        reason: lang === 'ar' ? `باقي ${n(days)} يوم — جهّز ورقها من دلوقتي` : `${n(days)} days left — prep its papers now`,
        score: 300 - days * 5 + boost,
      };
    }
    if (days <= 30) {
      return {
        task, bucket: 'soon' as const, daysLeft: days,
        reason: lang === 'ar' ? `باقي ${n(days)} يوم — على الرادار` : `${n(days)} days left — on the radar`,
        score: 150 - days + boost,
      };
    }
    return {
      task, bucket: 'waiting' as const, daysLeft: days,
      reason: lang === 'ar' ? `باقي ${n(days)} يوم — لسه بدري` : `${n(days)} days left — plenty of time`,
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

// ─── claim file ─────────────────────────────────────────────────────

export function buildClaimFile(task: KhTask, lang: Lang = 'ar', memberName?: string): string {
  if (lang === 'en') {
    const lines = [
      '===============================',
      '  Claim file — prepared by KHALLESA',
      '===============================',
      `Subject: ${task.title}`,
      `Date: ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date())}`,
      memberName ? `Claimant: ${memberName}` : '',
      '',
      '— Issue details —',
      task.rawInput || task.summary,
      '',
      '— Attached documents —',
      ...task.docs.map((d) => `${d.have ? '[x]' : '[ ]'} ${d.label}`),
      '',
      '— Follow-up steps —',
      ...task.steps.map((s, i) => `${i + 1}. ${s.title}${s.done ? ' (done)' : ''}`),
      '',
      'This file organizes your claim and does not replace warranty/store terms.',
    ];
    return lines.filter((l) => l !== '').join('\n');
  }
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
