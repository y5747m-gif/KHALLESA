// ─── KHALLESA core types ─────────────────────────────────────────────
// Problem → Action Plan → Execution → Proof (not Task → Reminder)
import type { Lang } from './i18n';

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
  noteEn?: string;
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
  lang: Lang;
  darkMode: 'system' | 'light' | 'dark';
  notificationsEnabled: boolean;
  onboarded: boolean;
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
