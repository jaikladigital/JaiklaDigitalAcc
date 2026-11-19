import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit3,
  FolderKanban,
  Info,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  CompanyProfile,
  Customer,
  EmergencyCashStatus,
  FIELD_LIMITS,
  Project,
  ServiceCategory,
  UrgentExpenseRequest,
  WhtFormType,
  clampString,
} from '../types/accounting';
import { formatShortDate, formatTHB, getMonthYearFromDate, getTodayISO } from '../utils/formatters';
import {
  OVERHEAD_CATEGORY_PRESETS,
  OVERHEAD_PROJECT_PRESETS,
  OverheadKind,
  checkOverheadReadiness,
  detectNonDeductibleVatRisk,
  detectOverheadProjectKind,
  ensureCompanyOverheadInfrastructure,
  suggestCategoryForExpenseText,
} from '../utils/companyOverheadSetup';
import { toastError, toastSuccess } from '../utils/swal';

interface UrgentRequestImportModalProps {
  request: UrgentExpenseRequest;
  company: CompanyProfile;
  customers: Customer[];
  projects: Project[];
  categories: ServiceCategory[];
  teamUids: string[];
  onClose: () => void;
  onSwitchToEdit: (req: UrgentExpenseRequest) => void;
  onImported?: (voucherNo: string) => void;
}

const PURPOSE_CHIPS = [
  'เดินทางพบลูกค้า',
  'เสนองาน / ค้นหาลูกค้าใหม่',
  'ค่ารับรองลูกค้า',
  'ติดต่อสำนักงาน / เอกสาร',
];

export const UrgentRequestImportModal: React.FC<UrgentRequestImportModalProps> = ({
  request,
  company,
  customers,
  projects,
  categories,
  teamUids,
  onClose,
  onSwitchToEdit,
  onImported,
}) => {
  const combinedSourceText = `${request.projectName} ${request.description} ${request.vendorName || ''} ${request.urgencyReason || ''}`;

  const clientProjects = useMemo(
    () => projects.filter((p) => !detectOverheadProjectKind(p)),
    [projects]
  );

  const initialMatchedClientProject = useMemo(() => {
    const reqProj = (request.projectName || '').trim().toLowerCase();
    if (!reqProj) return undefined;
    return clientProjects.find(
      (p) =>
        p.eventName.toLowerCase().includes(reqProj) || reqProj.includes(p.eventName.toLowerCase())
    );
  }, [clientProjects, request.projectName]);

  const initialOverheadKind: OverheadKind = useMemo(() => {
    const lower = combinedSourceText.toLowerCase();
    const isClientTravelOrHospitality =
      /ลูกค้า|ขาย|รับรอง|ev|ชาร์จ|elexa|pea|น้ำมัน|เดินทาง|พบลูกค้า/.test(lower);
    const isAdminText = /สำนักงาน|ธุรการ|เอกสาร|บัญชี|office|admin/.test(lower);
    if (isAdminText && !isClientTravelOrHospitality) {
      return 'admin';
    }
    return 'selling';
  }, [combinedSourceText]);

  const [costCenterMode, setCostCenterMode] = useState<'overhead' | 'project'>(
    initialMatchedClientProject ? 'project' : 'overhead'
  );
  const [overheadKind, setOverheadKind] = useState<OverheadKind>(initialOverheadKind);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialMatchedClientProject?.id || projects[0]?.id || ''
  );

  const missingPresets = useMemo(
    () =>
      OVERHEAD_CATEGORY_PRESETS.filter(
        (preset) => !categories.some((c) => c.name.trim() === preset.name.trim())
      ),
    [categories]
  );

  const initialCategoryValue = useMemo(() => {
    const suggested = suggestCategoryForExpenseText(
      combinedSourceText,
      categories,
      initialOverheadKind
    );
    if (suggested) {
      // Check if a preset is even more specific when no preset categories exist yet
      const lower = combinedSourceText.toLowerCase();
      if (
        /รับรอง|อาหาร|กาแฟ|เครื่องดื่ม/.test(lower) &&
        !suggested.name.includes('รับรอง') &&
        missingPresets.some((p) => p.name.includes('รับรอง'))
      ) {
        const idx = OVERHEAD_CATEGORY_PRESETS.findIndex((p) => p.name.includes('รับรอง'));
        if (idx >= 0) return `__preset__:${idx}`;
      }
      if (
        /ชาร์จ|ev|elexa|pea|น้ำมัน|เดินทาง|พาหนะ|ทางด่วน/.test(lower) &&
        !suggested.name.includes('เดินทาง') &&
        !suggested.name.includes('พาหนะ') &&
        missingPresets.some((p) => p.name.includes('เดินทาง'))
      ) {
        const idx = OVERHEAD_CATEGORY_PRESETS.findIndex((p) => p.name.includes('เดินทาง'));
        if (idx >= 0) return `__preset__:${idx}`;
      }
      return suggested.id;
    }
    if (missingPresets.length > 0) {
      const idx = OVERHEAD_CATEGORY_PRESETS.findIndex((p) => p.name === missingPresets[0].name);
      return `__preset__:${idx >= 0 ? idx : 0}`;
    }
    return '';
  }, [categories, combinedSourceText, initialOverheadKind, missingPresets]);

  const [categoryValue, setCategoryValue] = useState<string>(initialCategoryValue);

  const vatRisk = useMemo(
    () => detectNonDeductibleVatRisk(combinedSourceText),
    [combinedSourceText]
  );

  const [vatComplianceMode, setVatComplianceMode] = useState<'deductible' | 'non_deductible'>(
    request.vatAmount > 0 && vatRisk.likelyNonDeductible ? 'non_deductible' : 'deductible'
  );

  const [descriptionText, setDescriptionText] = useState<string>(
    request.description?.trim() || ''
  );
  const [importingBusy, setImportingBusy] = useState(false);

  const readiness = useMemo(
    () => checkOverheadReadiness(company, customers, projects, categories),
    [company, customers, projects, categories]
  );

  const hasVat = (Number(request.vatAmount) || 0) > 0 || (Number(request.vatRate) || 0) > 0;

  const accountingPreview = useMemo(() => {
    const baseAmount = Number(request.amount) || 0;
    const vatRate = Number(request.vatRate) || 0;
    const vatAmt = Number(request.vatAmount) || 0;
    const whtRate = Number(request.whtRate) || 0;
    const whtAmt = Number(request.whtAmount) || 0;

    const foldVat = hasVat && vatComplianceMode === 'non_deductible';
    const finalAmount = foldVat ? Number((baseAmount + vatAmt).toFixed(2)) : baseAmount;
    const finalVatRate = foldVat ? 0 : vatRate;
    const finalVatAmount = foldVat ? 0 : vatAmt;
    const finalNetPaid = Number((finalAmount + finalVatAmount - whtAmt).toFixed(2));

    let resolvedCategoryName = 'ค่าใช้จ่ายเงินสดฉุกเฉิน';
    if (categoryValue.startsWith('__preset__:')) {
      const idx = Number(categoryValue.replace('__preset__:', ''));
      resolvedCategoryName = OVERHEAD_CATEGORY_PRESETS[idx]?.name || resolvedCategoryName;
    } else {
      resolvedCategoryName =
        categories.find((c) => c.id === categoryValue)?.name || resolvedCategoryName;
    }

    let resolvedProjectLabel = '';
    let statementGroup = 'ต้นทุนบริการ / โปรเจกต์ (Cost of Services)';
    if (costCenterMode === 'overhead') {
      const preset = OVERHEAD_PROJECT_PRESETS[overheadKind];
      const existingOverhead =
        overheadKind === 'selling' ? readiness.sellingProject : readiness.adminProject;
      resolvedProjectLabel = existingOverhead?.eventName || preset.eventName;
      statementGroup = preset.statementGroupLabel;
    } else {
      const p = projects.find((item) => item.id === selectedProjectId);
      resolvedProjectLabel = p?.eventName || '-';
      const pKind = detectOverheadProjectKind(p);
      if (pKind) {
        statementGroup = OVERHEAD_PROJECT_PRESETS[pKind].statementGroupLabel;
      } else if (/โฆษณา|ads|media|การตลาด|ขาย|kol|influencer|รับรอง|พบลูกค้า/.test(resolvedCategoryName.toLowerCase())) {
        statementGroup = 'ค่าใช้จ่ายในการขาย (Selling Expenses)';
      } else if (/สำนักงาน|บัญชี|สอบบัญชี|เอกสาร|ค่าเช่า|บริหาร/.test(resolvedCategoryName.toLowerCase())) {
        statementGroup = 'ค่าใช้จ่ายในการบริหาร (Admin Expenses)';
      }
    }

    return {
      foldVat,
      finalAmount,
      finalVatRate,
      finalVatAmount,
      whtRate,
      whtAmt,
      finalNetPaid,
      resolvedCategoryName,
      resolvedProjectLabel,
      statementGroup,
    };
  }, [
    request,
    hasVat,
    vatComplianceMode,
    categoryValue,
    categories,
    costCenterMode,
    overheadKind,
    readiness,
    projects,
    selectedProjectId,
  ]);

  const handleSelectOverheadKind = (kind: OverheadKind) => {
    setOverheadKind(kind);
    const lower = `${combinedSourceText} ${descriptionText}`.toLowerCase();
    if (kind === 'admin' && !/รับรอง|ชาร์จ|ev|น้ำมัน|เดินทาง/.test(lower)) {
      const adminCat = categories.find(
        (c) => c.name.includes('สำนักงาน') || c.name.includes('บริหาร')
      );
      if (adminCat) {
        setCategoryValue(adminCat.id);
      } else {
        const idx = OVERHEAD_CATEGORY_PRESETS.findIndex((p) => p.kind === 'admin');
        if (idx >= 0) setCategoryValue(`__preset__:${idx}`);
      }
    } else {
      const sellingCat = suggestCategoryForExpenseText(lower, categories, 'selling');
      if (sellingCat && (sellingCat.name.includes('เดินทาง') || sellingCat.name.includes('รับรอง'))) {
        setCategoryValue(sellingCat.id);
      }
    }
  };

  const handleAppendPurposeChip = (chip: string) => {
    setDescriptionText((prev) => {
      const trimmed = prev.trim();
      if (trimmed.includes(chip)) return trimmed;
      if (!trimmed) return chip;
      return `${trimmed} (${chip})`;
    });
  };

  const handleConfirmImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const cleanDesc = descriptionText.trim() || request.description.trim();
    if (!cleanDesc) {
      toastError('กรุณาระบุรายละเอียดค่าใช้จ่าย');
      return;
    }

    if (costCenterMode === 'project' && !projects.some((p) => p.id === selectedProjectId)) {
      toastError('กรุณาเลือกโปรเจกต์ หรือสลับเป็นโหมดค่าใช้จ่ายทั่วไปของบริษัท');
      return;
    }

    setImportingBusy(true);
    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    try {
      let targetProjectId = '';
      let targetEventName = '';
      let availableCategories = [...categories];

      const needsOverheadProject =
        costCenterMode === 'overhead' &&
        ((overheadKind === 'selling' && !readiness.sellingProject) ||
          (overheadKind === 'admin' && !readiness.adminProject));
      const needsPresetCategory = categoryValue.startsWith('__preset__:');

      if (needsOverheadProject || needsPresetCategory || !readiness.isFullyReady && costCenterMode === 'overhead') {
        const infra = await ensureCompanyOverheadInfrastructure({
          uid,
          teamUids,
          company,
          customers,
          projects,
          categories,
        });
        availableCategories = infra.createdCategories;
        if (costCenterMode === 'overhead') {
          targetProjectId =
            overheadKind === 'selling' ? infra.sellingProjectId : infra.adminProjectId;
          targetEventName =
            overheadKind === 'selling' ? infra.sellingProjectName : infra.adminProjectName;
        }
      }

      if (costCenterMode === 'overhead' && !targetProjectId) {
        const existingOverhead =
          overheadKind === 'selling' ? readiness.sellingProject : readiness.adminProject;
        if (existingOverhead) {
          targetProjectId = existingOverhead.id;
          targetEventName = existingOverhead.eventName;
        }
      } else if (costCenterMode === 'project') {
        const chosen = projects.find((p) => p.id === selectedProjectId);
        if (chosen) {
          targetProjectId = chosen.id;
          targetEventName = chosen.eventName;
        }
      }

      if (!targetProjectId) {
        toastError('ไม่พบโปรเจกต์ปลายทางสำหรับลงบัญชี กรุณาลองใหม่อีกครั้ง');
        setImportingBusy(false);
        return;
      }

      let resolvedCategoryId = '';
      let resolvedCategoryName = 'ค่าใช้จ่ายทั่วไป';
      if (categoryValue.startsWith('__preset__:')) {
        const idx = Number(categoryValue.replace('__preset__:', ''));
        const presetName = OVERHEAD_CATEGORY_PRESETS[idx]?.name;
        const foundCat = availableCategories.find((c) => c.name.trim() === presetName?.trim());
        resolvedCategoryId = foundCat?.id || availableCategories[0]?.id || '';
        resolvedCategoryName = foundCat?.name || presetName || resolvedCategoryName;
      } else {
        const foundCat = availableCategories.find((c) => c.id === categoryValue);
        resolvedCategoryId = foundCat?.id || '';
        resolvedCategoryName = foundCat?.name || availableCategories[0]?.name || resolvedCategoryName;
      }

      const contactSummary = [
        request.submitterPhone || '',
        request.submitterLineId ? `LINE: ${request.submitterLineId}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const prefixTag =
        costCenterMode === 'overhead'
          ? `[${overheadKind === 'selling' ? 'ค่าใช้จ่ายขาย/พบลูกค้า' : 'กิจกรรมสำนักงาน'}]`
          : `[${request.projectName}]`;
      const vatNoteTag = accountingPreview.foldVat ? ' [รวม VAT ต้องห้ามเป็นค่าใช้จ่าย]' : '';
      const finalDescription = clampString(
        `${prefixTag} ${cleanDesc}${vatNoteTag}`,
        FIELD_LIMITS.description
      );

      const resolvedFormType: WhtFormType = accountingPreview.whtAmt > 0 ? 'PND53' : 'NONE';
      const payDate = request.paymentDate || getTodayISO();

      const expenseRef = await addDoc(collection(db, 'expenses'), {
        projectId: targetProjectId,
        eventName: clampString(targetEventName, FIELD_LIMITS.eventName),
        supplierId: '',
        supplierName: clampString(
          request.vendorName || request.payerName,
          FIELD_LIMITS.companyName
        ),
        supplierTaxId: clampString(request.vendorTaxId || '', FIELD_LIMITS.taxId),
        supplierAddress: '',
        payeeEntityType: 'corporate',
        whtFormType: resolvedFormType,
        whtIncomeCode: '40(8)_service_3',
        categoryId: clampString(resolvedCategoryId, 128),
        categoryName: clampString(resolvedCategoryName, 150),
        description: finalDescription,
        amount: accountingPreview.finalAmount,
        vatRate: accountingPreview.finalVatRate,
        vatAmount: accountingPreview.finalVatAmount,
        whtRate: accountingPreview.whtRate,
        whtAmount: accountingPreview.whtAmt,
        netPaid: accountingPreview.finalNetPaid,
        paymentDate: payDate,
        monthYear: getMonthYearFromDate(payDate),
        receiptUrl: request.receiptUrl || '',
        extraPhotoUrl: request.extraPhotoUrl || '',
        wht50TawiNo: '',
        wht50TawiIssued: false,
        incomeType50Tawi: clampString(resolvedCategoryName, 200),
        isEmergencyCash: true,
        emergencyVoucherNo: request.voucherNo,
        payerType: request.payerType,
        payerName: clampString(request.payerName, FIELD_LIMITS.companyName),
        payerPhone: clampString(contactSummary, 60),
        urgencyReason: clampString(request.urgencyReason || '', 500),
        emergencyStatus: 'approved' as EmergencyCashStatus,
        lineNotifiedAt: request.lineNotifiedAt || '',
        lineNotifyChannel: request.lineNotifyChannel || 'public_urgent',
        createdBy: uid,
        teamUids: activeTeam,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'urgent_requests', request.id), {
        status: 'imported',
        importedExpenseId: expenseRef.id,
        updatedAt: serverTimestamp(),
      });

      toastSuccess(
        `อนุมัติและนำเข้า ${request.voucherNo} ลงบัญชีเรียบร้อย`,
        `จัดกลุ่มในงบกำไรขาดทุน: ${accountingPreview.statementGroup}`
      );
      onImported?.(request.voucherNo);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `urgent_requests/${request.id}`);
    } finally {
      setImportingBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl animate-figma-modal overflow-hidden max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/80">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                จัดหมวดบัญชี &amp; อนุมัตินำเข้า {request.voucherNo}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono-num text-[11px] font-bold">
                ฿{formatTHB(request.netPaid)}
              </span>
            </div>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              ผู้ส่ง: {request.payerName} · วันที่ {formatShortDate(request.paymentDate)}
              {request.vendorName ? ` · ร้าน: ${request.vendorName}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-light shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleConfirmImport} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-sm">
          {/* Request Snapshot + Switch to Edit */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-slate-700">
                <strong>ชื่องานที่ผู้ส่งระบุ:</strong> {request.projectName || '-'}
                {request.vendorTaxId ? ` · Tax ID: ${request.vendorTaxId}` : ''}
              </div>
              <button
                type="button"
                onClick={() => onSwitchToEdit(request)}
                className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 text-[11px] py-0.5 px-2"
              >
                <Edit3 className="w-3 h-3" />
                แก้ไขยอดเงิน / บิลต้นทาง
              </button>
            </div>
            <div className="text-slate-600 font-mono-num">
              ยอดต้นทาง: ฐาน ฿{formatTHB(request.amount)} · VAT {request.vatRate}% (฿
              {formatTHB(request.vatAmount)}) · WHT {request.whtRate}% (-฿
              {formatTHB(request.whtAmount)})
            </div>
            {request.reviewNotes && (
              <div className="text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <strong>หมายเหตุการปรับแก้:</strong> {request.reviewNotes}
              </div>
            )}
            {!request.receiptUrl && (
              <div className="flex items-start gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  คำขอนี้ยังไม่มีรูปหลักฐาน/ใบเสร็จแนบ — แนะนำให้ขอสลิปหรือใบกำกับภาษีเต็มรูปจากผู้ส่งเพิ่มเติม
                </span>
              </div>
            )}
          </div>

          {/* 1. Cost Center Mode */}
          <div className="space-y-2">
            <label className="form-label mb-0 font-bold text-slate-900">
              1. ประเภทศูนย์ต้นทุน (เลือกว่าเป็นค่าใช้จ่ายบริษัท หรือผูกโปรเจกต์ลูกค้า) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCostCenterMode('overhead')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  costCenterMode === 'overhead'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-bold leading-snug">
                    ค่าใช้จ่ายทั่วไปของบริษัท (Overhead)
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      costCenterMode === 'overhead' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    ชาร์จ EV / น้ำมัน / พบลูกค้า / ค่าบริหาร (ไม่ผูกโปรเจกต์ลูกค้า)
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={projects.length === 0}
                onClick={() => setCostCenterMode('project')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 disabled:opacity-50 ${
                  costCenterMode === 'project'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <FolderKanban className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs sm:text-sm font-bold leading-snug">
                    ผูกกับโปรเจกต์ลูกค้า / Event
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      costCenterMode === 'project' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {projects.length === 0
                      ? 'ยังไม่มีโปรเจกต์ในระบบ'
                      : 'นับเป็นต้นทุนของงานลูกค้าเพื่อวัดกำไรรายโปรเจกต์'}
                  </div>
                </div>
              </button>
            </div>

            {costCenterMode === 'overhead' ? (
              <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-950">
                    เลือกโปรเจกต์กลางของบริษัท (เพื่อจัดกลุ่มงบกำไรขาดทุนถูกต้อง)
                  </span>
                  {!readiness.isFullyReady && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-md px-2 py-0.5">
                      <Sparkles className="w-3 h-3" />
                      ระบบจะสร้างโปรเจกต์กลางให้อัตโนมัติเมื่อกดอนุมัติ
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['selling', 'admin'] as OverheadKind[]).map((kind) => {
                    const preset = OVERHEAD_PROJECT_PRESETS[kind];
                    const active = overheadKind === kind;
                    const exists =
                      kind === 'selling' ? Boolean(readiness.sellingProject) : Boolean(readiness.adminProject);
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => handleSelectOverheadKind(kind)}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          active
                            ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 text-slate-900'
                            : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold">{preset.shortLabel}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              exists
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {exists ? 'พร้อมใช้งาน' : 'สร้างอัตโนมัติ'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {kind === 'selling'
                            ? 'ลงงบ: ค่าใช้จ่ายในการขาย (พบ/ค้นหาลูกค้า, ค่ารับรอง)'
                            : 'ลงงบ: ค่าใช้จ่ายในการบริหาร (สำนักงานทั่วไป)'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <label className="form-label text-xs font-semibold">เลือกโปรเจกต์ / Event *</label>
                <select
                  className="form-select"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.eventName} ({p.customerName || '-'})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 2. Expense Category */}
          <div>
            <label className="form-label font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-600" />
              2. หมวดหมู่ค่าใช้จ่าย (สำหรับลงบัญชี &amp; งบกำไรขาดทุน) *
            </label>
            <select
              className="form-select"
              value={categoryValue}
              onChange={(e) => setCategoryValue(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {missingPresets.length > 0 && (
                <optgroup label="หมวดหมู่ค่าใช้จ่ายบริษัทแนะนำ (สร้างให้อัตโนมัติเมื่ออนุมัติ)">
                  {missingPresets.map((preset) => {
                    const idx = OVERHEAD_CATEGORY_PRESETS.findIndex(
                      (item) => item.name === preset.name
                    );
                    return (
                      <option key={preset.name} value={`__preset__:${idx}`}>
                        ✨ (สร้างอัตโนมัติ) {preset.name}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          {/* 3. Description + Business Purpose Chips */}
          <div className="space-y-1.5">
            <label className="form-label mb-0 font-bold text-slate-900">
              3. รายละเอียดเพื่อลงบัญชี &amp; วัตถุประสงค์ทางธุรกิจ (หลักฐานสรรพากร) *
            </label>
            <input
              type="text"
              className="form-control"
              required
              value={descriptionText}
              onChange={(e) => setDescriptionText(e.target.value)}
              placeholder="เช่น ค่าชาร์จไฟฟ้ารถยนต์เดินทางพบลูกค้า / เสนองาน..."
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-slate-500">เติมเหตุผลด่วน:</span>
              {PURPOSE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAppendPurposeChip(chip)}
                  className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 transition-colors"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          {/* 4. VAT Compliance Mode */}
          {hasVat && (
            <div className="space-y-2">
              <label className="form-label mb-0 font-bold text-slate-900 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                4. สิทธิ์การเคลมภาษีซื้อ (VAT ฿{formatTHB(request.vatAmount)})
              </label>

              {vatRisk.likelyNonDeductible && (
                <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <div>
                    <div className="font-bold">คำแนะนำทางภาษี (ประมวลรัษฎากร)</div>
                    <div className="mt-0.5">{vatRisk.reason}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVatComplianceMode('non_deductible')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    vatComplianceMode === 'non_deductible'
                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/30 text-amber-950'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold">
                    VAT ต้องห้าม — รวมยอดจ่ายเป็นค่าใช้จ่ายทั้งก้อน
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono-num">
                    ฐานค่าใช้จ่าย: ฿{formatTHB(request.amount + request.vatAmount)} · VAT ซื้อ: ฿0.00
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    เหมาะกับรถส่วนตัว / รถยนต์นั่ง ≤ 10 ที่นั่ง / ค่ารับรอง
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setVatComplianceMode('deductible')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    vatComplianceMode === 'deductible'
                      ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20 text-emerald-950'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-bold">
                    ขอคืนภาษีซื้อได้ (ยื่น ภ.พ.30 ปกติ)
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono-num">
                    ฐานค่าใช้จ่าย: ฿{formatTHB(request.amount)} · VAT ซื้อ: ฿{formatTHB(request.vatAmount)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    ใช้เมื่อเป็นใบกำกับภาษีเต็มรูปในนามบริษัท &amp; รถกระบะ/รถเกิน 10 ที่นั่ง
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Live Accounting Preview */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 text-slate-300">
              <span>การจัดประเภทในงบกำไรขาดทุน (P&amp;L)</span>
              <span className="font-bold text-emerald-300">{accountingPreview.statementGroup}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-300">
              <span>ผูกเข้าบัญชี / โปรเจกต์</span>
              <span className="font-semibold text-white text-end">
                {accountingPreview.resolvedProjectLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-300">
              <span>หมวดหมู่รายจ่าย</span>
              <span className="font-semibold text-white text-end">
                {accountingPreview.resolvedCategoryName}
              </span>
            </div>
            <div className="pt-2 mt-1 border-t border-slate-700 flex flex-wrap items-center justify-between gap-2 font-mono-num">
              <span>ค่าใช้จ่ายลงบัญชี: ฿{formatTHB(accountingPreview.finalAmount)}</span>
              <span>VAT ซื้อ: ฿{formatTHB(accountingPreview.finalVatAmount)}</span>
              <span className="font-bold text-sm text-amber-300">
                ยอดโอน/จ่ายสุทธิ: ฿{formatTHB(accountingPreview.finalNetPaid)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn btn-light border">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={importingBusy}
              className="btn btn-success px-4 fw-semibold inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {importingBusy ? 'กำลังนำเข้าบัญชี...' : 'ยืนยันนำเข้าบัญชี & อนุมัติ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
