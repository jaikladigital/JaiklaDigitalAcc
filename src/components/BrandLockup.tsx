import React from 'react';
import { JaiklaLogoSVG } from './BrandAssets';
import { useVisualEffects } from '../contexts/VisualEffectsContext';
import { DEFAULT_COMPANY_PROFILE } from '../types/accounting';

interface BrandLockupProps {
  companyNameTh?: string;
  companyNameEn?: string;
  logoUrl?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Uniform Centered Brand Lockup shared across all devices and screens
 * (Login Page, Desktop Sidebar, Mobile Drawer, and Public Urgent Expense Portal).
 */
export const BrandLockup: React.FC<BrandLockupProps> = ({
  companyNameTh,
  companyNameEn,
  logoUrl,
  subtitle = 'ระบบออกเอกสารบัญชีและงบประมาณบริษัท',
  size = 'md',
  className = '',
}) => {
  const { showGraphics } = useVisualEffects();

  const resolvedTh = companyNameTh || DEFAULT_COMPANY_PROFILE.companyNameTh;
  const resolvedEn = companyNameEn || DEFAULT_COMPANY_PROFILE.companyNameEn;

  const logoSizeCls =
    size === 'lg'
      ? 'w-16 h-16 sm:w-[72px] sm:h-[72px]'
      : size === 'sm'
        ? 'w-12 h-12'
        : 'w-14 h-14';

  const titleCls =
    size === 'lg'
      ? 'text-[19px] sm:text-[22px] font-bold text-slate-900 leading-[1.38]'
      : size === 'sm'
        ? 'text-[14px] font-bold text-slate-900 leading-[1.4]'
        : 'text-[16px] sm:text-[18px] font-bold text-slate-900 leading-[1.38]';

  const enCls =
    size === 'lg'
      ? 'text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-[0.12em] leading-[1.35]'
      : 'text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.09em] leading-[1.35]';

  const subCls =
    size === 'lg'
      ? 'text-[13px] sm:text-sm font-medium text-indigo-900/80 leading-[1.5]'
      : 'text-[11.5px] font-medium text-slate-600 leading-[1.45]';

  return (
    <div
      className={`w-full flex flex-col items-center justify-center text-center mx-auto ${className}`}
    >
      <div className="relative inline-flex items-center justify-center mb-2.5">
        {showGraphics && (
          <div
            aria-hidden="true"
            className="absolute -inset-1.5 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-violet-400/15 to-teal-400/20 blur-[3px] jkd-ambient-pulse pointer-events-none"
          />
        )}
        <JaiklaLogoSVG
          className={`relative ${logoSizeCls} ${
            showGraphics ? 'shadow-sm ring-1 ring-indigo-100' : ''
          }`}
          logoUrl={logoUrl}
        />
      </div>

      <div className="w-full min-w-0 max-w-full space-y-0.5 px-1">
        <div className={`${titleCls} truncate`}>{resolvedTh}</div>
        <div className={`${enCls} truncate font-mono-num`}>{resolvedEn}</div>
      </div>

      {subtitle && (
        <div className="mt-1.5 flex flex-col items-center gap-1.5 w-full">
          {showGraphics && (
            <div
              aria-hidden="true"
              className="h-[2px] w-12 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-500 opacity-80"
            />
          )}
          <div className={`${subCls} max-w-xs mx-auto`}>{subtitle}</div>
        </div>
      )}
    </div>
  );
};
