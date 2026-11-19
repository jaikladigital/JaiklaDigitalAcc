import React from 'react';
import { Printer, X } from 'lucide-react';
import { CompanyProfile } from '../types/accounting';
import { formatTHB } from '../utils/formatters';
import {
  computeStatementMetrics,
  LedgerDraft,
} from '../utils/financialStatements';
import { ResponsiveA4Frame } from './ResponsiveA4Frame';

interface FinancialStatementPrintModalProps {
  current: LedgerDraft;
  previous: LedgerDraft;
  company: CompanyProfile;
  onClose: () => void;
}

function fmtAcc(n: number): string {
  if (Math.abs(n) < 0.005) return '-';
  if (n < 0) return `(${formatTHB(Math.abs(n))})`;
  return formatTHB(n);
}

export const FinancialStatementPrintModal: React.FC<FinancialStatementPrintModalProps> = ({
  current,
  previous,
  company,
  onClose,
}) => {
  const cur = computeStatementMetrics(current);
  const prev = computeStatementMetrics(previous);
  const companyName = company.companyNameTh || 'บริษัท ใจกล้า ดิจิตอล จำกัด';

  const footerApprovalBlock = (showAgm = false) => (
    <div className="mt-6 pt-3 text-[11.5px] leading-[1.6] text-slate-800">
      {showAgm && (
        <div>
          งบการเงินฉบับนี้ได้รับการอนุมัติจากที่ประชุมสามัญผู้ถือหุ้นครั้งที่{' '}
          {current.agmMeetingNo || '.......................'} เมื่อวันที่{' '}
          {current.agmDateTh || '.......................'}
        </div>
      )}
      <div>หมายเหตุประกอบงบการเงินเป็นส่วนหนึ่งของงบการเงินนี้</div>
      <div>ขอรับรองว่าถูกต้อง</div>
      <div className="mt-6 text-center w-64 mx-auto">
        <div>ลงชื่อ......................................................กรรมการ</div>
        <div className="mt-0.5">({current.directorName || 'นายสาธิต จันทร์ทนต์'})</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs overflow-y-auto p-3 sm:p-6 flex flex-col items-center">
      <div className="no-print w-full max-w-[210mm] flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm animate-figma-modal">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 m-0 thai-heading">
            ชุดงบการเงินฉบับพิมพ์ (ร่างส่งผู้สอบบัญชี / ยื่น DBD ประจำปี พ.ศ. {current.fiscalYearBe})
          </h3>
          <div className="text-xs text-slate-500 mt-0.5">
            มาตรฐาน TFRS for NPAEs · ประกาศกรมพัฒนาธุรกิจการค้า 27 ต.ค. 2566 · ครบทุกงบและหมายเหตุ 1–8
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="figma-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            พิมพ์ / Save เป็น PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="figma-btn inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
            ปิด
          </button>
        </div>
      </div>

      <div className="w-full max-w-[210mm] space-y-6 print:space-y-0 animate-figma-in">
        <ResponsiveA4Frame>
          <div className="print-only-container space-y-6 print:space-y-0">
            {/* Page 1: Cover */}
            <div className="a4-sheet flex flex-col justify-center items-start px-12">
              <div className="border-t-2 border-slate-900 w-full max-w-md pt-4 pl-6 border-l-[10px] border-l-slate-900 space-y-6 py-4">
                <div className="text-lg font-bold text-slate-900 italic">{companyName}</div>
                <div className="text-lg font-bold text-slate-900 italic">งบการเงิน</div>
                <div className="text-lg font-bold text-slate-900 italic">
                  สำหรับปีสิ้นสุดวันที่ 31 ธันวาคม {current.fiscalYearBe}
                </div>
              </div>
              <div className="mt-16 text-xs text-slate-500 pl-8">
                เลขทะเบียนนิติบุคคล: {current.registrationNumber} · โทรศัพท์: {company.phone || '-'}
              </div>
            </div>

            {/* Page 2: Balance Sheet - Assets */}
            <div className="a4-sheet flex flex-col justify-between text-[12px] leading-[1.6]">
              <div>
                <div className="text-center text-xs text-slate-500 mb-2">-1-</div>
                <div className="text-center font-bold text-[15px] text-slate-900">
                  {companyName}
                </div>
                <div className="text-center font-bold text-[14px] text-slate-900">
                  งบฐานะการเงิน
                </div>
                <div className="text-center font-bold text-[13px] text-slate-800">
                  ณ วันที่ 31 ธันวาคม {current.fiscalYearBe}
                </div>
                <div className="text-right text-[11.5px] font-semibold text-slate-700 mt-1 mb-1">
                  หน่วย : บาท
                </div>

                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="border-t-2 border-b border-slate-900">
                      <th className="py-2 text-left font-bold">สินทรัพย์</th>
                      <th className="py-2 text-center font-bold w-20">หมายเหตุ</th>
                      <th className="py-2 text-right font-bold w-32 font-mono-num">
                        {current.fiscalYearBe}
                      </th>
                      <th className="py-2 text-right font-bold w-32 font-mono-num">
                        {previous.fiscalYearBe}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="pt-3 pb-1 font-bold text-slate-900">
                        สินทรัพย์หมุนเวียน
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-5">เงินสดและรายการเทียบเท่าเงินสด</td>
                      <td className="py-1 text-center font-mono-num">4</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(cur.cashAndEquivalents)}</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(prev.cashAndEquivalents)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-5">ลูกหนี้การค้าและลูกหนี้หมุนเวียนอื่น</td>
                      <td className="py-1 text-center font-mono-num">5</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(cur.receivablesTotal)}</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(prev.receivablesTotal)}</td>
                    </tr>
                    {(cur.workInProgress > 0 || prev.workInProgress > 0) && (
                      <tr>
                        <td className="py-1 pl-5">งานระหว่างทำ</td>
                        <td className="py-1 text-center">-</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.workInProgress)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.workInProgress)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pl-5">สินทรัพย์หมุนเวียนอื่น</td>
                      <td className="py-1 text-center">-</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(cur.otherCurrentAssets)}</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(prev.otherCurrentAssets)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5 pl-10 border-t border-slate-400">รวมสินทรัพย์หมุนเวียน</td>
                      <td className="border-t border-slate-400" />
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(cur.totalCurrentAssets)}
                      </td>
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(prev.totalCurrentAssets)}
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={4} className="pt-4 pb-1 font-bold text-slate-900">
                        สินทรัพย์ไม่หมุนเวียน
                      </td>
                    </tr>
                    {(cur.relatedPartyLoan > 0 || prev.relatedPartyLoan > 0) && (
                      <tr>
                        <td className="py-1 pl-5">เงินให้กู้ยืมระยะยาวแก่บุคคลที่เกี่ยวข้องกัน</td>
                        <td className="py-1 text-center font-mono-num">-</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.relatedPartyLoan)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.relatedPartyLoan)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pl-5">อุปกรณ์ (สุทธิ)</td>
                      <td className="py-1 text-center font-mono-num">6</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(cur.netEquipment)}</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(prev.netEquipment)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5 pl-10 border-t border-slate-400">รวมสินทรัพย์ไม่หมุนเวียน</td>
                      <td className="border-t border-slate-400" />
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(cur.totalNonCurrentAssets)}
                      </td>
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(prev.totalNonCurrentAssets)}
                      </td>
                    </tr>
                    <tr className="font-bold text-slate-900 border-t border-b-4 border-double border-slate-900">
                      <td className="py-2 pl-2">รวมสินทรัพย์</td>
                      <td />
                      <td className="py-2 text-right font-mono-num">{fmtAcc(cur.totalAssets)}</td>
                      <td className="py-2 text-right font-mono-num">{fmtAcc(prev.totalAssets)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {footerApprovalBlock(true)}
            </div>

            {/* Page 3: Balance Sheet - Liabilities & Equity */}
            <div className="a4-sheet flex flex-col justify-between text-[12px] leading-[1.6]">
              <div>
                <div className="text-center text-xs text-slate-500 mb-2">-2-</div>
                <div className="text-center font-bold text-[15px] text-slate-900">{companyName}</div>
                <div className="text-center font-bold text-[14px] text-slate-900">
                  งบฐานะการเงิน (ต่อ)
                </div>
                <div className="text-center font-bold text-[13px] text-slate-800">
                  ณ วันที่ 31 ธันวาคม {current.fiscalYearBe}
                </div>
                <div className="text-right text-[11.5px] font-semibold text-slate-700 mt-1 mb-1">
                  หน่วย : บาท
                </div>

                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="border-t-2 border-b border-slate-900">
                      <th className="py-2 text-left font-bold">หนี้สินและส่วนของผู้ถือหุ้น</th>
                      <th className="py-2 text-center font-bold w-20">หมายเหตุ</th>
                      <th className="py-2 text-right font-bold w-32 font-mono-num">
                        {current.fiscalYearBe}
                      </th>
                      <th className="py-2 text-right font-bold w-32 font-mono-num">
                        {previous.fiscalYearBe}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4} className="pt-3 pb-1 font-bold text-slate-900">
                        หนี้สินหมุนเวียน
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-5">เจ้าหนี้การค้าและเจ้าหนี้หมุนเวียนอื่น</td>
                      <td className="py-1 text-center font-mono-num">7</td>
                      <td className="py-1 text-right font-mono-num">
                        {fmtAcc(cur.tradeAndOtherPayables)}
                      </td>
                      <td className="py-1 text-right font-mono-num">
                        {fmtAcc(prev.tradeAndOtherPayables)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5 pl-10 border-t border-slate-400">รวมหนี้สินหมุนเวียน</td>
                      <td className="border-t border-slate-400" />
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(cur.totalCurrentLiabilities)}
                      </td>
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(prev.totalCurrentLiabilities)}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="py-1.5 pl-5 border-t border-slate-400">รวมหนี้สิน</td>
                      <td className="border-t border-slate-400" />
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(cur.totalLiabilities)}
                      </td>
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(prev.totalLiabilities)}
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={4} className="pt-4 pb-1 font-bold text-slate-900">
                        ส่วนของผู้ถือหุ้น
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-5">ทุนเรือนหุ้น</td>
                      <td />
                      <td />
                      <td />
                    </tr>
                    <tr>
                      <td className="py-1 pl-8 text-[11.5px]">
                        ทุนจดทะเบียน: หุ้นสามัญ {(current.registeredCapitalShares || 10000).toLocaleString()} หุ้น มูลค่าหุ้นละ{' '}
                        {current.parValuePerShare || 100} บาท
                      </td>
                      <td />
                      <td className="py-1 text-right font-mono-num border-b border-slate-400">
                        {fmtAcc(cur.registeredCapitalTotal)}
                      </td>
                      <td className="py-1 text-right font-mono-num border-b border-slate-400">
                        {fmtAcc(prev.registeredCapitalTotal)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-8 text-[11.5px]">
                        ทุนที่ออกและชำระแล้ว: หุ้นสามัญ {(current.registeredCapitalShares || 10000).toLocaleString()} หุ้น มูลค่าหุ้นละ{' '}
                        {current.parValuePerShare || 100} บาท
                      </td>
                      <td />
                      <td className="py-1 text-right font-mono-num">{fmtAcc(cur.paidUpCapital)}</td>
                      <td className="py-1 text-right font-mono-num">{fmtAcc(prev.paidUpCapital)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pl-5">กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร</td>
                      <td />
                      <td className="py-1 text-right font-mono-num">
                        {fmtAcc(cur.retainedEarningsEnding)}
                      </td>
                      <td className="py-1 text-right font-mono-num">
                        {fmtAcc(prev.retainedEarningsEnding)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5 pl-5 border-t border-slate-400">รวมส่วนของผู้ถือหุ้น</td>
                      <td className="border-t border-slate-400" />
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(cur.totalEquity)}
                      </td>
                      <td className="py-1.5 text-right font-mono-num border-t border-slate-400">
                        {fmtAcc(prev.totalEquity)}
                      </td>
                    </tr>
                    <tr className="font-bold text-slate-900 border-t border-b-4 border-double border-slate-900">
                      <td className="py-2 pl-2">รวมหนี้สินและส่วนของผู้ถือหุ้น</td>
                      <td />
                      <td className="py-2 text-right font-mono-num">
                        {fmtAcc(cur.totalLiabilitiesAndEquity)}
                      </td>
                      <td className="py-2 text-right font-mono-num">
                        {fmtAcc(prev.totalLiabilitiesAndEquity)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {footerApprovalBlock(true)}
            </div>

            {/* Page 4: Income Statement & Changes in Equity */}
            <div className="a4-sheet flex flex-col justify-between text-[12px] leading-[1.58]">
              <div className="space-y-6">
                <div>
                  <div className="text-center text-xs text-slate-500 mb-2">-3-</div>
                  <div className="text-center font-bold text-[15px] text-slate-900">{companyName}</div>
                  <div className="text-center font-bold text-[14px] text-slate-900">งบกำไรขาดทุน</div>
                  <div className="text-center font-bold text-[13px] text-slate-800">
                    สำหรับปีสิ้นสุดวันที่ 31 ธันวาคม {current.fiscalYearBe}
                  </div>
                  <div className="text-right text-[11px] font-semibold text-slate-700 mt-1">
                    หน่วย : บาท
                  </div>
                  <table className="w-full border-collapse text-[12px] mt-1">
                    <thead>
                      <tr className="border-t-2 border-b border-slate-900">
                        <th className="py-1.5 text-left font-bold">รายการ</th>
                        <th className="py-1.5 text-right font-bold w-32 font-mono-num">
                          {current.fiscalYearBe}
                        </th>
                        <th className="py-1.5 text-right font-bold w-32 font-mono-num">
                          {previous.fiscalYearBe}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pt-2 font-bold">รายได้</td>
                        <td />
                        <td />
                      </tr>
                      <tr>
                        <td className="py-1 pl-5">รายได้จากการให้บริการ</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.serviceRevenue)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.serviceRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pl-5">รายได้อื่น</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.otherIncome)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.otherIncome)}</td>
                      </tr>
                      <tr className="font-semibold border-t border-slate-400">
                        <td className="py-1 pl-10">รวมรายได้</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.totalRevenue)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.totalRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="pt-2 font-bold">ค่าใช้จ่าย</td>
                        <td />
                        <td />
                      </tr>
                      <tr>
                        <td className="py-1 pl-5">ต้นทุนการให้บริการ</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.costOfServices)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.costOfServices)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pl-5">ค่าใช้จ่ายในการขาย</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.sellingExpenses)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.sellingExpenses)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pl-5">ค่าใช้จ่ายในการบริหาร</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.adminExpenses)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.adminExpenses)}</td>
                      </tr>
                      <tr className="font-semibold border-t border-slate-400">
                        <td className="py-1 pl-10">รวมค่าใช้จ่าย</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.totalExpenses)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.totalExpenses)}</td>
                      </tr>
                      <tr className="border-t border-slate-400">
                        <td className="py-1.5 font-semibold">กำไร (ขาดทุน) ก่อนค่าใช้จ่ายภาษีเงินได้</td>
                        <td className="py-1.5 text-right font-mono-num">{fmtAcc(cur.profitBeforeTax)}</td>
                        <td className="py-1.5 text-right font-mono-num">{fmtAcc(prev.profitBeforeTax)}</td>
                      </tr>
                      <tr>
                        <td className="py-1">ค่าใช้จ่ายภาษีเงินได้</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(cur.incomeTaxExpense)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.incomeTaxExpense)}</td>
                      </tr>
                      <tr className="font-bold border-t border-b-4 border-double border-slate-900">
                        <td className="py-2">กำไร (ขาดทุน) สุทธิ</td>
                        <td className="py-2 text-right font-mono-num">{fmtAcc(cur.netProfitLoss)}</td>
                        <td className="py-2 text-right font-mono-num">{fmtAcc(prev.netProfitLoss)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Changes in Equity */}
                <div>
                  <div className="text-center font-bold text-[13.5px] text-slate-900">
                    งบการเปลี่ยนแปลงส่วนของผู้ถือหุ้น สำหรับปีสิ้นสุดวันที่ 31 ธันวาคม {current.fiscalYearBe}
                  </div>
                  <table className="w-full border-collapse text-[11.5px] mt-2">
                    <thead>
                      <tr className="border-t-2 border-b border-slate-900">
                        <th className="py-1.5 text-left">รายการ</th>
                        <th className="py-1.5 text-right font-mono-num">ทุนที่ออกและชำระแล้ว</th>
                        <th className="py-1.5 text-right font-mono-num">กำไร (ขาดทุน) สะสม</th>
                        <th className="py-1.5 text-right font-mono-num">รวมส่วนของผู้ถือหุ้น</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1">ยอดคงเหลือต้นปี {previous.fiscalYearBe}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.paidUpCapital)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.retainedEarningsOpening)}</td>
                        <td className="py-1 text-right font-mono-num">
                          {fmtAcc(prev.paidUpCapital + prev.retainedEarningsOpening)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">กำไร (ขาดทุน) สุทธิปี {previous.fiscalYearBe}</td>
                        <td className="py-1 text-right font-mono-num">-</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.netProfitLoss)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.netProfitLoss)}</td>
                      </tr>
                      <tr className="font-semibold border-t border-b border-slate-400">
                        <td className="py-1">ยอดคงเหลือปลายปี {previous.fiscalYearBe}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.paidUpCapital)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.retainedEarningsEnding)}</td>
                        <td className="py-1 text-right font-mono-num">{fmtAcc(prev.totalEquity)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pt-2">กำไร (ขาดทุน) สุทธิปี {current.fiscalYearBe}</td>
                        <td className="py-1 pt-2 text-right font-mono-num">-</td>
                        <td className="py-1 pt-2 text-right font-mono-num">{fmtAcc(cur.netProfitLoss)}</td>
                        <td className="py-1 pt-2 text-right font-mono-num">{fmtAcc(cur.netProfitLoss)}</td>
                      </tr>
                      <tr className="font-bold border-t border-b-4 border-double border-slate-900">
                        <td className="py-1.5">ยอดคงเหลือปลายปี {current.fiscalYearBe}</td>
                        <td className="py-1.5 text-right font-mono-num">{fmtAcc(cur.paidUpCapital)}</td>
                        <td className="py-1.5 text-right font-mono-num">{fmtAcc(cur.retainedEarningsEnding)}</td>
                        <td className="py-1.5 text-right font-mono-num">{fmtAcc(cur.totalEquity)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              {footerApprovalBlock(false)}
            </div>

            {/* Page 5: Notes to Financial Statements (1-8) */}
            <div className="a4-sheet flex flex-col justify-between text-[11.5px] leading-[1.58]">
              <div className="space-y-2.5">
                <div className="text-center text-xs text-slate-500">-4-</div>
                <div className="font-bold text-[13.5px] text-slate-900">
                  {companyName} · หมายเหตุประกอบงบการเงิน สำหรับปีสิ้นสุดวันที่ 31 ธันวาคม {current.fiscalYearBe}
                </div>

                <div>
                  <strong>1. ข้อมูลทั่วไป:</strong> {companyName} จดทะเบียนจัดตั้งเมื่อวันที่{' '}
                  {current.registrationDateTh} ทะเบียนนิติบุคคลเลขที่ {current.registrationNumber} สถานประกอบการตั้งอยู่เลขที่{' '}
                  {current.businessAddress} วัตถุประสงค์หลักในการประกอบกิจการให้บริการผลิตสื่อมัลติมีเดีย โฆษณา ประชาสัมพันธ์และให้คำปรึกษาทางการตลาด
                </div>

                <div>
                  <strong>2. เกณฑ์การจัดทำงบการเงิน:</strong> จัดทำตามมาตรฐานการรายงานทางการเงินสำหรับกิจการที่ไม่มีส่วนได้เสียสาธารณะ (TFRS for NPAEs) และประกาศกรมพัฒนาธุรกิจการค้าลงวันที่ 27 ตุลาคม 2566 เรื่อง &ldquo;กำหนดรายการย่อที่ต้องมีในงบการเงิน พ.ศ. 2566&rdquo;
                </div>

                <div>
                  <strong>3. นโยบายการบัญชีที่สำคัญ:</strong> เงินสดและรายการเทียบเท่าเงินสดรับรู้ตามมูลค่าคงเหลือ · ลูกหนี้รับรู้ด้วยมูลค่าตามใบแจ้งหนี้หักค่าเผื่อหนี้สงสัยจะสูญ · อุปกรณ์แสดงราคาทุนหักค่าเสื่อมราคาสะสมวิธีเส้นตรงอายุ 5 ปี (เครื่องมือ 5 ปี, อุปกรณ์สำนักงาน 5 ปี) · รายได้จากการให้บริการบันทึกเมื่อบริการเสร็จสิ้นและส่งมอบผลงาน
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <strong>4. เงินสดและรายการเทียบเท่าเงินสด</strong>
                    <table className="w-full text-[11px] mt-1 border-t border-b border-slate-400">
                      <tbody>
                        <tr>
                          <td className="py-0.5">เงินสด</td>
                          <td className="text-right font-mono-num">{fmtAcc(current.cashOnHand)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(previous.cashOnHand)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5">เงินฝากสถาบันการเงิน</td>
                          <td className="text-right font-mono-num">{fmtAcc(current.cashAtBank)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(previous.cashAtBank)}</td>
                        </tr>
                        <tr className="font-bold border-t border-slate-300">
                          <td className="py-0.5">รวม</td>
                          <td className="text-right font-mono-num">{fmtAcc(cur.cashAndEquivalents)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(prev.cashAndEquivalents)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <strong>5. ลูกหนี้การค้าและลูกหนี้หมุนเวียนอื่น</strong>
                    <table className="w-full text-[11px] mt-1 border-t border-b border-slate-400">
                      <tbody>
                        <tr>
                          <td className="py-0.5">ลูกหนี้การค้า</td>
                          <td className="text-right font-mono-num">{fmtAcc(current.tradeReceivables)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(previous.tradeReceivables)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5">ดอกเบี้ยค้างรับ</td>
                          <td className="text-right font-mono-num">{fmtAcc(current.accruedInterestReceivable)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(previous.accruedInterestReceivable)}</td>
                        </tr>
                        {((current.withholdingTaxAsset || 0) > 0 || (previous.withholdingTaxAsset || 0) > 0) && (
                          <tr>
                            <td className="py-0.5">ภาษีถูกหัก ณ ที่จ่าย</td>
                            <td className="text-right font-mono-num">{fmtAcc(current.withholdingTaxAsset || 0)}</td>
                            <td className="text-right font-mono-num">{fmtAcc(previous.withholdingTaxAsset || 0)}</td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-0.5">ลูกหนี้กรมสรรพากร</td>
                          <td className="text-right font-mono-num">{fmtAcc(current.revenueDeptReceivable)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(previous.revenueDeptReceivable)}</td>
                        </tr>
                        {((current.prepaidExpenses || 0) > 0 || (previous.prepaidExpenses || 0) > 0) && (
                          <tr>
                            <td className="py-0.5">ค่าใช้จ่ายจ่ายล่วงหน้า</td>
                            <td className="text-right font-mono-num">{fmtAcc(current.prepaidExpenses || 0)}</td>
                            <td className="text-right font-mono-num">{fmtAcc(previous.prepaidExpenses || 0)}</td>
                          </tr>
                        )}
                        <tr className="font-bold border-t border-slate-300">
                          <td className="py-0.5">รวม</td>
                          <td className="text-right font-mono-num">{fmtAcc(cur.receivablesTotal)}</td>
                          <td className="text-right font-mono-num">{fmtAcc(prev.receivablesTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <strong>6. อุปกรณ์ (ปี {current.fiscalYearBe}):</strong>
                  <table className="w-full text-[11px] mt-1 border-t border-b border-slate-400">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-600">
                        <th className="py-1 text-left">รายการ</th>
                        <th className="py-1 text-right font-mono-num">ราคาทุน</th>
                        <th className="py-1 text-right font-mono-num">ค่าเสื่อมปีนี้</th>
                        <th className="py-1 text-right font-mono-num">ค่าเสื่อมสะสมปลายปี</th>
                        <th className="py-1 text-right font-mono-num">มูลค่าสุทธิ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-0.5">เครื่องมือ</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.toolsCost)}</td>
                        <td className="text-right font-mono-num">{fmtAcc(current.equipmentToolsDepYear)}</td>
                        <td className="text-right font-mono-num">({fmtAcc(cur.toolsAccumDep)})</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.toolsCost - cur.toolsAccumDep)}</td>
                      </tr>
                      <tr>
                        <td className="py-0.5">อุปกรณ์สำนักงาน</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.officeCost)}</td>
                        <td className="text-right font-mono-num">{fmtAcc(current.equipmentOfficeDepYear)}</td>
                        <td className="text-right font-mono-num">({fmtAcc(cur.officeAccumDep)})</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.officeCost - cur.officeAccumDep)}</td>
                      </tr>
                      <tr className="font-bold border-t border-slate-300">
                        <td className="py-0.5">รวมอุปกรณ์สุทธิ</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.totalEquipmentCost)}</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.totalDepYear)}</td>
                        <td className="text-right font-mono-num">({fmtAcc(cur.totalAccumDep)})</td>
                        <td className="text-right font-mono-num">{fmtAcc(cur.netEquipment)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <strong>7. เจ้าหนี้การค้าและเจ้าหนี้หมุนเวียนอื่น:</strong> รวม{' '}
                  <strong className="font-mono-num">{fmtAcc(cur.tradeAndOtherPayables)}</strong> บาท (ปีก่อน{' '}
                  <span className="font-mono-num">{fmtAcc(prev.tradeAndOtherPayables)}</span> บาท)
                  <span className="text-slate-700">
                    {' '}
                    ประกอบด้วย ค่าใช้จ่ายค้างจ่าย {fmtAcc(current.accruedExpenses)} บ.
                    {(current.unearnedRevenue || 0) > 0 && ` · รายได้รับล่วงหน้า ${fmtAcc(current.unearnedRevenue || 0)} บ.`}
                    {(current.customerDeposits || 0) > 0 && ` · เงินมัดจำรับ ${fmtAcc(current.customerDeposits || 0)} บ.`}
                    {(current.withholdingTaxPayable || 0) > 0 && ` · ภาษีหัก ณ ที่จ่ายค้างจ่าย ${fmtAcc(current.withholdingTaxPayable || 0)} บ.`}
                  </span>
                </div>

                <div>
                  <strong>8. การอนุมัติงบการเงิน:</strong> งบการเงินนี้ได้รับอนุมัติจากกรรมการของบริษัทเพื่อให้ออกงบการเงิน{' '}
                  {current.auditDateTh ? `เมื่อวันที่ ${current.auditDateTh}` : '(ฉบับร่างรอผู้สอบบัญชีรับรอง)'}
                </div>
              </div>
              {footerApprovalBlock(false)}
            </div>
          </div>
        </ResponsiveA4Frame>
      </div>
    </div>
  );
};
