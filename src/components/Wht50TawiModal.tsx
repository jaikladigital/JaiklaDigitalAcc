import React from 'react';
import { Printer, X } from 'lucide-react';
import { CompanyProfile, Expense } from '../types/accounting';
import { formatShortDate, formatTHB } from '../utils/formatters';
import { bahtText } from '../utils/thaiBaht';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { JaiklaSignatureSVG, JaiklaStampSVG } from './BrandAssets';
import { ResponsiveA4Frame } from './ResponsiveA4Frame';

interface Wht50TawiModalProps {
  expense: Expense;
  company: CompanyProfile;
  onClose: () => void;
}

export const Wht50TawiModal: React.FC<Wht50TawiModalProps> = ({
  expense,
  company,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const whtText = bahtText(expense.whtAmount);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto p-3 sm:p-4 md:p-8 flex flex-col items-center">
      <div className="no-print w-full max-w-[210mm] flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm animate-figma-modal">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 m-0 thai-heading">
            หนังสือรับรองการหักภาษี ณ ที่จ่าย (มาตรา 50 ทวิ)
          </h3>
          <div className="text-xs text-slate-500 mt-0.5">
            เลขที่เอกสาร: {expense.wht50TawiNo || '50TW-DRAFT'} · ซัพพลายเยอร์:{' '}
            {expense.supplierName}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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

      <div className="w-full max-w-[210mm] animate-figma-in">
        <ResponsiveA4Frame>
          <div className="a4-sheet print-only-container">
            <div className="border-2 border-slate-900 p-4 min-h-[268mm] flex flex-col justify-between text-[12px] leading-[1.58]">
              <div>
                {/* Top 50 Tawi Title */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-2.5 gap-3">
                  <div className="flex-1 text-center">
                    <div className="text-[11px] font-semibold text-slate-600 leading-[1.5]">
                      {formatThaiLineBreaks(
                        'ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)'
                      )}
                    </div>
                    <h1 className="text-[17px] font-bold text-slate-900 mt-1 mb-0 leading-[1.45] thai-title-center">
                      หนังสือรับรองการหักภาษี ณ ที่จ่าย
                    </h1>
                    <div className="text-[11px] text-slate-600">
                      ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-500">เลขที่ / No.</div>
                    <div className="text-[14px] font-bold font-mono-num text-slate-900">
                      {expense.wht50TawiNo || '50TW-DRAFT'}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      วันที่ออก: {formatShortDate(expense.paymentDate)}
                    </div>
                  </div>
                </div>

                {/* Payer Box */}
                <div className="border border-slate-400 rounded p-3 mt-3 bg-slate-50/50">
                  <div className="flex justify-between items-center mb-1 gap-2">
                    <span className="font-bold text-slate-900">
                      ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (Payer):
                    </span>
                    <span className="font-mono-num text-[11.5px]">
                      เลขประจำตัวผู้เสียภาษี: <strong>{company.taxId}</strong>
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-slate-900">
                    {company.companyNameTh}
                  </div>
                  <div className="text-slate-700 text-[11.5px] mt-0.5 leading-[1.55]">
                    {formatThaiLineBreaks(company.address)}
                  </div>
                </div>

                {/* Payee Box */}
                <div className="border border-slate-400 rounded p-3 mt-2.5">
                  <div className="flex justify-between items-center mb-1 gap-2">
                    <span className="font-bold text-slate-900">
                      ผู้ถูกหักภาษี ณ ที่จ่าย (Payee):
                    </span>
                    <span className="font-mono-num text-[11.5px]">
                      เลขประจำตัวผู้เสียภาษี / บัตรประชาชน:{' '}
                      <strong>{expense.supplierTaxId || 'ไม่ระบุ'}</strong>
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-slate-900">
                    {expense.supplierName}
                  </div>
                  <div className="text-slate-700 text-[11.5px] mt-0.5 leading-[1.55]">
                    ที่อยู่: {formatThaiLineBreaks(expense.supplierAddress || '-')}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-200 space-y-1 text-[11px]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold text-slate-800">แบบแสดงรายการ:</span>
                      <span>
                        [{expense.whtFormType === 'PND1' ? ' ✓ ' : '   '}] (1) ภ.ง.ด.1ก
                      </span>
                      <span>[   ] (2) ภ.ง.ด.1ก พิเศษ</span>
                      <span>[   ] (3) ภ.ง.ด.2</span>
                      <span
                        className={
                          expense.whtFormType === 'PND3' ||
                          (!expense.whtFormType && expense.payeeEntityType === 'individual')
                            ? 'font-bold text-slate-900'
                            : 'text-slate-600'
                        }
                      >
                        [
                        {expense.whtFormType === 'PND3' ||
                        (!expense.whtFormType && expense.payeeEntityType === 'individual')
                          ? ' ✓ '
                          : '   '}
                        ] (4) ภ.ง.ด.3 (บุคคลธรรมดา)
                      </span>
                      <span>[   ] (5) ภ.ง.ด.2ก</span>
                      <span>[   ] (6) ภ.ง.ด.3ก</span>
                      <span
                        className={
                          expense.whtFormType === 'PND53' ||
                          (!expense.whtFormType && expense.payeeEntityType !== 'individual')
                            ? 'font-bold text-slate-900'
                            : 'text-slate-600'
                        }
                      >
                        [
                        {expense.whtFormType === 'PND53' ||
                        (!expense.whtFormType && expense.payeeEntityType !== 'individual')
                          ? ' ✓ '
                          : '   '}
                        ] (7) ภ.ง.ด.53 (นิติบุคคล)
                      </span>
                    </div>
                    <div className="text-slate-600">
                      ประเภทผู้รับเงิน:{' '}
                      <strong>
                        {expense.whtFormType === 'PND3' || expense.payeeEntityType === 'individual'
                          ? 'บุคคลธรรมดา / คณะบุคคล (ยื่น ภ.ง.ด. 3)'
                          : 'นิติบุคคล (ยื่น ภ.ง.ด. 53)'}
                      </strong>
                      <span className="mx-2">·</span>
                      <span>โครงการ: {formatThaiLineBreaks(expense.eventName)}</span>
                    </div>
                  </div>
                </div>

                {/* Income & Tax Table */}
                <table className="w-full border-collapse mt-3 text-[11.5px] leading-[1.55]">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-2.5 border border-slate-900 text-left">
                        ประเภทเงินได้พึงประเมินที่จ่าย
                      </th>
                      <th className="py-2 px-2 border border-slate-900 text-center w-28">
                        วัน เดือน ปี ที่จ่าย
                      </th>
                      <th className="py-2 px-2 border border-slate-900 text-right w-32">
                        จำนวนเงินที่จ่าย
                      </th>
                      <th className="py-2 px-2 border border-slate-900 text-center w-20">
                        อัตรา (%)
                      </th>
                      <th className="py-2 px-2.5 border border-slate-900 text-right w-32">
                        ภาษีที่หักและนำส่งไว้
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 px-2.5 border border-slate-400 align-top">
                        <div className="font-semibold text-slate-900">
                          {expense.incomeType50Tawi || 'ค่าจ้างทำของ / ค่าบริการ'}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1">
                          รายละเอียด: {formatThaiLineBreaks(expense.description)}
                        </div>
                        <div className="text-[10.5px] text-slate-500 mt-0.5">
                          หมวดหมู่: {expense.categoryName || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-2 border border-slate-400 text-center font-mono-num align-top">
                        {formatShortDate(expense.paymentDate)}
                      </td>
                      <td className="py-3 px-2 border border-slate-400 text-right font-mono-num align-top">
                        {formatTHB(expense.amount)}
                      </td>
                      <td className="py-3 px-2 border border-slate-400 text-center font-mono-num align-top">
                        {expense.whtRate}%
                      </td>
                      <td className="py-3 px-2.5 border border-slate-400 text-right font-mono-num font-bold align-top">
                        {formatTHB(expense.whtAmount)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={2} className="py-2 px-2.5 border border-slate-400 text-right">
                        รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                      </td>
                      <td className="py-2 px-2 border border-slate-400 text-right font-mono-num">
                        {formatTHB(expense.amount)}
                      </td>
                      <td className="py-2 px-2 border border-slate-400 text-center">-</td>
                      <td className="py-2 px-2.5 border border-slate-400 text-right font-mono-num text-slate-900">
                        {formatTHB(expense.whtAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-2.5 border border-slate-400 rounded px-3 py-2 bg-slate-50">
                  <span className="text-slate-600">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร): </span>
                  <strong className="text-slate-900">({whtText})</strong>
                </div>

                <div className="mt-2.5 border border-slate-300 rounded px-3 py-2 text-[11px] text-slate-700">
                  <strong>ผู้จ่ายเงิน:</strong> [ ✓ ] หัก ณ ที่จ่าย &nbsp;&nbsp; [ &nbsp; ]
                  ออกให้ตลอดไป &nbsp;&nbsp; [ &nbsp; ] ออกให้ครั้งเดียว
                </div>
              </div>

              {/* Official Signature & Stamp */}
              <div className="border-t border-slate-400 pt-4 mt-6 flex justify-between items-end relative">
                <div className="text-[11px] text-slate-600 max-w-[55%] leading-[1.55]">
                  {formatThaiLineBreaks(
                    'ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ'
                  )}
                </div>
                <div className="text-center w-64 relative">
                  <div className="absolute -left-20 -top-6 pointer-events-none">
                    <JaiklaStampSVG
                      companyNameTh={company.companyNameTh}
                      companyNameEn={company.companyNameEn}
                      stampUrl={company.stampUrl}
                    />
                  </div>
                  <JaiklaSignatureSVG signatureUrl={company.signatureUrl} />
                  <div className="border-t border-slate-500 pt-1 mt-1 font-semibold">
                    ลงชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย
                  </div>
                  <div className="text-[10.5px] text-slate-500">
                    วันที่ {formatShortDate(expense.paymentDate)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ResponsiveA4Frame>
      </div>
    </div>
  );
};
