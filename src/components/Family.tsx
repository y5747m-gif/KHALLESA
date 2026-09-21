import { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Users } from 'lucide-react';
import type { FamilyMember, KhTask } from '../lib/types';
import { daysLeftText } from '../lib/utils';
import { daysUntil } from '../lib/utils';
import { Avatar, Chip, EmptyState, SectionTitle, Sheet } from './ui';

const RELATIONS = ['أب', 'أم', 'أخ', 'أخت', 'زوج', 'زوجة', 'ابن', 'ابنة', 'قريب', 'صديق'];
const COLORS = ['#0ea968', '#7c5cff', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899', '#14b8a6', '#f97316'];

interface FamilyProps {
  members: FamilyMember[];
  tasks: KhTask[];
  onAdd: (name: string, relation: string) => void;
  onRemove: (id: string) => void;
  onOpenTask: (id: string) => void;
}

export default function Family({ members, tasks, onAdd, onRemove, onOpenTask }: FamilyProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('قريب');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [hint, setHint] = useState('');

  function save() {
    if (!name.trim()) {
      setHint('اكتب الاسم الأول.');
      return;
    }
    onAdd(name.trim(), relation);
    setName('');
    setRelation('قريب');
    setHint('');
    setSheetOpen(false);
  }

  function tryRemove(m: FamilyMember) {
    if (m.isMe) {
      setHint('مينفعش تحذف نفسك 😄');
      return;
    }
    const linked = tasks.filter((t) => t.ownerId === m.id || t.assigneeId === m.id);
    if (linked.length > 0) {
      setHint(`مينفعش تحذف ${m.name} — عنده ${linked.length.toLocaleString('ar-EG')} مسارات. انقلها أو احذفها الأول.`);
      return;
    }
    if (confirmId === m.id) {
      onRemove(m.id);
      setConfirmId(null);
      setHint('');
    } else {
      setConfirmId(m.id);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-5 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">العائلة 👨‍👩‍👧‍👦</h1>
          <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
            مش مخطط شخصي… ده نظام تشغيل العيلة كلها
          </p>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          aria-label="إضافة فرد"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg"
        >
          <Plus size={22} />
        </button>
      </div>

      {hint && (
        <div className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {hint}
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState icon={Users} title="مفيش أفراد بعد" hint="ضيف أول فرد من عيلتك." />
      ) : (
        members.map((m) => {
          const about = tasks.filter((t) => t.ownerId === m.id && t.status === 'active');
          const assigned = tasks.filter((t) => t.assigneeId === m.id && t.ownerId !== m.id && t.status === 'active');
          return (
            <div key={m.id} className="rounded-3xl bg-white p-3.5 shadow-sm dark:bg-neutral-900">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} color={m.color} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">
                    {m.name} {m.isMe && <span className="text-xs font-bold text-brand-600">(أنت)</span>}
                  </p>
                  <p className="text-xs font-bold text-neutral-400">{m.relation}</p>
                </div>
                {!m.isMe && (
                  <button
                    onClick={() => tryRemove(m)}
                    className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-extrabold text-red-500 dark:bg-white/10"
                  >
                    {confirmId === m.id ? 'متأكد؟' : <Trash2 size={15} />}
                  </button>
                )}
              </div>

              <div className="mt-2 flex gap-2 text-center">
                <div className="flex-1 rounded-xl bg-black/[0.03] py-1.5 dark:bg-white/5">
                  <p className="text-base font-black">{about.length.toLocaleString('ar-EG')}</p>
                  <p className="text-[11px] font-bold text-neutral-400">مسارات تخصه</p>
                </div>
                <div className="flex-1 rounded-xl bg-black/[0.03] py-1.5 dark:bg-white/5">
                  <p className="text-base font-black">{assigned.length.toLocaleString('ar-EG')}</p>
                  <p className="text-[11px] font-bold text-neutral-400">مسؤول عنها</p>
                </div>
              </div>

              {(about.length > 0 || assigned.length > 0) && (
                <div className="mt-2 space-y-1.5">
                  {[...about.map((t) => ({ t, tag: 'تخصه' })), ...assigned.map((t) => ({ t, tag: 'مسؤول' }))].map(({ t, tag }) => (
                    <button
                      key={t.id + tag}
                      onClick={() => onOpenTask(t.id)}
                      className="flex w-full items-center gap-2 rounded-xl bg-black/[0.03] p-2 text-right dark:bg-white/5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{t.title}</span>
                        <span className="block text-[11px] font-bold text-neutral-400">
                          {tag} • {daysLeftText(daysUntil(t.deadline))}
                        </span>
                      </span>
                      <ChevronLeft size={16} className="shrink-0 text-neutral-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="rounded-2xl bg-violet-50 p-3.5 text-sm font-bold text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
        💡 <b>فكرة:</b> حط رخصة والدك أو فواتير البيت عند أصحابها، وعيّن نفسك "المسؤول" — وخَلِّصها هيتابعك انت.
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="إضافة فرد للعائلة">
        <div className="space-y-3">
          <div>
            <SectionTitle title="الاسم" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: الحاج محمد"
              className="w-full rounded-xl border-2 border-black/10 px-3 py-2.5 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
            />
          </div>
          <div>
            <SectionTitle title="صلة القرابة" />
            <div className="flex flex-wrap gap-2">
              {RELATIONS.map((r) => (
                <Chip key={r} selected={relation === r} onClick={() => setRelation(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/5">
            <Avatar name={name || '?'} color={COLORS[members.length % COLORS.length]} size={36} />
            <p className="text-xs font-bold text-neutral-500">كده هيظهر في كل المسارات والقوائم.</p>
          </div>
          <button onClick={save} className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-black text-white">
            إضافة للعائلة
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function nextMemberColor(count: number): string {
  return COLORS[count % COLORS.length];
}
