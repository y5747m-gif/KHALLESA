// ─── KHALLESA core types ─────────────────────────────────────────────
// Problem → Action Plan → Execution → Proof (not Task → Reminder)

export type PathId =
  | 'car'
  | 'home'
  | 'work'
  | 'travel'
  | 'money'
  | 'docs'
  | 'family'
  | 'other';

export type CategoryId =
  | 'car_license'
  | 'national_id'
  | 'passport'
  | 'travel'
  | 'move'
  | 'bill'
  | 'return'
  | 'warranty'
  | 'purchase'
  | 'gov_request'
  | 'generic';

export type TrustLevel = 'official' | 'trusted' | 'verify' | 'danger';

export type TaskStatus = 'active' | 'done';

export type TaskOrigin = 'text' | 'voice' | 'photo' | 'assistant';

export interface PlanStep {
  id: string;
  title: string;
  detail?: string;
  done: boolean;
  actionLabel?: string;
  actionUrl?: string;
}

export interface PlanDoc {
  id: string;
  label: string;
  hint?: string;
  have: boolean;
}

export interface Consequence {
  text: string;
  level: 'info' | 'warn' | 'danger';
}

export interface SourceRef {
  sourceId: string;
  note?: string;
}

export interface Question {
  id: string;
  label: string;
  options?: string[];
  placeholder?: string;
  optional: boolean;
}

export type Answers = Record<string, string>;

export interface KhTask {
  id: string;
  title: string;
  category: CategoryId;
  pathId: PathId;
  summary: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  deadline?: string; // ISO date yyyy-mm-dd
  ownerId?: string; // family member this task is about
  assigneeId?: string; // family member responsible for doing it
  steps: PlanStep[];
  docs: PlanDoc[];
  consequences: Consequence[];
  sources: SourceRef[];
  trust: TrustLevel;
  followUp: boolean;
  origin: TaskOrigin;
  rawInput?: string;
  imageIds: string[];
  starred: boolean;
  demo?: boolean;
}

export interface VaultDoc {
  id: string;
  name: string;
  kind: 'image' | 'note';
  dataUrl?: string;
  text?: string;
  taskId?: string;
  createdAt: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  color: string;
  isMe: boolean;
}

export interface ActivityEvent {
  id: string;
  at: number;
  kind: 'created' | 'step' | 'doc' | 'done' | 'reopened' | 'note';
  text: string;
  taskId?: string;
}

export interface AppSettings {
  displayName: string;
  country: string;
  darkMode: 'system' | 'light' | 'dark';
  notificationsEnabled: boolean;
  apiKey: string;
  apiBase: string;
  apiModel: string;
}

export interface AppState {
  tasks: KhTask[];
  docs: VaultDoc[];
  members: FamilyMember[];
  events: ActivityEvent[];
  settings: AppSettings;
  seeded: boolean;
}

export interface Detection {
  category: CategoryId;
  confidence: 'high' | 'medium' | 'low';
  title: string;
  deadline?: string;
  extracted: Record<string, string>;
  questions: Question[];
}

export type Bucket = 'now' | 'soon' | 'waiting' | 'done';

export interface RankedTask {
  task: KhTask;
  bucket: Bucket;
  daysLeft: number | null;
  reason: string;
  score: number;
}

export const PATH_META: Record<PathId, { label: string; hint: string }> = {
  car: { label: 'السيارة', hint: 'رخصة، تأمين، صيانة، مخالفات' },
  home: { label: 'المنزل', hint: 'عقود، مرافق، صيانة، ضمانات' },
  work: { label: 'العمل', hint: 'طلبات، عقود، مواعيد' },
  travel: { label: 'السفر', hint: 'حجز، مستندات، فنادق، تأمين' },
  money: { label: 'الفلوس والفواتير', hint: 'فواتير، مشتريات، إرجاع' },
  docs: { label: 'أوراق ومستندات', hint: 'بطاقة، جواز، طلبات حكومية' },
  family: { label: 'العائلة', hint: 'مهام تخص أفراد الأسرة' },
  other: { label: 'أخرى', hint: 'أي حاجة تانية عايز تخلّصها' },
};

export const CATEGORY_META: Record<CategoryId, { label: string }> = {
  car_license: { label: 'رخصة ومرور' },
  national_id: { label: 'بطاقة رقم قومي' },
  passport: { label: 'جواز سفر' },
  travel: { label: 'سفر ورحلات' },
  move: { label: 'نقل وسكن' },
  bill: { label: 'فاتورة' },
  return: { label: 'إرجاع منتج' },
  warranty: { label: 'ضمان وعطل' },
  purchase: { label: 'عملية شراء' },
  gov_request: { label: 'طلب حكومي' },
  generic: { label: 'مهمة عامة' },
};

export const TRUST_META: Record<TrustLevel, { label: string; hint: string }> = {
  official: { label: 'مصدر رسمي', hint: 'المعلومة من جهة رسمية معلنة' },
  trusted: { label: 'مصدر موثوق', hint: 'معلومة عامة موثوقة لكن راجع التفاصيل' },
  verify: { label: 'تحتاج تحقق', hint: 'راجع الجهة المختصة قبل التنفيذ' },
  danger: { label: 'لا تستخدم دون تحقق', hint: 'معلومة غير مؤكدة — تحقق أولًا' },
};
