// ─── OCR on-device (Tesseract.js, Arabic + English) ────────────────────
import type { Lang } from './i18n';

export async function recognizeText(
  image: string,
  lang: Lang = 'ar',
  onProgress?: (p: number) => void,
): Promise<string> {
  try {
    const { recognize } = await import('tesseract.js');
    const result = await recognize(image, 'ara+eng', {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(m.progress);
      },
    });
    return (result.data.text || '').trim();
  } catch {
    throw new Error(
      lang === 'ar'
        ? 'تعذر قراءة الصورة — تأكد من وضوحها وحاول مجددًا'
        : 'Could not read the image — make sure it is clear and retry',
    );
  }
}
