import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera, Plus, Search, StickyNote, Trash2 } from 'lucide-react';
import type { KhTask, VaultDoc } from '../lib/types';
import { compressDataUrl, fileToDataUrl, timeAgoAr } from '../lib/utils';
import { EmptyState, Sheet } from './ui';

interface VaultProps {
  docs: VaultDoc[];
  tasks: KhTask[];
  onAddPhoto: (name: string, dataUrl: string) => void;
  onAddNote: (text: string) => void;
  onDelete: (id: string) => void;
  onOpenTask: (id: string) => void;
}

export default function Vault({ docs, tasks, onAddPhoto, onAddNote, onDelete, onOpenTask }: VaultProps) {
  const [q, setQ] = useState('');
  const [viewer, setViewer] = useState<VaultDoc | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim();
    const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
    if (!s) return sorted;
    return sorted.filter((d) => d.name.includes(s) || (d.text ?? '').includes(s));
  }, [docs, q]);

  const taskTitle = (id?: string) => tasks.find((t) => t.id === id)?.title;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    const compressed = await compressDataUrl(dataUrl);
    onAddPhoto(f.name.replace(/\.[^.]+$/, '').slice(0, 50) || 'مستند مصور', compressed);
  }

  function saveNote() {
    if (!noteText.trim()) return;
    onAddNote(noteText.trim());
    setNoteText('');
    setNoteOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-5 pb-28">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div>
        <h1 className="text-2xl font-black">الوثائق 🗂️</h1>
        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
          فواتيرك وإيصالاتك وأوراقك — محفوظة على جهازك ({docs.length.toLocaleString('ar-EG')})
        </p>
      </div>

      <div className="relative">
        <Search size={18} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر في الوثائق…"
          className="w-full rounded-2xl border-2 border-black/10 bg-white py-2.5 pr-10 pl-3 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-neutral-900"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-2.5 text-sm font-extrabold text-white"
        >
          <Camera size={17} /> صوّر مستند
        </button>
        <button
          onClick={() => setNoteOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-neutral-800 py-2.5 text-sm font-extrabold text-white dark:bg-white dark:text-neutral-900"
        >
          <StickyNote size={17} /> ملاحظة سريعة
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Camera}
          title={q ? 'مفيش نتيجة للبحث ده' : 'خزنتك فاضية'}
          hint={q ? 'جرّب كلمة تانية.' : 'صوّر أول فاتورة أو إيصال — خَلِّصها هيحفظها ويربطها بمسارها.'}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-neutral-900">
              <button onClick={() => setViewer(d)} className="block w-full text-right">
                {d.kind === 'image' && d.dataUrl ? (
                  <img src={d.dataUrl} alt={d.name} className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 flex-col gap-1 bg-amber-50 p-3 dark:bg-amber-900/20">
                    <StickyNote size={18} className="text-amber-500" />
                    <p className="line-clamp-4 text-xs leading-5 font-bold">{d.text}</p>
                  </div>
                )}
              </button>
              <div className="p-2.5">
                <p className="truncate text-xs font-extrabold">{d.name}</p>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400">{timeAgoAr(d.createdAt)}</span>
                  <button
                    aria-label="حذف"
                    onClick={() => onDelete(d.id)}
                    className="rounded-full p-1 text-neutral-300 transition hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {d.taskId && taskTitle(d.taskId) && (
                  <button
                    onClick={() => d.taskId && onOpenTask(d.taskId)}
                    className="mt-1 w-full truncate rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-extrabold text-brand-700 dark:bg-brand-700/20 dark:text-brand-400"
                  >
                    🔗 {taskTitle(d.taskId)}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* viewer */}
      <Sheet open={viewer !== null} onClose={() => setViewer(null)} title={viewer?.name ?? ''} subtitle={viewer ? timeAgoAr(viewer.createdAt) : ''}>
        {viewer?.kind === 'image' && viewer.dataUrl && <img src={viewer.dataUrl} alt={viewer.name} className="w-full rounded-2xl" />}
        {viewer?.kind === 'note' && <p className="rounded-2xl bg-amber-50 p-3 text-sm leading-7 font-bold whitespace-pre-wrap dark:bg-amber-900/20">{viewer.text}</p>}
        {viewer?.taskId && taskTitle(viewer.taskId) && (
          <button
            onClick={() => {
              const id = viewer.taskId;
              setViewer(null);
              if (id) onOpenTask(id);
            }}
            className="mt-3 w-full rounded-2xl bg-brand-500 py-2.5 text-sm font-extrabold text-white"
          >
            افتح المسار المرتبط
          </button>
        )}
      </Sheet>

      {/* note composer */}
      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="ملاحظة سريعة">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          placeholder="اكتب أي حاجة عايز تحفظها… رقم بلاغ، عنوان، موعد…"
          className="w-full resize-none rounded-2xl border-2 border-black/10 p-3 text-sm font-bold outline-none focus:border-brand-500 dark:border-white/10 dark:bg-white/5"
        />
        <button onClick={saveNote} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-2.5 text-sm font-black text-white">
          <Plus size={16} /> احفظ الملاحظة
        </button>
      </Sheet>

      {/* fab */}
      <button
        onClick={() => fileRef.current?.click()}
        aria-label="إضافة وثيقة"
        className="fixed bottom-24 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl"
      >
        <Plus size={26} />
      </button>

    </div>
  );
}
