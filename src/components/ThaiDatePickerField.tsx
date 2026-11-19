import React, { useMemo } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { formatShortDate, getDaysInMonth, getTodayISO } from '../utils/formatters';

export const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

interface ThaiDatePickerFieldProps {
  label?: React.ReactNode;
  value: string;
  onChange: (nextIso: string) => void;
  allowEmpty?: boolean;
  showTodayButton?: boolean;
  highlighted?: boolean;
  hideCaption?: boolean;
  className?: string;
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Math.min(12, Math.max(1, Number(match[2])));
  const maxDay = getDaysInMonth(year, month);
  const day = Math.min(maxDay, Math.max(1, Number(match[3])));
  return { year, month, day };
}

export const ThaiDatePickerField: React.FC<ThaiDatePickerFieldProps> = ({
  label,
  value,
  onChange,
  allowEmpty = false,
  showTodayButton = true,
  highlighted = false,
  hideCaption = false,
  className = '',
}) => {
  const todayParts = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }, []);

  const parsed = useMemo(() => parseIsoDate(value), [value]);
  const effectiveYear = parsed?.year ?? todayParts.year;
  const effectiveMonth = parsed?.month ?? todayParts.month;
  const daysInMonth = getDaysInMonth(effectiveYear, effectiveMonth);
  const effectiveDay = parsed ? Math.min(parsed.day, daysInMonth) : '';

  const yearOptions = useMemo(() => {
    const baseYear = todayParts.year;
    const years: number[] = [];
    for (let y = baseYear - 4; y <= baseYear + 3; y += 1) {
      years.push(y);
    }
    if (parsed && !years.includes(parsed.year)) {
      years.push(parsed.year);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [todayParts.year, parsed]);

  const commitParts = (nextYear: number, nextMonth: number, nextDay: number) => {
    const maxDay = getDaysInMonth(nextYear, nextMonth);
    const clampedDay = Math.min(Math.max(1, nextDay), maxDay);
    onChange(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
    );
  };

  const dayDisplayText = parsed ? String(effectiveDay).padStart(2, '0') : 'วัน';
  const monthDisplayText = parsed
    ? `${String(parsed.month).padStart(2, '0')} ${THAI_SHORT_MONTHS[parsed.month - 1]}`
    : 'เดือน';
  const yearDisplayText = parsed ? String(parsed.year + 543) : 'พ.ศ.';

  return (
    <div className={className}>
      {(label || showTodayButton || (allowEmpty && Boolean(value))) && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5 min-h-[22px]">
          {label ? (
            <label className="form-label m-0 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>{label}</span>
            </label>
          ) : (
            <span />
          )}

          <div className="inline-flex items-center gap-1 ms-auto">
            {showTodayButton && (
              <button
                type="button"
                onClick={() => onChange(getTodayISO())}
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 cursor-pointer whitespace-nowrap"
              >
                วันนี้
              </button>
            )}
            {allowEmpty && Boolean(value) && (
              <button
                type="button"
                onClick={() => onChange('')}
                title="ล้างวันที่"
                aria-label="ล้างวันที่"
                className="px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 cursor-pointer inline-flex items-center gap-0.5 whitespace-nowrap"
              >
                <X className="w-3 h-3" />
                ล้าง
              </button>
            )}
          </div>
        </div>
      )}

      {/* Segmented Thai Date Control: visual HTML label + full-area native select overlay (prevents mobile Chrome select clipping & matches app typography) */}
      <div
        className={`flex items-stretch w-full min-h-[40px] sm:min-h-[38px] rounded-lg border transition-colors overflow-hidden ${
          highlighted
            ? 'border-amber-400 bg-amber-50/50 focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20'
            : 'border-slate-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/15'
        }`}
      >
        {/* Day */}
        <div className="relative flex-[0.82] min-w-[54px] flex items-center justify-center px-2 py-1.5 hover:bg-slate-50/80 transition-colors">
          <div className="pointer-events-none flex items-center justify-center gap-1 w-full">
            <span
              className={`tabular-nums text-[13.5px] sm:text-sm font-medium leading-none whitespace-nowrap ${
                parsed ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              {dayDisplayText}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <select
            aria-label="วัน"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
            value={parsed ? effectiveDay : ''}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!val) return;
              commitParts(effectiveYear, effectiveMonth, val);
            }}
          >
            {allowEmpty && !parsed && <option value="">วัน</option>}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {String(d).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px bg-slate-200 my-1.5 shrink-0" />

        {/* Month */}
        <div className="relative flex-[1.32] min-w-[88px] flex items-center justify-center px-2 py-1.5 hover:bg-slate-50/80 transition-colors">
          <div className="pointer-events-none flex items-center justify-center gap-1 w-full">
            <span
              className={`tabular-nums text-[13.5px] sm:text-sm font-medium leading-none whitespace-nowrap ${
                parsed ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              {monthDisplayText}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <select
            aria-label="เดือน"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
            value={parsed ? parsed.month : ''}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!val) return;
              commitParts(effectiveYear, val, parsed?.day ?? todayParts.day);
            }}
          >
            {allowEmpty && !parsed && <option value="">เดือน</option>}
            {THAI_SHORT_MONTHS.map((mLabel, idx) => (
              <option key={mLabel} value={idx + 1}>
                {String(idx + 1).padStart(2, '0')} {mLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px bg-slate-200 my-1.5 shrink-0" />

        {/* Year (พ.ศ.) */}
        <div className="relative flex-[1.05] min-w-[70px] flex items-center justify-center px-2 py-1.5 hover:bg-slate-50/80 transition-colors">
          <div className="pointer-events-none flex items-center justify-center gap-1 w-full">
            <span
              className={`tabular-nums text-[13.5px] sm:text-sm font-medium leading-none whitespace-nowrap ${
                parsed ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              {yearDisplayText}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <select
            aria-label="ปี พ.ศ."
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
            value={parsed ? parsed.year : ''}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!val) return;
              commitParts(val, effectiveMonth, parsed?.day ?? todayParts.day);
            }}
          >
            {allowEmpty && !parsed && <option value="">พ.ศ.</option>}
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hideCaption && (
        <div className="mt-1 text-[11.5px] text-slate-500 tabular-nums leading-snug">
          {parsed ? (
            <>
              ว/ด/ป: <strong className="text-slate-700 font-semibold">{formatShortDate(value)}</strong> (พ.ศ.{' '}
              {parsed.year + 543})
            </>
          ) : (
            <span>ยังไม่ระบุวันที่ (เลือก ว/ด/ป หรือกด &ldquo;วันนี้&rdquo;)</span>
          )}
        </div>
      )}
    </div>
  );
};
