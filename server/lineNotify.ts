export interface EmergencyLinePayload {
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

export interface LineNotifyResult {
  ok: boolean;
  sentViaApi: boolean;
  mode: 'push' | 'broadcast' | 'oa_deep_link';
  oaId: string;
  oaDeepLink: string;
  addFriendLink: string;
  formattedMessage: string;
  imageAttachedInApi: boolean;
  apiError?: string;
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

function formatThaiPaymentDate(raw?: string): string {
  const clean = (raw || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) return clean || '-';
  const yearBe = Number(match[1]) + 543;
  return `${match[3]}/${match[2]}/${yearBe}`;
}

export function buildEmergencyPlainMessage(payload: EmergencyLinePayload): string {
  const payerBadge = payload.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน';
  const statusText = mapStatusLabel(payload.emergencyStatus);
  const phone = payload.submitterPhone || payload.payerPhone || '';
  const contactParts = [
    payload.submitterLineId ? `LINE ID: ${payload.submitterLineId}` : '',
    phone ? `โทร: ${phone}` : '',
    payload.submitterEmail ? `อีเมล: ${payload.submitterEmail}` : '',
  ].filter(Boolean);

  const lines = [
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
    `• วันที่จ่ายเงินสด: ${formatThaiPaymentDate(payload.paymentDate)}`,
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
  ].filter(Boolean);

  return lines.join('\n');
}

export async function dispatchEmergencyLineNotification(
  payload: EmergencyLinePayload
): Promise<LineNotifyResult> {
  const oaId = sanitizeLineOaId(payload.oaId);
  const formattedMessage = buildEmergencyPlainMessage(payload);
  const oaDeepLink = `https://line.me/R/oaMessage/${encodeURIComponent(oaId)}/?${encodeURIComponent(formattedMessage)}`;
  const addFriendLink = `https://line.me/R/ti/p/${encodeURIComponent(oaId)}`;

  const accessToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  const targetId = (process.env.LINE_TARGET_ID || '').trim();

  if (!accessToken) {
    return {
      ok: true,
      sentViaApi: false,
      mode: 'oa_deep_link',
      oaId,
      oaDeepLink,
      addFriendLink,
      formattedMessage,
      imageAttachedInApi: false,
    };
  }

  const payerBadge = payload.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน';
  const statusText = mapStatusLabel(payload.emergencyStatus);

  const flexBubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#991B1B',
      paddingAll: '14px',
      contents: [
        {
          type: 'text',
          text: 'แจ้งเตือนเงินสดฉุกเฉิน (สำรองจ่าย)',
          color: '#FEE2E2',
          size: 'xs',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `${payload.voucherNo} · ฿${formatNumber(payload.netPaid)}`,
          color: '#FFFFFF',
          size: 'lg',
          weight: 'bold',
          margin: 'xs',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '14px',
      contents: [
        {
          type: 'text',
          text: `${payerBadge}: ${payload.payerName}`,
          weight: 'bold',
          size: 'sm',
          wrap: true,
          color: '#0F172A',
        },
        ...((payload.submitterLineId || payload.submitterPhone || payload.payerPhone || payload.submitterEmail)
          ? [
              {
                type: 'text',
                text: `ติดต่อกลับ: ${[
                  payload.submitterLineId ? `LINE ${payload.submitterLineId}` : '',
                  (payload.submitterPhone || payload.payerPhone) ? `โทร ${payload.submitterPhone || payload.payerPhone}` : '',
                  payload.submitterEmail || '',
                ].filter(Boolean).join(' · ')}`,
                size: 'xs',
                wrap: true,
                color: '#0369A1',
              },
            ]
          : []),
        {
          type: 'text',
          text: `โครงการ: ${payload.projectName}`,
          size: 'xs',
          wrap: true,
          color: '#475569',
        },
        {
          type: 'separator',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `รายการ: ${payload.description}`,
          size: 'sm',
          wrap: true,
          color: '#1E293B',
          margin: 'sm',
        },
        ...(payload.urgencyReason
          ? [
              {
                type: 'text',
                text: `เหตุผลฉุกเฉิน: ${payload.urgencyReason}`,
                size: 'xs',
                wrap: true,
                color: '#B91C1C',
              },
            ]
          : []),
        {
          type: 'box',
          layout: 'baseline',
          margin: 'md',
          contents: [
            { type: 'text', text: 'วันที่จ่าย', size: 'xs', color: '#64748B', flex: 2 },
            { type: 'text', text: formatThaiPaymentDate(payload.paymentDate), size: 'xs', color: '#0F172A', flex: 3, align: 'end' },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          contents: [
            { type: 'text', text: 'สถานะ', size: 'xs', color: '#64748B', flex: 2 },
            { type: 'text', text: statusText, size: 'xs', weight: 'bold', color: '#1D4ED8', flex: 4, align: 'end', wrap: true },
          ],
        },
      ],
    },
  };

  const messages: Array<Record<string, unknown>> = [
    {
      type: 'flex',
      altText: formattedMessage.slice(0, 380),
      contents: flexBubble,
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

  try {
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
      return {
        ok: true,
        sentViaApi: false,
        mode: 'oa_deep_link',
        oaId,
        oaDeepLink,
        addFriendLink,
        formattedMessage,
        imageAttachedInApi: false,
        apiError: `LINE API ${response.status}: ${errText.slice(0, 180)}`,
      };
    }

    return {
      ok: true,
      sentViaApi: true,
      mode: targetId ? 'push' : 'broadcast',
      oaId,
      oaDeepLink,
      addFriendLink,
      formattedMessage,
      imageAttachedInApi: httpsImages.length > 0,
    };
  } catch (err) {
    return {
      ok: true,
      sentViaApi: false,
      mode: 'oa_deep_link',
      oaId,
      oaDeepLink,
      addFriendLink,
      formattedMessage,
      imageAttachedInApi: false,
      apiError: err instanceof Error ? err.message : 'Network error calling LINE API',
    };
  }
}
