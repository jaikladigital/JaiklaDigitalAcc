interface VercelRequestLike {
  method?: string;
  body?: unknown;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (data: unknown) => void;
}

interface EmergencyLinePayload {
  voucherNo: string;
  payerType: 'employee' | 'supplier';
  payerName: string;
  payerPhone?: string;
  submitterLineId?: string;
  submitterEmail?: string;
  submitterPhone?: string;
  submittedWithoutLogin?: boolean;
  projectName: string;
  vendorOrPayee?: string;
  description: string;
  urgencyReason?: string;
  amount: number;
  vatAmount: number;
  whtAmount: number;
  netPaid: number;
  paymentDate: string;
  emergencyStatus: 'pending_reimburse' | 'approved' | 'reimbursed';
  imageUrl?: string;
  extraPhotoUrl?: string;
  oaId?: string;
  recordedByEmail?: string;
}

function parseBody(raw: unknown): Partial<EmergencyLinePayload> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Partial<EmergencyLinePayload>;
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Partial<EmergencyLinePayload>) : {};
}

function formatNumber(n: number): string {
  const num = Number.isFinite(n) ? n : 0;
  return num.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sanitizeLineOaId(raw?: string): string {
  const cleaned = (raw || '@421khbew').trim();
  if (!cleaned) return '@421khbew';
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

function mapStatusLabel(status: EmergencyLinePayload['emergencyStatus']): string {
  switch (status) {
    case 'approved':
      return 'อนุมัติแล้ว (รอจ่ายคืนเงินสด)';
    case 'reimbursed':
      return 'คืนเงินสดเรียบร้อยแล้ว';
    default:
      return 'รอตรวจสอบและเบิกคืนเงินสด';
  }
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const body = parseBody(req.body);
    if (!body.voucherNo || !body.payerName || !body.description) {
      res.status(400).json({ ok: false, error: 'Missing required emergency cash fields' });
      return;
    }

    const payload: EmergencyLinePayload = {
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
    };

    const oaId = sanitizeLineOaId(payload.oaId);
    const payerBadge = payload.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน';
    const statusText = mapStatusLabel(payload.emergencyStatus);
    const phone = payload.submitterPhone || payload.payerPhone || '';
    const contactParts = [
      payload.submitterLineId ? `LINE ID: ${payload.submitterLineId}` : '',
      phone ? `โทร: ${phone}` : '',
      payload.submitterEmail ? `อีเมล: ${payload.submitterEmail}` : '',
    ].filter(Boolean);

    const formattedMessage = [
      `🚨 แจ้งเตือนเบิกจ่ายเงินสดฉุกเฉิน (${payload.voucherNo})${payload.submittedWithoutLogin ? ' [ส่งด่วนไม่ต้องล็อกอิน]' : ''}`,
      `บริษัท ใจกล้า ดิจิตอล จำกัด`,
      `--------------------------`,
      `• ประเภทผู้สำรองจ่าย: ${payerBadge}`,
      `• ชื่อผู้สำรองจ่าย: ${payload.payerName}`,
      contactParts.length > 0 ? `• ช่องทางติดต่อกลับ: ${contactParts.join(' | ')}` : '',
      `• โครงการ / Event: ${payload.projectName}`,
      payload.vendorOrPayee ? `• ร้านค้า / ผู้รับเงินปลายทาง: ${payload.vendorOrPayee}` : '',
      `• รายการค่าใช้จ่าย: ${payload.description}`,
      payload.urgencyReason ? `• เหตุผลฉุกเฉิน: ${payload.urgencyReason}` : '',
      `• วันที่จ่ายเงินสด: ${payload.paymentDate}`,
      `• ยอดก่อนภาษี: ${formatNumber(payload.amount)} บาท`,
      payload.vatAmount > 0 ? `• VAT: ${formatNumber(payload.vatAmount)} บาท` : '',
      payload.whtAmount > 0 ? `• หัก ณ ที่จ่าย: -${formatNumber(payload.whtAmount)} บาท` : '',
      `• ยอดเบิกคืนสุทธิ: ${formatNumber(payload.netPaid)} บาท`,
      `• สถานะ: ${statusText}`,
      payload.imageUrl && payload.imageUrl.startsWith('https://')
        ? `• รูปใบเสร็จ: ${payload.imageUrl}`
        : payload.imageUrl
          ? `• หลักฐานรูปใบเสร็จ: แนบอยู่ในระบบบัญชีแล้ว (เปิดดูในเมนูเบิกจ่ายฉุกเฉิน)`
          : `• หลักฐานรูปใบเสร็จ: ยังไม่แนบรูป`,
      payload.recordedByEmail
        ? `• บันทึกโดย: ${payload.recordedByEmail}`
        : payload.submittedWithoutLogin
          ? `• ช่องทางส่ง: ฟอร์มด่วนหน้างาน (รออนุมัติในระบบ)`
          : '',
    ]
      .filter(Boolean)
      .join('\n');

    const oaDeepLink = `https://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${encodeURIComponent(formattedMessage)}`;
    const addFriendLink = `https://line.me/R/ti/p/${encodeURIComponent(oaId)}`;

    const accessToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    const targetId = (process.env.LINE_TARGET_ID || '').trim();

    if (!accessToken) {
      res.status(200).json({
        ok: true,
        sentViaApi: false,
        mode: 'oa_deep_link',
        oaId,
        oaDeepLink,
        addFriendLink,
        formattedMessage,
        imageAttachedInApi: false,
      });
      return;
    }

    const messages: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: formattedMessage.slice(0, 4800),
      },
    ];

    const httpsImages = [payload.imageUrl, payload.extraPhotoUrl].filter(
      (u): u is string => Boolean(u && u.startsWith('https://'))
    );
    for (const imgUrl of httpsImages.slice(0, 2)) {
      messages.push({
        type: 'image',
        originalContentUrl: imgUrl,
        previewImageUrl: imgUrl,
      });
    }

    const endpoint = targetId
      ? 'https://api.line.me/v2/bot/message/push'
      : 'https://api.line.me/v2/bot/message/broadcast';
    const requestBody = targetId ? { to: targetId, messages } : { messages };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(200).json({
        ok: true,
        sentViaApi: false,
        mode: 'oa_deep_link',
        oaId,
        oaDeepLink,
        addFriendLink,
        formattedMessage,
        imageAttachedInApi: false,
        apiError: `LINE API ${response.status}: ${errText.slice(0, 180)}`,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      sentViaApi: true,
      mode: targetId ? 'push' : 'broadcast',
      oaId,
      oaDeepLink,
      addFriendLink,
      formattedMessage,
      imageAttachedInApi: httpsImages.length > 0,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to process LINE notification',
    });
  }
}
