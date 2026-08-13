import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  className, 
  size = 24, 
  label 
}) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
      <Loader2 className="animate-spin text-indigo-600" size={size} />
      {label && <p className="text-sm text-slate-500 font-medium">{label}</p>}
    </div>
  );
};

export const LoadingPage: React.FC<{ label?: string }> = ({ label = "Loading..." }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] w-full">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-indigo-600/10 rounded-full animate-pulse" />
        </div>
      </div>
      <p className="mt-6 text-slate-500 font-medium tracking-tight animate-pulse">{label}</p>
    </div>
  );
};
