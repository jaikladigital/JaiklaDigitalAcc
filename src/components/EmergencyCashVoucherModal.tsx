import React from 'react';
import { MessageCircle, Printer, X } from 'lucide-react';
import { CompanyProfile, Expense } from '../types/accounting';
import { formatShortDate, formatTHB } from '../utils/formatters';
import { bahtText } from '../utils/thaiBaht';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { JaiklaLogoSVG, JaiklaSignatureSVG, JaiklaStampSVG } from './BrandAssets';
import { ResponsiveA4Frame } from './ResponsiveA4Frame';

interface EmergencyCashVoucherModalProps {
  expense: Expense;
  company: CompanyProfile;
  onClose: () => void;
  onNotifyLine: (expense: Expense) => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_reimburse: {
    label: 'รอตรวจสอบ / รอเบิกคืนเงินสด',
    cls: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  approved: {
    label: 'อนุมัติแล้ว / รอจ่ายเงินสดคืน',
    cls: 'bg-blue-50 text-blue-800 border-blue-300',
  },
  reimbursed: {
    label: 'จ่ายคืนเงินสดเรียบร้อยแล้ว',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
};

export const EmergencyCashVoucherModal: React.FC<EmergencyCashVoucherModalProps> = ({
  expense,
  company,
  onClose,
  onNotifyLine,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const voucherNo = expense.emergencyVoucherNo || `ECV-${expense.id.slice(0, 6).toUpperCase()}`;
  const payerTypeLabel =
    expense.payerType === 'supplier' ? 'ซัพพลายเยอร์ (Supplier)' : 'พนักงานบริษัท (Staff)';
  const statusInfo = STATUS_BADGE[expense.emergencyStatus || 'pending_reimburse'];
  const netBahtText = bahtText(expense.netPaid);
  const hasAnyPhoto = Boolean(expense.receiptUrl || expense.extraPhotoUrl);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-4 md:p-8 flex flex-col items-center">
      {/* Top Toolbar */}
      <div className="no-print w-full max-w-[210mm] flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm animate-figma-modal">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 m-0 thai-heading">
            ใบขอเบิกจ่ายเงินสดฉุกเฉิน / สำรองจ่าย (Emergency Cash Voucher)
          </h3>
          <div className="text-xs text-slate-500 mt-0.5">
            เลขที่: <span className="font-mono-num font-semibold">{voucherNo}</span> · ผู้สำรองจ่าย:{' '}
            {expense.payerName || expense.supplierName}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNotifyLine(expense)}
            className="figma-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white rounded-lg whitespace-nowrap"
            style={{ backgroundColor: '#06C755' }}
          >
            <MessageCircle className="w-4 h-4" />
            แจ้งเตือน LINE {company.lineOaId || '@421khbew'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="figma-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            พิมพ์ / Export PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="figma-btn inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            ปิด
          </button>
        </div>
      </div>

      {/* A4 Voucher Preview */}
      <div className="w-full max-w-[210mm] animate-figma-in">
        <ResponsiveA4Frame>
          <div className="a4-sheet print-only-container">
            <div className="border-2 border-slate-900 p-4 min-h-[268mm] flex flex-col justify-between text-[12px] leading-[1.58]">
              <div>
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 gap-4">
                  <div className="flex items-start gap-3">
                    <JaiklaLogoSVG className="w-16 h-16 shrink-0" logoUrl={company.logoUrl} />
                    <div>
                      <div className="font-bold text-[15px] text-slate-900 leading-[1.45]">
                        {company.companyNameTh}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {company.companyNameEn}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 leading-[1.5]">
                        {formatThaiLineBreaks(company.address)}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono-num">
                        เลขประจำตัวผู้เสียภาษี: {company.taxId} · โทร: {company.phone}
                      </div>
                    </div>
                  </div>

                  <div className="text-center shrink-0">
                    <div className="inline-block px-2.5 py-1 bg-rose-700 text-white text-[11px] font-bold rounded">
                      EMERGENCY CASH VOUCHER
                    </div>
                    <h1 className="text-[16px] font-bold text-slate-900 mt-1.5 mb-0 leading-[1.4] thai-title-center">
                      ใบเบิกจ่ายเงินสดฉุกเฉิน (สำรองจ่าย)
                    </h1>
                    <div className="text-[11.5px] font-mono-num font-bold text-slate-900 mt-0.5">
                      เลขที่: {voucherNo}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono-num">
                      วันที่จ่ายเงินสด: {formatShortDate(expense.paymentDate)}
                    </div>
                  </div>
                </div>

                {/* Payer & Project Details Grid */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="border border-slate-400 rounded p-3 bg-slate-50/50">
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                      ข้อมูลผู้สำรองจ่ายเงินสด (Payee / Claimant)
                    </div>
                    <div className="text-[12.5px] font-bold text-slate-900">
                      {expense.payerName || expense.supplierName}
                    </div>
                    <div className="text-[11.5px] text-slate-700 mt-0.5">
                      สถานะบุคคล: <strong>{payerTypeLabel}</strong>
                    </div>
                    <div className="text-[11.5px] text-slate-700 font-mono-num">
                      เบอร์ติดต่อ: {expense.payerPhone || '-'} · Tax/ID: {expense.supplierTaxId || '-'}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ร้านค้า/ผู้รับเงินปลายทาง: {formatThaiLineBreaks(expense.supplierName)}
                    </div>
                  </div>

                  <div className="border border-slate-400 rounded p-3">
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                      โครงการ / สถานะการเบิกคืน
                    </div>
                    <div className="text-[12.5px] font-bold text-slate-900">
                      {formatThaiLineBreaks(expense.eventName)}
                    </div>
                    <div className="text-[11.5px] text-slate-700 mt-0.5">
                      หมวดหมู่ค่าใช้จ่าย: {expense.categoryName || 'ค่าใช้จ่ายฉุกเฉินหน้างาน'}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10.5px] font-bold rounded border ${statusInfo.cls}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    {expense.lineNotifiedAt && (
                      <div className="text-[10.5px] text-emerald-700 mt-1 font-mono-num">
                        แจ้งเตือน LINE {company.lineOaId || '@421khbew'} แล้ว
                      </div>
                    )}
                  </div>
                </div>

                {/* Urgency Reason Banner */}
                <div className="mt-3 border border-rose-300 bg-rose-50/70 rounded px-3 py-2">
                  <span className="font-bold text-rose-800 text-[11.5px]">
                    เหตุผลความจำเป็นเร่งด่วน (Urgency Reason):{' '}
                  </span>
                  <span className="text-slate-900 text-[11.5px]">
                    {formatThaiLineBreaks(
                      expense.urgencyReason || 'ค่าใช้จ่ายเงินสดฉุกเฉินหน้างานเพื่อให้งานดำเนินต่อได้ทันที'
                    )}
                  </span>
                </div>

                {/* Expense Summary Table */}
                <table className="w-full border-collapse mt-3 text-[11.5px] leading-[1.55]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-2.5 border border-slate-900 text-center w-12">ลำดับ</th>
                      <th className="py-2 px-2.5 border border-slate-900 text-left">
                        รายละเอียดค่าใช้จ่ายเงินสดฉุกเฉิน
                      </th>
                      <th className="py-2 px-2 border border-slate-900 text-center w-24">
                        วันที่จ่าย
                      </th>
                      <th className="py-2 px-2.5 border border-slate-900 text-right w-32">
                        จำนวนเงิน (บาท)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 px-2.5 border border-slate-400 text-center font-mono-num align-top">
                        1
                      </td>
                      <td className="py-3 px-2.5 border border-slate-400 align-top">
                        <div className="font-semibold text-slate-900">
                          {formatThaiLineBreaks(expense.description)}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          ผู้รับเงิน / ร้านค้า: {formatThaiLineBreaks(expense.supplierName)}
                        </div>
                      </td>
                      <td className="py-3 px-2 border border-slate-400 text-center font-mono-num align-top">
                        {formatShortDate(expense.paymentDate)}
                      </td>
                      <td className="py-3 px-2.5 border border-slate-400 text-right font-mono-num align-top">
                        {formatTHB(expense.amount)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-1.5 px-2.5 border border-slate-400 text-right">
                        ภาษีมูลค่าเพิ่ม VAT ({expense.vatRate}%)
                      </td>
                      <td className="py-1.5 px-2.5 border border-slate-400 text-right font-mono-num">
                        {formatTHB(expense.vatAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-1.5 px-2.5 border border-slate-400 text-right">
                        หักภาษี ณ ที่จ่าย WHT ({expense.whtRate}%)
                      </td>
                      <td className="py-1.5 px-2.5 border border-slate-400 text-right font-mono-num text-rose-700">
                        -{formatTHB(expense.whtAmount)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={2} className="py-2 px-2.5 border border-slate-400 text-left">
                        จำนวนเงินสุทธิ (ตัวอักษร):{' '}
                        <span className="text-slate-900">({netBahtText})</span>
                      </td>
                      <td className="py-2 px-2 border border-slate-400 text-right">
                        ยอดเบิกคืนสุทธิ
                      </td>
                      <td className="py-2 px-2.5 border border-slate-400 text-right font-mono-num text-[13px] text-slate-900">
                        ฿{formatTHB(expense.netPaid)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Embedded Receipt & Site Evidence Photos */}
                <div className="mt-3 border border-slate-400 rounded p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-2">
                    หลักฐานรูปภาพใบเสร็จ / ภาพหน้างานประกอบการเบิกเงินสดฉุกเฉิน
                  </div>
                  {hasAnyPhoto ? (
                    <div
                      className={`grid gap-3 ${
                        expense.receiptUrl && expense.extraPhotoUrl ? 'grid-cols-2' : 'grid-cols-1'
                      }`}
                    >
                      {expense.receiptUrl && (
                        <div className="border border-slate-200 rounded p-2 bg-slate-50 text-center">
                          <div className="text-[10px] font-semibold text-slate-500 mb-1">
                            รูปใบเสร็จ / สลิปจ่ายเงินสด
                          </div>
                          <img
                            src={expense.receiptUrl}
                            alt="รูปใบเสร็จฉุกเฉิน"
                            referrerPolicy="no-referrer"
                            className="mx-auto max-h-[68mm] w-auto object-contain rounded"
                          />
                        </div>
                      )}
                      {expense.extraPhotoUrl && (
                        <div className="border border-slate-200 rounded p-2 bg-slate-50 text-center">
                          <div className="text-[10px] font-semibold text-slate-500 mb-1">
                            รูปภาพหน้างาน / สินค้าเพิ่มเติม
                          </div>
                          <img
                            src={expense.extraPhotoUrl}
                            alt="รูปภาพเพิ่มเติม"
                            referrerPolicy="no-referrer"
                            className="mx-auto max-h-[68mm] w-auto object-contain rounded"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11px] border border-dashed border-slate-300 rounded">
                      ยังไม่ได้แนบรูปภาพหลักฐานใบเสร็จ
                    </div>
                  )}
                </div>
              </div>

              {/* 3 Signature Blocks + Stamp */}
              <div className="border-t border-slate-400 pt-4 mt-5 grid grid-cols-3 gap-4 items-end relative">
                <div className="text-center">
                  <div className="h-12 border-b border-slate-500 mb-1" />
                  <div className="font-semibold text-[11px]">ผู้ขอเบิก / ผู้สำรองจ่ายเงินสด</div>
                  <div className="text-[10.5px] text-slate-600">
                    ({expense.payerName || expense.supplierName})
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono-num">
                    วันที่ {formatShortDate(expense.paymentDate)}
                  </div>
                </div>

                <div className="text-center relative">
                  <div className="h-12 flex items-center justify-center relative">
                    <div className="scale-75 origin-center pointer-events-none">
                      <JaiklaSignatureSVG signatureUrl={company.signatureUrl} />
                    </div>
                  </div>
                  <div className="border-t border-slate-500 pt-1 font-semibold text-[11px]">
                    ผู้อนุมัติจ่าย (หัวหน้างาน / ผู้จัดการ)
                  </div>
                  <div className="text-[10.5px] text-slate-600">{company.companyNameTh}</div>
                  <div className="text-[10px] text-slate-500">วันที่ ____/____/______</div>
                </div>

                <div className="text-center relative">
                  <div className="absolute -left-10 -top-6 scale-75 pointer-events-none opacity-85">
                    <JaiklaStampSVG
                      companyNameTh={company.companyNameTh}
                      companyNameEn={company.companyNameEn}
                      stampUrl={company.stampUrl}
                    />
                  </div>
                  <div className="h-12 border-b border-slate-500 mb-1" />
                  <div className="font-semibold text-[11px]">ผู้จ่ายเงินสด / ฝ่ายการเงิน</div>
                  <div className="text-[10.5px] text-slate-600">
                    LINE OA แจ้งเตือน: {company.lineOaId || '@421khbew'}
                  </div>
                  <div className="text-[10px] text-slate-500">วันที่ ____/____/______</div>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveA4Frame>
      </div>
    </div>
  );
};
