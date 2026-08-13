import React, { useState } from 'react';
import { ReturnHistoryEntry } from '../types';
import { RotateCcw, ChevronDown, ChevronUp, User, Calendar, MessageSquare, ArrowRight } from 'lucide-react';

interface ReturnHistorySectionProps {
  history?: ReturnHistoryEntry[];
  currentReturnReason?: string;
  returnedBy?: string;
  returnedAt?: string;
  className?: string;
}

export const ReturnHistorySection: React.FC<ReturnHistorySectionProps> = ({
  history = [],
  currentReturnReason,
  returnedBy,
  returnedAt,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // If no structured array history but current return info exists, create fallback entry
  const displayHistory: ReturnHistoryEntry[] = history.length > 0 
    ? history 
    : (currentReturnReason ? [{
        returnNo: 1,
        returnedAt: returnedAt || new Date().toISOString(),
        returnedBy: returnedBy || 'QA Personnel',
        returnedByEmail: returnedBy,
        fromStep: 'QA Review',
        toStep: 'Draft / Correction',
        reason: currentReturnReason,
      }] : []);

  if (displayHistory.length === 0 && !currentReturnReason) {
    return null;
  }

  return (
    <div className={`p-4 bg-amber-50/80 rounded-2xl border border-amber-200/90 shadow-xs space-y-3 ${className}`}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-2">
              Return & Correction History
              <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {displayHistory.length} {displayHistory.length === 1 ? 'Return' : 'Returns'}
              </span>
            </h4>
            <p className="text-[11px] text-amber-800/80">
              Audit record of non-conformances sent back for correction
            </p>
          </div>
        </div>

        <button 
          type="button" 
          className="text-amber-800 hover:text-amber-950 p-1 rounded-lg hover:bg-amber-100/60"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-2.5 pt-1 border-t border-amber-200/60">
          {displayHistory.map((entry, idx) => (
            <div 
              key={entry.returnNo || idx} 
              className="p-3 bg-white/90 rounded-xl border border-amber-200 shadow-2xs space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">
                    Return #{entry.returnNo || idx + 1}
                  </span>
                  <div className="flex items-center gap-1 text-slate-700 font-semibold text-[11px]">
                    <span>{entry.fromStep || 'Review'}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="text-amber-800">{entry.toStep || 'Draft'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    {entry.returnedAt ? new Date(entry.returnedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1 text-slate-700">
                  <User className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span className="font-semibold">{entry.returnedByName || entry.returnedByEmail || entry.returnedBy}</span>
                  {entry.returnedByRole && <span className="text-slate-400">({entry.returnedByRole})</span>}
                </div>
              </div>

              <div className="p-2.5 bg-amber-50/60 rounded-lg border border-amber-100 text-slate-800 text-xs space-y-1">
                <div className="flex items-start gap-1.5 font-medium text-amber-950">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-amber-900">Return Reason: </span>
                    <span className="italic">{entry.reason}</span>
                  </div>
                </div>
                {entry.comments && (
                  <p className="text-[11px] text-slate-600 pl-5">
                    <span className="font-semibold">Comments:</span> {entry.comments}
                  </p>
                )}
              </div>

              {entry.resubmittedAt && (
                <div className="pt-1 text-[10px] text-emerald-700 flex items-center justify-between border-t border-slate-100">
                  <span className="font-semibold">Resubmitted for re-approval:</span>
                  <span>
                    {new Date(entry.resubmittedAt).toLocaleString()} by {entry.resubmittedByName || entry.resubmittedBy || 'Author'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
