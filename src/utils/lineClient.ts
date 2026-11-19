import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { auth, db } from '../firebase';
import { CompanyProfile, Expense, UrgentExpenseRequest } from '../types/accounting';
import { toastError, toastSuccess } from './swal';

export interface ClientLineNotifyResult {
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmergencyCashLineAlert(
  expense: Expense,
  company: CompanyProfile,
  options?: {
    onOpenVoucherPrint?: (exp: Expense) => void;
    silentIfManual?: boolean;
  }
): Promise<ClientLineNotifyResult | null> {
  const oaId = (company.lineOaId || '@421khbew').trim() || '@421khbew';

  try {
    const res = await fetch('/api/line-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucherNo: expense.emergencyVoucherNo || `ECV-${expense.id.slice(0, 6).toUpperCase()}`,
        payerType: expense.payerType === 'supplier' ? 'supplier' : 'employee',
        payerName: expense.payerName || expense.supplierName,
        payerPhone: expense.payerPhone || '',
        projectName: expense.eventName,
        vendorOrPayee: expense.supplierName,
        description: expense.description,
        urgencyReason: expense.urgencyReason || '',
        amount: expense.amount,
        vatAmount: expense.vatAmount,
        whtAmount: expense.whtAmount,
        netPaid: expense.netPaid,
        paymentDate: expense.paymentDate,
        emergencyStatus: expense.emergencyStatus || 'pending_reimburse',
        imageUrl: expense.receiptUrl || '',
        extraPhotoUrl: expense.extraPhotoUrl || '',
        oaId,
        recordedByEmail: auth.currentUser?.email || '',
      }),
    });

    const data = (await res.json()) as ClientLineNotifyResult;
    const nowIso = new Date().toISOString();

    if (expense.id) {
      try {
        await updateDoc(doc(db, 'expenses', expense.id), {
          lineNotifiedAt: nowIso,
          lineNotifyChannel: data.sentViaApi ? `api_${data.mode}` : 'oa_deep_link',
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr) {
        console.warn('Could not log lineNotifiedAt:', updateErr);
      }
    }

    if (data.sentViaApi) {
      toastSuccess(
        `แจ้งเตือนไปยัง LINE ${data.oaId} เรียบร้อย`,
        data.imageAttachedInApi
          ? 'ส่งข้อมูลใบเบิกเงินสดฉุกเฉินพร้อมรูปภาพใบเสร็จอัตโนมัติแล้ว'
          : 'ส่งข้อมูลใบเบิกเงินสดฉุกเฉินเข้าห้องแชท LINE OA อัตโนมัติแล้ว'
      );
      return data;
    }

    if (options?.silentIfManual) {
      return data;
    }

    const safeMsg = escapeHtml(data.formattedMessage);
    const safeDeepLink = escapeHtml(data.oaDeepLink);
    const safeAddFriendLink = escapeHtml(data.addFriendLink);
    const hasHttpsImage = Boolean(expense.receiptUrl && expense.receiptUrl.startsWith('https://'));

    await Swal.fire({
      title: `ส่งแจ้งเตือนเข้า LINE ${escapeHtml(data.oaId)}`,
      width: 600,
      customClass: { popup: 'jkd-swal-popup' },
      showConfirmButton: false,
      showCloseButton: true,
      html: `
        <div class="text-left space-y-3 text-sm" style="line-height: 1.65;">
          <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            <strong>บันทึกเอกสาร ${escapeHtml(expense.emergencyVoucherNo || '')} และรูปภาพเข้าสู่ระบบแล้ว</strong><br/>
            กดปุ่มสีเขียวด้านล่างเพื่อเปิดแอป LINE OA <strong>${escapeHtml(data.oaId)}</strong> พร้อมข้อความสรุปยอดให้อัตโนมัติ
            ${!hasHttpsImage && expense.receiptUrl ? '<br/><span class="text-amber-700">* หากเปิดส่งผ่านแอป LINE แนะนำกดบันทึกรูปใบเสร็จหรือพิมพ์ใบ A4 แนบส่งในแชทด้วย</span>' : ''}
          </div>
          <pre id="jkd-line-preview" class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans max-h-56 overflow-y-auto">${safeMsg}</pre>
          <div class="flex flex-wrap gap-2 pt-1">
            <a
              href="${safeDeepLink}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-success fw-semibold flex-1 text-white text-center"
              style="background-color:#06C755;border-color:#06C755;"
            >
              ส่งข้อความแจ้งเตือนไปที่ LINE ${escapeHtml(data.oaId)}
            </a>
            <button
              type="button"
              id="jkd-copy-line-btn"
              class="btn btn-outline-secondary fw-semibold"
            >
              คัดลอกข้อความ
            </button>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>ยังไม่ได้เพิ่มเพื่อน OA? <a href="${safeAddFriendLink}" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline">เพิ่มเพื่อน ${escapeHtml(data.oaId)}</a></span>
            ${options?.onOpenVoucherPrint ? '<button type="button" id="jkd-open-voucher-btn" class="text-blue-700 font-semibold underline bg-transparent border-0 p-0 cursor-pointer">เปิดใบเบิก A4 (PDF)</button>' : ''}
          </div>
        </div>
      `,
      didOpen: () => {
        const copyBtn = document.getElementById('jkd-copy-line-btn');
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(data.formattedMessage);
              copyBtn.textContent = 'คัดลอกแล้ว ✓';
            } catch {
              copyBtn.textContent = 'คัดลอกไม่สำเร็จ';
            }
          });
        }
        const printBtn = document.getElementById('jkd-open-voucher-btn');
        if (printBtn && options?.onOpenVoucherPrint) {
          printBtn.addEventListener('click', () => {
            Swal.close();
            options.onOpenVoucherPrint!(expense);
          });
        }
      },
    });

    return data;
  } catch (err) {
    toastError(
      'ไม่สามารถส่งแจ้งเตือน LINE ได้',
      err instanceof Error ? err.message : 'กรุณาลองใหม่อีกครั้ง'
    );
    return null;
  }
}

export async function sendPublicUrgentLineAlert(
  req: UrgentExpenseRequest,
  company: CompanyProfile
): Promise<ClientLineNotifyResult | null> {
  const oaId = (company.lineOaId || '@421khbew').trim() || '@421khbew';

  try {
    const res = await fetch('/api/line-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucherNo: req.voucherNo,
        payerType: req.payerType,
        payerName: req.payerName,
        payerPhone: req.submitterPhone,
        submitterLineId: req.submitterLineId,
        submitterEmail: req.submitterEmail,
        submitterPhone: req.submitterPhone,
        submittedWithoutLogin: true,
        projectName: req.projectName,
        vendorOrPayee: req.vendorName || req.payerName,
        description: req.description,
        urgencyReason: req.urgencyReason || '',
        amount: req.amount,
        vatAmount: req.vatAmount,
        whtAmount: req.whtAmount,
        netPaid: req.netPaid,
        paymentDate: req.paymentDate,
        emergencyStatus: 'pending_reimburse',
        imageUrl: req.receiptUrl || '',
        extraPhotoUrl: req.extraPhotoUrl || '',
        oaId,
      }),
    });
    return (await res.json()) as ClientLineNotifyResult;
  } catch (err) {
    console.warn('Public LINE notify error:', err);
    return null;
  }
}
