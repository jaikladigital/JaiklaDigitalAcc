import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccountingDocument,
  CompanyProfile,
  DEFAULT_COMPANY_LOGO,
  DocumentIssueMode,
} from '../types/accounting';
import { formatShortDate, formatTHB } from '../utils/formatters';
import { bahtText } from '../utils/thaiBaht';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { JaiklaLogoSVG, JaiklaSignatureSVG, JaiklaStampSVG } from './BrandAssets';

interface A4DocumentPreviewProps {
  docData: AccountingDocument;
  company: CompanyProfile;
  onPageCountChange?: (count: number) => void;
}

interface PagePlan {
  pageIndex: number;
  isFirstPage: boolean;
  itemStart: number;
  itemEnd: number; // exclusive
  hasMoreItemsAfter: boolean;
  carriedInSubtotal: number;
  cumulativeSubtotal: number;
  showSummary: boolean;
  showSignature: boolean;
  continuationNotice?: string;
}

interface MeasuredHeights {
  usableH: number;
  page1HeaderH: number;
  contHeaderH: number;
  tableHeadH: number;
  bringForwardH: number;
  carryForwardH: number;
  summaryH: number;
  signatureH: number;
  footerH: number;
  itemHeights: number[];
}

const DOC_TITLES: Record<
  AccountingDocument['type'],
  { th: string; en: string; accent: string }
> = {
  QT: {
    th: 'ใบเสนอราคา',
    en: 'QUOTATION',
    accent: '#0f172a',
  },
  INV: {
    th: 'ใบแจ้งหนี้ / ใบวางบิล / ใบส่งมอบสินค้าและบริการ',
    en: 'INVOICE / BILLING NOTE / DELIVERY',
    accent: '#1e3a8a',
  },
  REC: {
    th: 'ใบเสร็จรับเงิน',
    en: 'RECEIPT',
    accent: '#065f46',
  },
};

const ISSUE_MODE_LABELS: Record<DocumentIssueMode, string> = {
  normal: 'เอกสารปกติ',
  backdated: 'เอกสารแก้ไข / ออกย้อนหลัง',
  advance: 'เอกสารออกล่วงหน้า (Advance Delivery)',
  special: 'เอกสารกรณีพิเศษ (Special Case)',
};

function computePagesFromMeasurements(
  items: AccountingDocument['items'],
  m: MeasuredHeights
): PagePlan[] {
  const usableH = Math.max(880, m.usableH);
  const footerReserve = Math.max(40, m.footerH) + 12;
  const safety = 14;

  const firstPageBodyCap = Math.max(260, usableH - m.page1HeaderH - footerReserve - safety);
  const contPageBodyCap = Math.max(360, usableH - m.contHeaderH - footerReserve - safety);

  const plans: PagePlan[] = [];
  let cursor = 0;
  let runningTotal = 0;
  let pageIndex = 0;

  // 1. Pack table item rows across pages
  while (cursor < items.length || pageIndex === 0) {
    const isFirstPage = pageIndex === 0;
    const cap = isFirstPage ? firstPageBodyCap : contPageBodyCap;
    const tableOverhead =
      m.tableHeadH + (isFirstPage ? 0 : m.bringForwardH + 6) + 14;
    const availForRows = Math.max(120, cap - tableOverhead);

    const start = cursor;
    const carriedIn = runningTotal;
    let usedRowsH = 0;

    while (cursor < items.length) {
      const rowH = m.itemHeights[cursor] || 36;
      const moreRemainAfterThis = cursor + 1 < items.length;
      const effectiveLimit = moreRemainAfterThis
        ? Math.max(80, availForRows - m.carryForwardH - 6)
        : availForRows;

      if (cursor > start && usedRowsH + rowH > effectiveLimit) {
        break;
      }

      usedRowsH += rowH;
      runningTotal += items[cursor].total || 0;
      cursor += 1;

      if (cursor === items.length) {
        break;
      }
    }

    const hasMoreItemsAfter = cursor < items.length;
    plans.push({
      pageIndex,
      isFirstPage,
      itemStart: start,
      itemEnd: cursor,
      hasMoreItemsAfter,
      carriedInSubtotal: carriedIn,
      cumulativeSubtotal: runningTotal,
      showSummary: false,
      showSignature: false,
    });

    pageIndex += 1;
    if (cursor >= items.length) break;
  }

  // 2. Place Summary + Terms + Signature Block cleanly without clipping across page breaks
  const lastPlan = plans[plans.length - 1];
  const lastCap = lastPlan.isFirstPage ? firstPageBodyCap : contPageBodyCap;
  const lastTableOverhead =
    lastPlan.itemEnd > lastPlan.itemStart
      ? m.tableHeadH + (lastPlan.isFirstPage ? 0 : m.bringForwardH + 6) + 14
      : 0;
  let usedOnLast = lastTableOverhead;
  for (let i = lastPlan.itemStart; i < lastPlan.itemEnd; i++) {
    usedOnLast += m.itemHeights[i] || 36;
  }

  const remainingOnLast = lastCap - usedOnLast;
  const bothHeight = m.summaryH + m.signatureH + 14;

  if (bothHeight <= remainingOnLast) {
    lastPlan.showSummary = true;
    lastPlan.showSignature = true;
  } else if (bothHeight <= contPageBodyCap) {
    // Move summary + signature cleanly together onto a new final page
    plans.push({
      pageIndex: plans.length,
      isFirstPage: false,
      itemStart: items.length,
      itemEnd: items.length,
      hasMoreItemsAfter: false,
      carriedInSubtotal: runningTotal,
      cumulativeSubtotal: runningTotal,
      showSummary: true,
      showSignature: true,
    });
  } else if (m.summaryH + 10 <= remainingOnLast) {
    // Summary fits on current page; signature goes to next page
    lastPlan.showSummary = true;
    plans.push({
      pageIndex: plans.length,
      isFirstPage: false,
      itemStart: items.length,
      itemEnd: items.length,
      hasMoreItemsAfter: false,
      carriedInSubtotal: runningTotal,
      cumulativeSubtotal: runningTotal,
      showSummary: false,
      showSignature: true,
    });
  } else {
    // Dedicated page for Summary, followed by Signature page if needed
    plans.push({
      pageIndex: plans.length,
      isFirstPage: false,
      itemStart: items.length,
      itemEnd: items.length,
      hasMoreItemsAfter: false,
      carriedInSubtotal: runningTotal,
      cumulativeSubtotal: runningTotal,
      showSummary: true,
      showSignature: m.summaryH + m.signatureH + 14 <= contPageBodyCap,
    });
    const prev = plans[plans.length - 1];
    if (!prev.showSignature) {
      plans.push({
        pageIndex: plans.length,
        isFirstPage: false,
        itemStart: items.length,
        itemEnd: items.length,
        hasMoreItemsAfter: false,
        carriedInSubtotal: runningTotal,
        cumulativeSubtotal: runningTotal,
        showSummary: false,
        showSignature: true,
      });
    }
  }

  // 3. Assign continuation notices to every non-final page
  const totalPages = plans.length;
  for (let i = 0; i < totalPages; i++) {
    const p = plans[i];
    if (i < totalPages - 1) {
      const nextNum = i + 2;
      if (p.hasMoreItemsAfter) {
        p.continuationNotice = `มีรายการสินค้าและบริการต่อในหน้าถัดไป (หน้า ${nextNum} จาก ${totalPages})`;
      } else if (!p.showSummary) {
        p.continuationNotice = `สิ้นสุดรายการสินค้าและบริการ · มีสรุปยอดชำระ เงื่อนไข และลายเซ็นต่อในหน้าถัดไป (หน้า ${nextNum} จาก ${totalPages})`;
      } else {
        p.continuationNotice = `มีส่วนลงนามรับรองเอกสารต่อในหน้าถัดไป (หน้า ${nextNum} จาก ${totalPages})`;
      }
    }
  }

  return plans;
}

export const A4DocumentPreview: React.FC<A4DocumentPreviewProps> = ({
  docData,
  company,
  onPageCountChange,
}) => {
  const titleMeta = DOC_TITLES[docData.type];
  const wm = docData.watermarkConfig;
  const computedBahtText = docData.thaiBahtText || bahtText(docData.grandTotal);
  const netAfterWht = docData.whtEnabled
    ? Math.max(0, docData.grandTotal - docData.whtAmount)
    : docData.grandTotal;
  const resolvedWatermarkImg = company.watermarkUrl || company.logoUrl || DEFAULT_COMPANY_LOGO;

  const hasSpecialPdfNotice = Boolean(
    docData.showSpecialNoteOnPdf &&
      ((docData.issueMode && docData.issueMode !== 'normal') ||
        (docData.revisionNumber ?? 0) > 0 ||
        docData.specialDeliveryDate ||
        docData.specialCaseReason)
  );

  // Measurement refs for true browser DOM pagination
  const measureUsableBoxRef = useRef<HTMLDivElement | null>(null);
  const measurePage1HeaderRef = useRef<HTMLDivElement | null>(null);
  const measureContHeaderRef = useRef<HTMLDivElement | null>(null);
  const measureTableHeadRef = useRef<HTMLTableSectionElement | null>(null);
  const measureBringForwardRef = useRef<HTMLDivElement | null>(null);
  const measureCarryForwardRef = useRef<HTMLDivElement | null>(null);
  const measureSummaryRef = useRef<HTMLDivElement | null>(null);
  const measureSignatureRef = useRef<HTMLDivElement | null>(null);
  const measureFooterRef = useRef<HTMLDivElement | null>(null);
  const measureRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const [measured, setMeasured] = useState<MeasuredHeights | null>(null);

  useLayoutEffect(() => {
    const measureAll = () => {
      const usableH = measureUsableBoxRef.current?.offsetHeight || 1024;
      const page1HeaderH = measurePage1HeaderRef.current?.offsetHeight || 295;
      const contHeaderH = measureContHeaderRef.current?.offsetHeight || 92;
      const tableHeadH = measureTableHeadRef.current?.offsetHeight || 34;
      const bringForwardH = measureBringForwardRef.current?.offsetHeight || 28;
      const carryForwardH = measureCarryForwardRef.current?.offsetHeight || 42;
      const summaryH = measureSummaryRef.current?.offsetHeight || 260;
      const signatureH = measureSignatureRef.current?.offsetHeight || 135;
      const footerH = measureFooterRef.current?.offsetHeight || 36;
      const itemHeights = docData.items.map((_, idx) => {
        return measureRowRefs.current[idx]?.offsetHeight || 36;
      });

      setMeasured({
        usableH,
        page1HeaderH,
        contHeaderH,
        tableHeadH,
        bringForwardH,
        carryForwardH,
        summaryH,
        signatureH,
        footerH,
        itemHeights,
      });
    };

    measureAll();
    const rafId = requestAnimationFrame(measureAll);
    return () => cancelAnimationFrame(rafId);
  }, [docData, company, hasSpecialPdfNotice]);

  const pages = useMemo<PagePlan[]>(() => {
    const fallback: MeasuredHeights = measured || {
      usableH: 1024,
      page1HeaderH: 300,
      contHeaderH: 94,
      tableHeadH: 36,
      bringForwardH: 28,
      carryForwardH: 44,
      summaryH: 270,
      signatureH: 138,
      footerH: 38,
      itemHeights: docData.items.map((it) => {
        const lines = Math.max(1, (it.description || '').split('\n').length);
        return 24 + lines * 19;
      }),
    };
    return computePagesFromMeasurements(docData.items, fallback);
  }, [docData.items, measured]);

  useLayoutEffect(() => {
    onPageCountChange?.(pages.length);
  }, [pages.length, onPageCountChange]);

  const totalPages = pages.length;

  const renderPage1Header = (pageTotal: number) => (
    <div>
      {/* Top Corporate Header */}
      <div className="flex justify-between items-start gap-4 pb-3 border-b-2 border-slate-900">
        <div className="flex items-start gap-3.5 max-w-[60%]">
          <JaiklaLogoSVG className="w-16 h-16 shrink-0" logoUrl={company.logoUrl} />
          <div>
            <h1 className="text-[16px] font-bold text-slate-900 leading-[1.45] m-0">
              {company.companyNameTh}
            </h1>
            <div className="text-[11px] font-semibold tracking-wide text-slate-700 uppercase mt-0.5 leading-[1.4]">
              {company.companyNameEn}
            </div>
            <p className="text-[11px] text-slate-600 leading-[1.55] mt-1 mb-0">
              {formatThaiLineBreaks(company.address)}
            </p>
            <div className="text-[11px] text-slate-700 mt-0.5 font-mono-num leading-[1.5]">
              เลขประจำตัวผู้เสียภาษี (Tax ID): <strong>{company.taxId}</strong> (
              {company.branch || 'สำนักงานใหญ่'})
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5 leading-[1.5]">
              โทร: {company.phone || '-'} · อีเมล: {company.email || '-'}
            </div>
          </div>
        </div>

        <div className="text-center min-w-[36%]">
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            {pageTotal > 1 && (
              <span className="inline-block px-2 py-1 text-[10px] font-bold border border-slate-300 bg-slate-100 text-slate-700 font-mono-num leading-[1.35]">
                หน้า 1 / {pageTotal}
              </span>
            )}
            <div
              className="inline-block px-2.5 py-1 text-[10.5px] font-bold tracking-wider border leading-[1.35]"
              style={{
                borderColor: titleMeta.accent,
                color: titleMeta.accent,
              }}
            >
              {docData.copyType === 'original' ? 'ต้นฉบับ / ORIGINAL' : 'สำเนา / COPY'}
            </div>
          </div>
          <div
            className="text-[15.5px] font-bold leading-[1.42] thai-title-center"
            style={{ color: titleMeta.accent }}
          >
            {formatThaiLineBreaks(titleMeta.th)}
          </div>
          <div className="text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase leading-[1.35] text-center">
            {titleMeta.en}
          </div>

          <div className="mt-2 border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50/70 text-left text-[11px] leading-[1.55]">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">เลขที่ / No.:</span>
              <span className="font-bold font-mono-num text-slate-900">{docData.docNumber}</span>
            </div>
            <div className="flex justify-between gap-3 mt-0.5">
              <span className="text-slate-500">วันที่ / Date:</span>
              <span className="font-semibold font-mono-num text-slate-800">
                {formatShortDate(docData.docDate)}
              </span>
            </div>
            {docData.dueDate && (
              <div className="flex justify-between gap-3 mt-0.5">
                <span className="text-slate-500">
                  {docData.type === 'QT' ? 'ยืนราคาถึง:' : 'ครบกำหนด:'}
                </span>
                <span className="font-semibold font-mono-num text-slate-800">
                  {formatShortDate(docData.dueDate)}
                </span>
              </div>
            )}
            {docData.refDocNumber && (
              <div className="flex justify-between gap-3 mt-0.5">
                <span className="text-slate-500">อ้างอิง / Ref.:</span>
                <span className="font-semibold font-mono-num text-blue-800">
                  {docData.refDocNumber}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Special / Revision / Advance Delivery Notice (if enabled for PDF) */}
      {hasSpecialPdfNotice && (
        <div className="mt-2 px-3 py-1.5 border border-blue-200 bg-blue-50/70 rounded text-[10.5px] text-slate-800 leading-[1.55] flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong className="text-blue-900">
              {ISSUE_MODE_LABELS[docData.issueMode || 'special']}
            </strong>
            {(docData.revisionNumber ?? 0) > 0 && (
              <span className="font-mono-num"> · แก้ไขครั้งที่ {docData.revisionNumber}</span>
            )}
            {docData.specialDeliveryDate && (
              <span className="font-mono-num">
                {' '}
                · กำหนดส่งมอบเอกสาร: {formatShortDate(docData.specialDeliveryDate)}
              </span>
            )}
          </div>
          {docData.specialCaseReason && (
            <div className="text-slate-700">
              หมายเหตุ: {formatThaiLineBreaks(docData.specialCaseReason)}
            </div>
          )}
        </div>
      )}

      {/* Client & Event/Project Information Grid */}
      <div className="grid grid-cols-12 gap-3 mt-3">
        <div className="col-span-7 border border-slate-300 rounded p-2.5 bg-white">
          <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 leading-[1.45]">
            ข้อมูลลูกค้า / Client Information
          </div>
          <div className="text-[12.5px] font-bold text-slate-900 leading-[1.48]">
            {formatThaiLineBreaks(docData.customerSnapshot.companyName || '-')}
          </div>
          <div className="text-[11px] text-slate-700 mt-0.5 leading-[1.58]">
            ที่อยู่: {formatThaiLineBreaks(docData.customerSnapshot.address || '-')}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-700 leading-[1.52]">
            <div>
              Tax ID:{' '}
              <span className="font-mono-num font-semibold">
                {docData.customerSnapshot.taxId || '-'}
              </span>
            </div>
            <div>สาขา: {docData.customerSnapshot.branch || 'สำนักงานใหญ่'}</div>
            <div>ผู้ติดต่อ: {docData.customerSnapshot.contactName || '-'}</div>
            <div>
              โทร: <span className="font-mono-num">{docData.customerSnapshot.phone || '-'}</span>
            </div>
          </div>
        </div>

        <div className="col-span-5 border border-slate-300 rounded p-2.5 bg-slate-50/60 flex flex-col justify-between">
          <div>
            <div className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider mb-1 leading-[1.45]">
              รายละเอียดโครงการ / Event Details
            </div>
            <div className="text-[12px] font-bold text-slate-900 leading-[1.5]">
              Event Name: {formatThaiLineBreaks(docData.eventName || '-')}
            </div>
            <div className="text-[11px] text-slate-700 mt-1 leading-[1.52]">
              Duration / ระยะเวลา:{' '}
              <span className="font-medium">
                {formatThaiLineBreaks(docData.durationText || '-')}
              </span>
            </div>
          </div>

          {docData.installmentInfo?.isInstallment && (
            <div className="mt-2 pt-1.5 border-t border-slate-200 text-[11px] font-bold text-blue-900 leading-[1.5]">
              งวดชำระ: งวดที่ {docData.installmentInfo.currentPeriod} จาก{' '}
              {docData.installmentInfo.totalPeriods} งวด ({docData.installmentInfo.percentage}%)
              {docData.installmentInfo.label
                ? ` — ${formatThaiLineBreaks(docData.installmentInfo.label)}`
                : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderContinuationHeader = (pageNumber: number, pageTotal: number) => (
    <div className="pb-2.5 border-b-2 border-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <JaiklaLogoSVG className="w-10 h-10 shrink-0" logoUrl={company.logoUrl} />
          <div>
            <div className="text-[13px] font-bold text-slate-900 leading-[1.4]">
              {company.companyNameTh}
            </div>
            <div className="text-[10px] text-slate-600 font-mono-num leading-[1.4]">
              Tax ID: {company.taxId} ({company.branch || 'สำนักงานใหญ่'})
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span
              className="text-[12.5px] font-bold leading-[1.4]"
              style={{ color: titleMeta.accent }}
            >
              {formatThaiLineBreaks(titleMeta.th)} (ต่อจากหน้า {pageNumber - 1})
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold border border-slate-400 bg-slate-100 text-slate-900 font-mono-num">
              หน้า {pageNumber} / {pageTotal}
            </span>
          </div>
          <div className="text-[10.5px] text-slate-700 font-mono-num mt-0.5 leading-[1.45]">
            เลขที่: <strong>{docData.docNumber}</strong> · วันที่: {formatShortDate(docData.docDate)} ·
            ฉบับ: {docData.copyType === 'original' ? 'ต้นฉบับ' : 'สำเนา'}
          </div>
        </div>
      </div>

      <div className="mt-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-700 leading-[1.45]">
        <span>
          <strong>ลูกค้า:</strong>{' '}
          {formatThaiLineBreaks(docData.customerSnapshot.companyName || '-')}
        </span>
        <span>
          <strong>โครงการ / Event:</strong> {formatThaiLineBreaks(docData.eventName || '-')}
        </span>
      </div>
    </div>
  );

  const renderTableHeadRow = () => (
    <tr className="bg-slate-900 text-white">
      <th className="py-2 px-2 text-center border border-slate-900 w-10">ลำดับ</th>
      <th className="py-2 px-2.5 text-left border border-slate-900">
        รายการสินค้าและบริการ / Description
      </th>
      <th className="py-2 px-2 text-right border border-slate-900 w-16">จำนวน</th>
      <th className="py-2 px-2 text-center border border-slate-900 w-16">หน่วย</th>
      <th className="py-2 px-2 text-right border border-slate-900 w-24">ราคา/หน่วย</th>
      <th className="py-2 px-2 text-right border border-slate-900 w-20">ส่วนลด</th>
      <th className="py-2 px-2.5 text-right border border-slate-900 w-28">
        จำนวนเงิน (บาท)
      </th>
    </tr>
  );

  const renderSummarySection = () => (
    <div>
      {/* Summary & Thai Baht Text */}
      <div className="grid grid-cols-12 gap-3 mt-2.5 items-stretch">
        <div className="col-span-7 flex flex-col justify-between gap-2">
          <div className="border border-slate-300 rounded px-3 py-2 bg-slate-50">
            <div className="text-[10.5px] font-semibold text-slate-500 leading-[1.45]">
              จำนวนเงินรวมทั้งสิ้น (ตัวอักษร) / Total Amount in Words
            </div>
            <div className="text-[12.5px] font-bold text-slate-900 mt-0.5 leading-[1.5]">
              ({computedBahtText})
            </div>
          </div>

          {/* Red Remarks Box for QT or Notes */}
          {docData.notesRed && (
            <div className="border border-red-300 bg-red-50/70 rounded px-3 py-2 text-[11px] text-red-700 leading-[1.58]">
              <div className="font-bold text-red-800 mb-0.5">หมายเหตุสำคัญ / Remarks:</div>
              <div className="whitespace-pre-line">{formatThaiLineBreaks(docData.notesRed)}</div>
            </div>
          )}

          {/* SCB Bank Transfer Box (Shown for INV and QT) */}
          {(docData.type === 'INV' || docData.type === 'QT') && (
            <div className="border border-slate-300 rounded px-3 py-2 bg-white text-[11px] leading-[1.55]">
              <div className="font-bold text-slate-900 mb-0.5">
                ข้อมูลการชำระเงิน / Payment Information
              </div>
              <div className="text-slate-700">
                {company.bankName || 'ธนาคารไทยพาณิชย์ (SCB)'} · เลขที่บัญชี:{' '}
                <span className="font-mono-num font-bold text-slate-900">
                  {company.bankAccountNo}
                </span>
              </div>
              <div className="text-slate-700">
                ชื่อบัญชี: <strong>{company.bankAccountName || company.companyNameTh}</strong>
              </div>

              {docData.type === 'INV' && (
                <div className="flex flex-wrap items-center gap-3 mt-1.5 pt-1.5 border-t border-slate-200 text-[10.5px]">
                  <span>วิธีชำระเงิน:</span>
                  <label className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border border-slate-600 text-center leading-[10px] text-[9px]">
                      {docData.paymentMethod === 'transfer' ? '✓' : ''}
                    </span>
                    โอนเงิน
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border border-slate-600 text-center leading-[10px] text-[9px]">
                      {docData.paymentMethod === 'cheque' ? '✓' : ''}
                    </span>
                    เช็คสั่งจ่าย
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 border border-slate-600 text-center leading-[10px] text-[9px]">
                      {docData.paymentMethod === 'cash' ? '✓' : ''}
                    </span>
                    เงินสด
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Receipt Payment Confirmation Box */}
          {docData.type === 'REC' && (
            <div className="border border-emerald-300 bg-emerald-50/40 rounded px-3 py-2 text-[11px] leading-[1.55]">
              <div className="font-bold text-emerald-900 mb-1">
                รายละเอียดการรับชำระเงิน / Payment Received Details
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-800">
                <span>
                  ชำระโดย:{' '}
                  <strong>
                    {docData.paymentMethod === 'transfer'
                      ? 'โอนเงินเข้าบัญชี (Bank Transfer)'
                      : docData.paymentMethod === 'cheque'
                        ? 'เช็ค (Cheque)'
                        : docData.paymentMethod === 'cash'
                          ? 'เงินสด (Cash)'
                          : 'อื่นๆ'}
                  </strong>
                </span>
                {docData.paymentBank && <span>ธนาคาร: {docData.paymentBank}</span>}
                {docData.paymentChequeNo && (
                  <span>เลขที่อ้างอิง/เช็ค: {docData.paymentChequeNo}</span>
                )}
                {docData.paymentDate && (
                  <span>วันที่รับเงิน: {formatShortDate(docData.paymentDate)}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Numeric Tax Breakdown Table */}
        <div className="col-span-5 border border-slate-300 rounded overflow-hidden flex flex-col justify-between">
          <table className="w-full text-[11.5px] border-collapse leading-[1.52]">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-1.5 px-2.5 text-slate-600">รวมเป็นเงิน (Subtotal)</td>
                <td className="py-1.5 px-2.5 text-right font-mono-num font-semibold">
                  {formatTHB(docData.subtotal)}
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-1.5 px-2.5 text-slate-600">
                  ภาษีมูลค่าเพิ่ม {docData.vatEnabled ? `${docData.vatRate}%` : '(ไม่คิด VAT)'}
                </td>
                <td className="py-1.5 px-2.5 text-right font-mono-num">
                  {docData.vatEnabled ? formatTHB(docData.vatAmount) : '0.00'}
                </td>
              </tr>
              <tr className="bg-slate-900 text-white font-bold">
                <td className="py-2 px-2.5">จำนวนเงินรวมทั้งสิ้น (Grand Total)</td>
                <td className="py-2 px-2.5 text-right font-mono-num text-[12.5px]">
                  {formatTHB(docData.grandTotal)}
                </td>
              </tr>
              {docData.whtEnabled && (
                <>
                  <tr className="border-b border-slate-200 bg-amber-50/70">
                    <td className="py-1.5 px-2.5 text-amber-900">
                      หัก ณ ที่จ่าย {docData.whtRate}% (WHT)
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono-num text-amber-900 font-semibold">
                      -{formatTHB(docData.whtAmount)}
                    </td>
                  </tr>
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td className="py-1.5 px-2.5">ยอดสุทธิที่ต้องชำระ (Net Payable)</td>
                    <td className="py-1.5 px-2.5 text-right font-mono-num">
                      {formatTHB(netAfterWht)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terms / Contract Agreement */}
      {docData.termsText && (
        <div className="mt-2.5 border border-slate-200 rounded px-3 py-2 text-[10.5px] text-slate-700 leading-[1.6] bg-slate-50/40">
          <div className="font-bold text-slate-800 mb-0.5">
            เงื่อนไขและข้อตกลง / Terms &amp; Conditions
          </div>
          <div className="whitespace-pre-line">{formatThaiLineBreaks(docData.termsText)}</div>
        </div>
      )}
    </div>
  );

  const renderSignatureSection = () => (
    <div className="mt-3 pt-3 border-t border-slate-300 relative">
      {docData.showStamp && (
        <div className="absolute right-12 -top-8 pointer-events-none">
          <JaiklaStampSVG
            companyNameTh={company.companyNameTh}
            companyNameEn={company.companyNameEn}
            stampUrl={company.stampUrl}
          />
        </div>
      )}

      {docData.type === 'REC' ? (
        <div className="grid grid-cols-3 gap-4 text-center text-[11px] leading-[1.5]">
          <div className="border border-slate-200 rounded p-2.5">
            <div className="h-12 flex items-end justify-center">
              {docData.showSignature && <JaiklaSignatureSVG signatureUrl={company.signatureUrl} />}
            </div>
            <div className="border-t border-slate-400 mt-1 pt-1 font-semibold">
              ผู้รับเงิน / Collector
            </div>
            <div className="text-slate-500 text-[10px] mt-0.5">วันที่ ____/____/______</div>
          </div>
          <div className="border border-slate-200 rounded p-2.5">
            <div className="h-12 flex items-end justify-center">
              {docData.showSignature && <JaiklaSignatureSVG signatureUrl={company.signatureUrl} />}
            </div>
            <div className="border-t border-slate-400 mt-1 pt-1 font-semibold">
              ผู้มีอำนาจลงนาม / Authorized Signature
            </div>
            <div className="text-slate-500 text-[10px] mt-0.5">{company.companyNameTh}</div>
          </div>
          <div className="border border-slate-200 rounded p-2.5">
            <div className="h-12" />
            <div className="border-t border-slate-400 mt-1 pt-1 font-semibold">
              ผู้จ่ายเงิน / Client
            </div>
            <div className="text-slate-500 text-[10px] mt-0.5">วันที่ ____/____/______</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 text-center text-[11px] leading-[1.5]">
          <div className="border border-slate-200 rounded p-2.5">
            <div className="text-[10.5px] text-slate-500 mb-1">
              {docData.type === 'QT'
                ? 'ในนามผู้ตกลงจ้าง / Accepted by Client'
                : 'ผู้รับวางบิล / ผู้รับสินค้า (Received By)'}
            </div>
            <div className="h-12" />
            <div className="border-t border-slate-400 mt-1 pt-1 font-semibold">
              ( .................................................. )
            </div>
            <div className="text-slate-500 text-[10px] mt-0.5">
              วันที่ / Date: ______/______/__________
            </div>
          </div>
          <div className="border border-slate-200 rounded p-2.5">
            <div className="text-[10.5px] text-slate-500 mb-1">
              ในนาม {company.companyNameTh}
            </div>
            <div className="h-12 flex items-end justify-center">
              {docData.showSignature && <JaiklaSignatureSVG signatureUrl={company.signatureUrl} />}
            </div>
            <div className="border-t border-slate-400 mt-1 pt-1 font-semibold">
              ผู้มีอำนาจลงนาม / Authorized Signature
            </div>
            <div className="text-slate-500 text-[10px] mt-0.5">
              วันที่ / Date: {formatShortDate(docData.docDate)}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPageFooter = (pageNumber: number, pageTotal: number, isLastPage: boolean) => (
    <div className="mt-2 pt-1.5 border-t border-slate-300 flex items-center justify-between gap-2 text-[10px] text-slate-500 leading-[1.45]">
      <span className="truncate max-w-[38%]">
        {company.companyNameTh} · {docData.docNumber}
      </span>
      <span className="font-mono-num font-bold text-slate-800 whitespace-nowrap">
        หน้า {pageNumber} จาก {pageTotal} (Page {pageNumber} of {pageTotal})
      </span>
      <span className="font-semibold whitespace-nowrap text-right">
        {isLastPage ? (
          <span className="text-slate-600">— สิ้นสุดเอกสาร (End of Document) —</span>
        ) : (
          <span className="text-blue-800">
            มีต่อหน้าถัดไป (หน้า {pageNumber + 1}/{pageTotal}) →
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className="relative">
      {/* Offscreen Measurement Mirror (Exact 182mm printable width & A4 typography) */}
      <div
        aria-hidden="true"
        className="no-print a4-sheet"
        style={{
          position: 'fixed',
          left: '-100000px',
          top: 0,
          width: '210mm',
          height: 'auto',
          minHeight: 'auto',
          visibility: 'hidden',
          pointerEvents: 'none',
          boxShadow: 'none',
        }}
      >
        <div ref={measureUsableBoxRef} style={{ height: '271mm', position: 'absolute', width: '1px' }} />
        <div ref={measurePage1HeaderRef}>{renderPage1Header(2)}</div>
        <div ref={measureContHeaderRef}>{renderContinuationHeader(2, 2)}</div>
        <div ref={measureBringForwardRef}>
          <div className="px-2.5 py-1 bg-slate-100 border border-b-0 border-slate-300 text-[10.5px] font-semibold text-slate-700 flex justify-between">
            <span>รายการต่อจากหน้า 1 (Continued from Page 1)</span>
            <span className="font-mono-num">ยอดยกมา: ฿0.00</span>
          </div>
        </div>
        <table className="w-full border-collapse text-[11.5px] leading-[1.55]">
          <thead ref={measureTableHeadRef}>{renderTableHeadRow()}</thead>
          <tbody>
            {docData.items.map((item, idx) => (
              <tr
                key={idx}
                ref={(el) => {
                  measureRowRefs.current[idx] = el;
                }}
              >
                <td className="py-2 px-2 text-center border border-slate-300 font-mono-num align-top w-10">
                  {idx + 1}
                </td>
                <td className="py-2 px-2.5 border border-slate-300 whitespace-pre-line leading-[1.58]">
                  {formatThaiLineBreaks(item.description)}
                </td>
                <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-16">
                  {item.qty}
                </td>
                <td className="py-2 px-2 text-center border border-slate-300 align-top w-16">
                  {item.unit || 'งาน'}
                </td>
                <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-24">
                  {formatTHB(item.unitPrice)}
                </td>
                <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-20">
                  {item.discount > 0 ? formatTHB(item.discount) : '-'}
                </td>
                <td className="py-2 px-2.5 text-right border border-slate-300 font-mono-num font-semibold align-top w-28">
                  {formatTHB(item.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={measureCarryForwardRef}>
          <div className="mt-1.5 px-3 py-1.5 border border-slate-300 bg-slate-50 rounded text-[10.5px] font-semibold flex justify-between">
            <span>มีรายการต่อในหน้าถัดไป (หน้า 2 จาก 2)</span>
            <span className="font-mono-num">ยอดยกไป: ฿0.00</span>
          </div>
        </div>
        <div ref={measureSummaryRef}>{renderSummarySection()}</div>
        <div ref={measureSignatureRef}>{renderSignatureSection()}</div>
        <div ref={measureFooterRef}>{renderPageFooter(1, 2, false)}</div>
      </div>

      {/* Multi-Page Indicator Strip Before Printing (Screen Only) */}
      {totalPages > 1 && (
        <div className="no-print mb-3 px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50/80 text-xs text-blue-950 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>ตรวจสอบเอกสารหลายหน้าก่อนพิมพ์จริง:</strong> เอกสารชุดนี้แบ่งจัดวางขนาด A4
            ทั้งหมด <strong className="font-mono-num">{totalPages}</strong> หน้า
            (ดึงหัวข้อตารางไปเริ่มใหม่ทุกหน้า พร้อมเลขหน้าและแจ้งเตือนต่อหน้าถัดไปอัตโนมัติ)
          </span>
        </div>
      )}

      {/* Paginated A4 Sheets (Rendered 1-to-1 for Preview & Print PDF) */}
      <div className="a4-pages-stack print-only-container" id="a4-print-sheet">
        {pages.map((page, idx) => {
          const pageNumber = idx + 1;
          const isLastPage = pageNumber === totalPages;
          const pageItems = docData.items.slice(page.itemStart, page.itemEnd);

          return (
            <div key={pageNumber} className="relative">
              {totalPages > 1 && (
                <div className="no-print text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center justify-between px-1">
                  <span>
                    แผ่นที่ {pageNumber} / {totalPages}
                  </span>
                  <span>
                    {page.isFirstPage
                      ? 'หน้าแรก — ข้อมูลหลักและรายการ'
                      : pageItems.length > 0
                        ? `หน้าต่อเนื่อง — ดึงหัวตารางเริ่มใหม่ (รายการที่ ${page.itemStart + 1}–${page.itemEnd})`
                        : 'หน้าสุดท้าย — สรุปยอดและลงนาม'}
                  </span>
                </div>
              )}

              <div className="a4-sheet a4-sheet-paginated">
                {/* Watermark Layer on Every Page */}
                {wm?.enabled && (
                  <div className="a4-watermark-layer">
                    {wm.mode === 'image' && resolvedWatermarkImg ? (
                      <img
                        src={resolvedWatermarkImg}
                        alt="Watermark"
                        referrerPolicy="no-referrer"
                        style={{
                          opacity: wm.opacity ?? 0.1,
                          transform: `rotate(${wm.angle ?? -30}deg)`,
                          maxWidth: '115mm',
                          maxHeight: '115mm',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <div
                        className="a4-watermark-text"
                        style={{
                          opacity: wm.opacity ?? 0.08,
                          transform: `rotate(${wm.angle ?? -32}deg)`,
                        }}
                      >
                        {wm.text || company.companyNameEn}
                      </div>
                    )}
                  </div>
                )}

                {/* Page Content Bounded Within Exact A4 Margins */}
                <div className="a4-content-layer h-full flex flex-col justify-between">
                  <div>
                    {page.isFirstPage
                      ? renderPage1Header(totalPages)
                      : renderContinuationHeader(pageNumber, totalPages)}

                    {/* Line Items Table (With Repeating Header on Page 2+) */}
                    {pageItems.length > 0 && (
                      <div className="mt-3">
                        {!page.isFirstPage && (
                          <div className="px-2.5 py-1 bg-slate-100 border border-b-0 border-slate-300 text-[10.5px] font-semibold text-slate-700 flex items-center justify-between leading-[1.45]">
                            <span>
                              รายการสินค้าและบริการ (ต่อจากหน้า {pageNumber - 1})
                            </span>
                            <span className="font-mono-num text-slate-900">
                              ยอดยกมาจากหน้าก่อนหน้า: ฿{formatTHB(page.carriedInSubtotal)}
                            </span>
                          </div>
                        )}

                        <table className="w-full border-collapse text-[11.5px] leading-[1.55]">
                          <thead>{renderTableHeadRow()}</thead>
                          <tbody>
                            {pageItems.map((item, localIdx) => {
                              const globalIdx = page.itemStart + localIdx;
                              return (
                                <tr
                                  key={globalIdx}
                                  className={globalIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                                >
                                  <td className="py-2 px-2 text-center border border-slate-300 font-mono-num align-top w-10">
                                    {globalIdx + 1}
                                  </td>
                                  <td className="py-2 px-2.5 border border-slate-300 whitespace-pre-line leading-[1.58]">
                                    {formatThaiLineBreaks(item.description)}
                                  </td>
                                  <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-16">
                                    {item.qty}
                                  </td>
                                  <td className="py-2 px-2 text-center border border-slate-300 align-top w-16">
                                    {item.unit || 'งาน'}
                                  </td>
                                  <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-24">
                                    {formatTHB(item.unitPrice)}
                                  </td>
                                  <td className="py-2 px-2 text-right border border-slate-300 font-mono-num align-top w-20">
                                    {item.discount > 0 ? formatTHB(item.discount) : '-'}
                                  </td>
                                  <td className="py-2 px-2.5 text-right border border-slate-300 font-mono-num font-semibold align-top w-28">
                                    {formatTHB(item.total)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Carried-Forward Total Strip if table continues to next page */}
                        {page.hasMoreItemsAfter && (
                          <div className="px-2.5 py-1 bg-slate-100 border border-t-0 border-slate-300 text-[10.5px] font-semibold text-slate-800 flex items-center justify-between leading-[1.45]">
                            <span>ยอดรวมสะสมยกไปหน้าถัดไป (Carried Forward)</span>
                            <span className="font-mono-num">
                              ฿{formatTHB(page.cumulativeSubtotal)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dedication Strip on Overflow Summary/Signature Page */}
                    {pageItems.length === 0 && (page.showSummary || page.showSignature) && (
                      <div className="mt-3 px-3 py-1.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-semibold text-slate-800 flex items-center justify-between">
                        <span>
                          {page.showSummary
                            ? `สรุปยอดชำระ เงื่อนไข และลายเซ็นรับรอง (ต่อจากหน้า ${pageNumber - 1})`
                            : `ส่วนลงนามรับรองเอกสาร (ต่อจากหน้า ${pageNumber - 1})`}
                        </span>
                        <span className="font-mono-num">
                          ยอดรวมก่อน VAT: ฿{formatTHB(docData.subtotal)}
                        </span>
                      </div>
                    )}

                    {page.showSummary && renderSummarySection()}

                    {/* Explicit Continuation Notice Box Before Page End */}
                    {page.continuationNotice && (
                      <div className="mt-2.5 px-3 py-1.5 border border-dashed border-blue-400 bg-blue-50/50 rounded text-[10.5px] font-semibold text-blue-900 text-center leading-[1.5]">
                        — {page.continuationNotice} / Continued on Page {pageNumber + 1} of{' '}
                        {totalPages} —
                      </div>
                    )}
                  </div>

                  {/* Bottom Zone: Signature (if assigned to this page) + Pinned Page Footer */}
                  <div>
                    {page.showSignature && renderSignatureSection()}
                    {renderPageFooter(pageNumber, totalPages, isLastPage)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
