import { NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // stay under Vercel's request body limit
const MAX_CHARS = 60000; // protect the model's context window

export async function POST(req: Request) {
  // TODO: add authentication + rate limiting before this goes public

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF too large (max 4 MB)' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== '%PDF-') {
    return NextResponse.json({ error: 'Not a valid PDF' }, { status: 415 });
  }

  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text as string[];

    const full = pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join('\n\n');

    if (full.replace(/\[Page \d+\]/g, '').trim().length < 20) {
      return NextResponse.json(
        { error: 'No readable text found. This looks like a scanned PDF and needs OCR.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      name: file.name,
      pages: totalPages,
      truncated: full.length > MAX_CHARS,
      text: full.slice(0, MAX_CHARS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Espresso PDF error:', msg);
    const isPassword = /password/i.test(msg);
    return NextResponse.json(
      { error: isPassword ? 'PDF is password-protected' : 'Could not read this PDF' },
      { status: isPassword ? 422 : 500 }
    );
  }
}