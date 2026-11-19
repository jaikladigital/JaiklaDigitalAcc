import { extractReceiptFromImage, ReceiptExtractError } from '../server/receiptExtract';

interface VercelRequestLike {
  method?: string;
  body?: unknown;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (data: unknown) => void;
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  const body = (req.body || {}) as { imageBase64?: string; mimeType?: string };
  if (!body.imageBase64) {
    res.status(400).json({ ok: false, error: 'Missing imageBase64 payload' });
    return;
  }

  try {
    const data = await extractReceiptFromImage({
      imageBase64: String(body.imageBase64),
      mimeType: String(body.mimeType || 'image/jpeg'),
    });
    res.status(200).json({ ok: true, data });
  } catch (err) {
    if (err instanceof ReceiptExtractError) {
      res.status(err.status).json({ ok: false, error: err.message });
      return;
    }
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'ไม่สามารถสแกนรูปใบเสร็จได้',
    });
  }
}
