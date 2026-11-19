import React, { useEffect, useRef, useState } from 'react';

interface ResponsiveA4FrameProps {
  children: React.ReactNode;
  maxScale?: number;
}

const A4_WIDTH_PX = 794; // 210mm at 96dpi
const A4_MIN_HEIGHT_PX = 1123; // 297mm at 96dpi

/**
 * Automatically measures the available browser viewport / container width
 * and scales the 210mm A4 sheet cleanly so it fits mobile, tablet, split-pane,
 * and desktop screens without horizontal clipping, while printing at 1:1 A4.
 */
export const ResponsiveA4Frame: React.FC<ResponsiveA4FrameProps> = ({
  children,
  maxScale = 1,
}) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [contentHeight, setContentHeight] = useState<number>(A4_MIN_HEIGHT_PX);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer) return;

    const updateMetrics = () => {
      const availableWidth = outer.clientWidth;
      if (availableWidth > 0) {
        const nextScale = Math.min(maxScale, Math.max(0.32, availableWidth / A4_WIDTH_PX));
        setScale(nextScale);
      }
      if (inner) {
        setContentHeight(Math.max(A4_MIN_HEIGHT_PX, inner.scrollHeight));
      }
    };

    updateMetrics();

    const ro = new ResizeObserver(() => {
      updateMetrics();
    });
    ro.observe(outer);
    if (inner) ro.observe(inner);
    window.addEventListener('resize', updateMetrics);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [maxScale]);

  const scaledHeight = Math.ceil(contentHeight * scale);
  const horizontalOffset = scale < 1 ? 0 : undefined;

  return (
    <div
      ref={outerRef}
      className="responsive-a4-outer w-full flex justify-center overflow-hidden"
      style={{ height: `${scaledHeight + 16}px` }}
    >
      <div
        ref={innerRef}
        className="responsive-a4-scaler origin-top"
        style={{
          width: `${A4_WIDTH_PX}px`,
          transform: `scale(${scale})`,
          marginLeft: horizontalOffset,
        }}
      >
        {children}
      </div>
    </div>
  );
};
