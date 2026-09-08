import React from 'react';

export interface HighlightTextProps {
  text: string | number | null | undefined;
  search: string | null | undefined;
  className?: string;
  highlightClassName?: string;
}

/**
 * Escapes characters with special meaning in RegExp.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * HighlightText component highlights matching search keywords in a text string.
 * Supports multi-token search queries (e.g. "batch 001" or "tablet 500mg").
 */
export const HighlightText: React.FC<HighlightTextProps> = ({
  text,
  search,
  className = '',
  highlightClassName = 'bg-amber-200/85 text-amber-950 font-semibold px-0.5 rounded-[2px] border-b border-amber-400/60',
}) => {
  if (text === null || text === undefined) {
    return null;
  }

  const stringText = String(text);

  if (!search || !search.trim()) {
    return <span className={className}>{stringText}</span>;
  }

  // Tokenize search string by whitespace to support multi-term searches
  const tokens = search
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(escapeRegExp);

  if (tokens.length === 0) {
    return <span className={className}>{stringText}</span>;
  }

  // Create combined regex pattern with capture group
  const regex = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = stringText.split(regex);

  // Quick lookup set for case-insensitive token comparison
  const tokenRegexes = tokens.map(t => new RegExp(`^${t}$`, 'i'));

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isMatch = tokenRegexes.some(r => r.test(part));
        if (isMatch) {
          return (
            <mark key={index} className={highlightClassName}>
              {part}
            </mark>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};

export default HighlightText;
