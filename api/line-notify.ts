import { dispatchEmergencyLineNotification, EmergencyLinePayload } from '../server/lineNotify';

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

  res.status(200).json(result);
}
