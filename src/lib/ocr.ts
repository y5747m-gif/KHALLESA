// ─── OCR on-device (Tesseract.js, Arabic + English) ────────────────────
// First run downloads trained data (~few MB) — then works offline.

export async function recognizeText(
  image: string,
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
    throw new Error('تعذر قراءة الصورة — تأكد من وضوحها وحاول مجددًا');
  }
}
