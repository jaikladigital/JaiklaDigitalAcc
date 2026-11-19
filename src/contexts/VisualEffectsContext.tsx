import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'jkd_show_graphics_v1';

interface VisualEffectsContextValue {
  showGraphics: boolean;
  setShowGraphics: (next: boolean) => void;
  toggleGraphics: () => void;
}

const VisualEffectsContext = createContext<VisualEffectsContextValue>({
  showGraphics: true,
  setShowGraphics: () => {},
  toggleGraphics: () => {},
});

export const VisualEffectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showGraphics, setShowGraphicsState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // Ignore storage errors
    }
    return true;
  });

  const setShowGraphics = useCallback((next: boolean) => {
    setShowGraphicsState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const toggleGraphics = useCallback(() => {
    setShowGraphicsState((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
          // Ignore storage errors
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.graphics = showGraphics ? 'on' : 'off';
    }
  }, [showGraphics]);

  return (
    <VisualEffectsContext.Provider value={{ showGraphics, setShowGraphics, toggleGraphics }}>
      {children}
    </VisualEffectsContext.Provider>
  );
};

export const useVisualEffects = () => useContext(VisualEffectsContext);

interface VisualEffectsToggleProps {
  compact?: boolean;
  disabled?: boolean;
  saving?: boolean;
  onTogglePersist?: (next: boolean) => void | Promise<void>;
  className?: string;
}

/**
 * Switch control used inside SettingsView (Admin-only control with persisted state).
 */
export const VisualEffectsToggle: React.FC<VisualEffectsToggleProps> = ({
  compact = false,
  disabled = false,
  saving = false,
  onTogglePersist,
  className = '',
}) => {
  const { showGraphics, setShowGraphics } = useVisualEffects();

  const handleClick = async () => {
    if (disabled || saving) return;
    const next = !showGraphics;
    setShowGraphics(next);
    if (onTogglePersist) {
      await onTogglePersist(next);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={showGraphics}
      disabled={disabled || saving}
      onClick={handleClick}
      title={
        disabled
          ? 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ปรับเปลี่ยนได้'
          : showGraphics
            ? 'ปิดลวดลายกราฟิกและกิมมิกตกแต่ง'
            : 'เปิดลวดลายกราฟิกและกิมมิกตกแต่ง'
      }
      className={`group inline-flex items-center justify-between gap-2.5 px-3 py-2 !rounded-xl border transition-all select-none ${
        disabled
          ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed opacity-85'
          : showGraphics
            ? 'bg-indigo-50/85 hover:bg-indigo-100/80 border-indigo-200 text-indigo-950 cursor-pointer'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 cursor-pointer'
      } ${saving ? 'opacity-75' : ''} ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
        {disabled ? (
          <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        ) : (
          <Sparkles
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${
              showGraphics
                ? 'text-indigo-600 group-hover:rotate-12'
                : 'text-slate-400'
            }`}
          />
        )}
        <span>{compact ? 'ลวดลายกราฟิก' : 'ลวดลายกราฟิก & กิมมิก'}</span>
      </span>

      {/* Switch Track + Thumb */}
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${
          showGraphics
            ? disabled
              ? 'bg-indigo-300'
              : 'bg-indigo-600'
            : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
            showGraphics ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
};
