import React, { useState } from 'react';
import { DEFAULT_COMPANY_LOGO } from '../types/accounting';

export const JaiklaLogoSVG: React.FC<{ className?: string; logoUrl?: string }> = ({
  className = 'w-14 h-14',
  logoUrl,
}) => {
  const [imgError, setImgError] = useState(false);
  const resolvedSrc = logoUrl || DEFAULT_COMPANY_LOGO;

  if (!imgError && resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt="บริษัท ใจกล้า ดิจิตอล จำกัด (JAIKLA DIGITAL CO., LTD.)"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${className} object-contain bg-white rounded-lg p-0.5 border border-slate-200/80 shrink-0`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Jaikla Digital Co., Ltd."
    >
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#0F172A" />
      <rect x="6" y="6" width="52" height="52" rx="9" stroke="#38BDF8" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M22 18V36C22 41.5228 17.5228 46 12 46"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M31 18V46M31 32L44 18M35 28L46 46"
        stroke="#38BDF8"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="18" r="3" fill="#F59E0B" />
    </svg>
  );
};

export const JaiklaStampSVG: React.FC<{
  companyNameTh: string;
  companyNameEn: string;
  stampUrl?: string;
}> = ({ companyNameTh, companyNameEn, stampUrl }) => {
  if (stampUrl) {
    return (
      <img
        src={stampUrl}
        alt="ตราประทับบริษัท"
        referrerPolicy="no-referrer"
        className="w-28 h-28 object-contain opacity-90 pointer-events-none select-none"
      />
    );
  }

  return (
    <svg
      viewBox="0 0 140 140"
      className="w-28 h-28 pointer-events-none select-none opacity-85"
      aria-label="Company Official Seal"
    >
      <circle cx="70" cy="70" r="62" fill="none" stroke="#1D4ED8" strokeWidth="2.5" />
      <circle cx="70" cy="70" r="56" fill="none" stroke="#1D4ED8" strokeWidth="1" strokeDasharray="3 2" />
      <circle cx="70" cy="70" r="36" fill="none" stroke="#1D4ED8" strokeWidth="1.2" />
      <text
        x="70"
        y="27"
        textAnchor="middle"
        fill="#1D4ED8"
        fontSize="8.2"
        fontWeight="700"
        fontFamily="'Noto Sans Thai', 'IBM Plex Sans Thai', sans-serif"
      >
        {companyNameTh.slice(0, 26)}
      </text>
      <text
        x="70"
        y="68"
        textAnchor="middle"
        fill="#1D4ED8"
        fontSize="14"
        fontWeight="800"
        letterSpacing="1.5"
      >
        JAIKLA
      </text>
      <text
        x="70"
        y="81"
        textAnchor="middle"
        fill="#1D4ED8"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1"
      >
        DIGITAL
      </text>
      <text
        x="70"
        y="119"
        textAnchor="middle"
        fill="#1D4ED8"
        fontSize="6.8"
        fontWeight="700"
      >
        {companyNameEn.slice(0, 28)}
      </text>
    </svg>
  );
};

export const JaiklaSignatureSVG: React.FC<{ signatureUrl?: string }> = ({ signatureUrl }) => {
  if (signatureUrl) {
    return (
      <img
        src={signatureUrl}
        alt="ลายเซ็นผู้มีอำนาจ"
        referrerPolicy="no-referrer"
        className="h-12 max-w-[140px] object-contain mx-auto pointer-events-none select-none"
      />
    );
  }

  return (
    <svg
      viewBox="0 0 180 56"
      className="h-11 w-36 mx-auto pointer-events-none select-none"
      aria-label="Authorized Signature"
    >
      <path
        d="M16 42 C 26 14, 40 12, 36 38 C 34 46, 54 18, 66 28 C 72 34, 78 16, 92 26 C 98 30, 108 22, 124 27 C 138 31, 152 24, 166 28"
        fill="none"
        stroke="#0F172A"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 44 C 58 41, 118 39, 158 41"
        fill="none"
        stroke="#1D4ED8"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.65"
      />
    </svg>
  );
};

export const FriendlyExpenseIconSVG: React.FC<{ className?: string }> = ({
  className = 'w-6 h-6',
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} animate-friendly-icon shrink-0`}
    aria-hidden="true"
  >
    {/* Soft rounded receipt paper */}
    <path
      d="M7 6.5C7 5.11929 8.11929 4 9.5 4H19.5C20.8807 4 22 5.11929 22 6.5V25.2C22 25.79 21.34 26.14 20.85 25.81L18.7 24.38C18.28 24.1 17.72 24.1 17.3 24.38L15.3 25.71C14.88 25.99 14.32 25.99 13.9 25.71L11.9 24.38C11.48 24.1 10.92 24.1 10.5 24.38L8.15 25.81C7.66 26.14 7 25.79 7 25.2V6.5Z"
      fill="#FFFFFF"
      stroke="#0F766E"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    {/* Gentle document lines */}
    <path
      d="M11 10.5H18M11 14.5H16"
      stroke="#0D9488"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <path
      d="M11 18.5H14.5"
      stroke="#5EEAD4"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    {/* Friendly animated mint-teal checkmark coin */}
    <g className="animate-friendly-badge">
      <circle cx="22.5" cy="21.5" r="6.5" fill="#0D9488" stroke="#FFFFFF" strokeWidth="1.6" />
      <path
        d="M19.8 21.6L21.6 23.3L25.2 19.7"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);
