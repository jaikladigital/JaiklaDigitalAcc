import React from 'react';
import { tokenizeThaiForRender } from '../utils/thaiText';

interface ThaiTextProps {
  text: string;
  className?: string;
}

/**
 * Renders Thai prose/headings with atomic nowrap spans on compound Thai phrases
 * so browser line-breaking never slices terms like "ใบเสนอราคา" or "ใบเสร็จรับเงิน" across lines.
 */
export const ThaiText: React.FC<ThaiTextProps> = ({ text, className }) => {
  const tokens = tokenizeThaiForRender(text);
  const content = tokens.map((tok, index) =>
    tok.nowrap ? (
      <span key={index} className="thai-phrase">
        {tok.text}
      </span>
    ) : (
      <React.Fragment key={index}>{tok.text}</React.Fragment>
    )
  );

  if (className) {
    return <span className={className}>{content}</span>;
  }
  return <>{content}</>;
};
