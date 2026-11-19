import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dispatchEmergencyLineNotification, EmergencyLinePayload } from './server/lineNotify.ts';
import { extractReceiptFromImage, ReceiptExtractError } from './server/receiptExtract.ts';
import { DbdLookupError, fetchCompanyFromDbd } from './server/dbdSync.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '40mb' }));

  app.post('/api/extract-receipt', async (req, res) => {
    const body = (req.body || {}) as {
      imageBase64?: string;
      mimeType?: string;
      pages?: Array<{ imageBase64: string; mimeType: string; pageNumber?: number }>;
    };
    const hasPages = Array.isArray(body.pages) && body.pages.length > 0;
    if (!body.imageBase64 && !hasPages) {
      res.status(400).json({ ok: false, error: 'ไม่พบข้อมูลรูปภาพหรือไฟล์เอกสารสำหรับสแกน' });
      return;
    }

    try {
      const data = await extractReceiptFromImage({
        imageBase64: body.imageBase64 ? String(body.imageBase64) : undefined,
        mimeType: body.mimeType ? String(body.mimeType) : 'image/jpeg',
        pages: hasPages
          ? body.pages!.map((p, idx) => ({
              imageBase64: String(p.imageBase64 || ''),
              mimeType: String(p.mimeType || 'image/jpeg'),
              pageNumber: Number(p.pageNumber) || idx + 1,
            }))
          : undefined,
      });
      res.json({ ok: true, data });
    } catch (err) {
      if (err instanceof ReceiptExtractError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'ไม่สามารถสแกนเอกสารได้',
      });
    }
  });

  app.post('/api/line-notify', async (req, res) => {
    const body = (req.body || {}) as Partial<EmergencyLinePayload>;
    if (!body.voucherNo || !body.payerName || !body.description) {
      res.status(400).json({ ok: false, error: 'Missing required emergency cash fields' });
      return;
    }

    const result = await dispatchEmergencyLineNotification({
      voucherNo: String(body.voucherNo),
      payerType: body.payerType === 'supplier' ? 'supplier' : 'employee',
      payerName: String(body.payerName),
      payerPhone: body.payerPhone ? String(body.payerPhone) : undefined,
      submitterLineId: body.submitterLineId ? String(body.submitterLineId) : undefined,
      submitterEmail: body.submitterEmail ? String(body.submitterEmail) : undefined,
      submitterPhone: body.submitterPhone ? String(body.submitterPhone) : undefined,
      submittedWithoutLogin: Boolean(body.submittedWithoutLogin),
      projectName: String(body.projectName || 'ทั่วไป'),
      vendorOrPayee: body.vendorOrPayee ? String(body.vendorOrPayee) : undefined,
      description: String(body.description),
      urgencyReason: body.urgencyReason ? String(body.urgencyReason) : undefined,
      amount: Number(body.amount) || 0,
      vatAmount: Number(body.vatAmount) || 0,
      whtAmount: Number(body.whtAmount) || 0,
      netPaid: Number(body.netPaid) || 0,
      paymentDate: String(body.paymentDate || ''),
      emergencyStatus:
        body.emergencyStatus === 'approved' || body.emergencyStatus === 'reimbursed'
          ? body.emergencyStatus
          : 'pending_reimburse',
      imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
      extraPhotoUrl: body.extraPhotoUrl ? String(body.extraPhotoUrl) : undefined,
      oaId: body.oaId ? String(body.oaId) : '@421khbew',
      recordedByEmail: body.recordedByEmail ? String(body.recordedByEmail) : undefined,
    });

    res.json(result);
  });

  app.get('/api/dbd-lookup', async (req, res) => {
    const taxId = String(req.query.taxId || '0105562067888');
    try {
      const data = await fetchCompanyFromDbd(taxId);
      res.json({ ok: true, data });
    } catch (err) {
      if (err instanceof DbdLookupError) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลจาก DBD ได้',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JAIKLA Digital Accounting Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
