import React from 'react';
import { useVisualEffects } from '../contexts/VisualEffectsContext';

interface DecorativeGraphicsLayerProps {
  variant?: 'login' | 'workspace';
}

/**
 * Architectural & Geometric Vector Graphics Backdrop inspired by Jaikla Digital's
 * intersecting square node logo. Renders cleanly when showGraphics is ON and hides completely when OFF.
 */
export const DecorativeGraphicsLayer: React.FC<DecorativeGraphicsLayerProps> = ({
  variant = 'workspace',
}) => {
  const { showGraphics } = useVisualEffects();

  if (!showGraphics) return null;

  if (variant === 'login') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0 select-none"
      >
        {/* Subtle Architectural Dot Grid */}
        <div className="absolute inset-0 jkd-dot-grid opacity-75" />

        {/* Ambient Soft Color Glows */}
        <div className="absolute -top-28 -left-24 w-[420px] h-[420px] rounded-full bg-indigo-200/45 blur-3xl jkd-float-slow" />
        <div className="absolute -bottom-32 -right-24 w-[460px] h-[460px] rounded-full bg-violet-200/40 blur-3xl jkd-float-slow-reverse" />
        <div className="absolute top-1/3 right-1/4 w-[280px] h-[280px] rounded-full bg-teal-100/50 blur-3xl" />

        {/* Top-Left Geometric Intersecting Node SVG (Signature Jaikla Digital Motif) */}
        <svg
          viewBox="0 0 360 360"
          fill="none"
          className="absolute -top-8 -left-8 w-56 h-56 sm:w-80 sm:h-80 text-indigo-500/25"
        >
          <rect x="44" y="44" width="136" height="136" rx="14" stroke="currentColor" strokeWidth="1.5" />
          <rect
            x="96"
            y="96"
            width="136"
            height="136"
            rx="14"
            stroke="#7C3AED"
            strokeOpacity="0.28"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
          <line x1="44" y1="180" x2="232" y2="232" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.2" />
          <line x1="180" y1="44" x2="290" y2="110" stroke="#0D9488" strokeOpacity="0.25" strokeWidth="1.2" />
          <circle cx="44" cy="44" r="4.5" fill="currentColor" fillOpacity="0.55" />
          <circle cx="180" cy="44" r="4" fill="#7C3AED" fillOpacity="0.55" />
          <circle cx="232" cy="232" r="5" fill="#0D9488" fillOpacity="0.5" />
          <circle cx="96" cy="96" r="3.5" fill="currentColor" fillOpacity="0.45" />
        </svg>

        {/* Bottom-Right Accounting Ledger Lines & Geometric Frame */}
        <svg
          viewBox="0 0 380 380"
          fill="none"
          className="absolute -bottom-10 -right-10 w-60 h-60 sm:w-96 sm:h-96 text-violet-500/20"
        >
          <rect x="140" y="130" width="170" height="190" rx="18" stroke="currentColor" strokeWidth="1.5" />
          <rect x="96" y="176" width="140" height="140" rx="14" stroke="#2563EB" strokeOpacity="0.22" strokeWidth="1.3" />
          <path d="M168 175 H280 M168 205 H260 M168 235 H240 M168 265 H270" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
          <circle cx="140" cy="130" r="4.5" fill="#7C3AED" fillOpacity="0.5" />
          <circle cx="310" cy="130" r="4" fill="#0D9488" fillOpacity="0.5" />
          <circle cx="96" cy="316" r="4.5" fill="#2563EB" fillOpacity="0.45" />
        </svg>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="no-print pointer-events-none fixed inset-0 lg:left-64 overflow-hidden z-0 select-none"
    >
      {/* Subtle architectural dot pattern on workspace canvas */}
      <div className="absolute inset-0 jkd-dot-grid opacity-45" />

      {/* Top-right subtle brand node accent */}
      <svg
        viewBox="0 0 300 300"
        fill="none"
        className="absolute -top-6 -right-6 w-48 h-48 sm:w-64 sm:h-64 text-indigo-500/15"
      >
        <rect x="92" y="34" width="120" height="120" rx="14" stroke="currentColor" strokeWidth="1.4" />
        <rect
          x="134"
          y="76"
          width="120"
          height="120"
          rx="14"
          stroke="#7C3AED"
          strokeOpacity="0.22"
          strokeWidth="1.3"
          strokeDasharray="5 5"
        />
        <circle cx="92" cy="34" r="3.5" fill="currentColor" fillOpacity="0.5" />
        <circle cx="212" cy="154" r="4" fill="#0D9488" fillOpacity="0.45" />
      </svg>

      {/* Bottom-left subtle line accent */}
      <svg
        viewBox="0 0 260 260"
        fill="none"
        className="absolute -bottom-8 -left-8 w-44 h-44 text-teal-600/12 hidden sm:block"
      >
        <rect x="38" y="88" width="118" height="118" rx="14" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="156" cy="88" r="4" fill="#6366F1" fillOpacity="0.45" />
      </svg>
    </div>
  );
};

/**
 * Login Hero Header Art Strip & Micro Feature Highlight Card Row (Only visible when showGraphics is ON).
 */
export const LoginHeroDecor: React.FC = () => {
  const { showGraphics } = useVisualEffects();
  if (!showGraphics) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      {/* Top gradient shimmer accent bar */}
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-600 via-violet-500 to-teal-500" />
      {/* Subtle geometric line art behind centered brand header */}
      <svg
        viewBox="0 0 480 120"
        fill="none"
        className="absolute inset-x-0 top-0 w-full h-28 opacity-45"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="jkdCardFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EEF2FF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="480" height="120" fill="url(#jkdCardFade)" />
        <path d="M0 36 Q 120 12, 240 38 T 480 32" stroke="#818CF8" strokeOpacity="0.22" strokeWidth="1.2" />
        <path d="M0 64 Q 140 86, 280 54 T 480 68" stroke="#14B8A6" strokeOpacity="0.18" strokeWidth="1" />
        <circle cx="64" cy="28" r="2.5" fill="#6366F1" fillOpacity="0.35" />
        <circle cx="414" cy="36" r="2.5" fill="#8B5CF6" fillOpacity="0.35" />
      </svg>
    </div>
  );
};
