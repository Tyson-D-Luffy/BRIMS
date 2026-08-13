import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ReturnBadgeProps {
  reason?: string;
  count?: number;
  returnReason?: string;
  returnCount?: number;
  returnedBy?: string;
  status?: string;
  className?: string;
}

export const ReturnBadge: React.FC<ReturnBadgeProps> = ({ 
  reason, 
  count, 
  returnReason, 
  returnCount, 
  returnedBy,
  className = '' 
}) => {
  const displayReason = reason || returnReason;
  const displayCount = count || returnCount;
  return (
    <span 
      title={displayReason ? `Returned by ${returnedBy || 'QA/Reviewer'}: ${displayReason}` : 'Returned for Correction'}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs ${className}`}
    >
      <RotateCcw className="w-3 h-3 text-amber-700 shrink-0" />
      <span>Returned {displayCount ? `#${displayCount}` : ''}</span>
    </span>
  );
};
