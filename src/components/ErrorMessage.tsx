import React from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ErrorMessageProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ 
  title = "Something went wrong", 
  message = "We encountered an error while processing your request.",
  onRetry 
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
      <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-rose-500" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 mb-8 leading-relaxed">{message}</p>
      
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        {onRetry && (
          <Button 
            onClick={onRetry} 
            className="flex-1 bg-slate-900 text-white rounded-full h-12"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
        <Button 
          variant="outline" 
          onClick={() => navigate('/')} 
          className="flex-1 rounded-full h-12 border-slate-200"
        >
          <Home className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </div>
    </div>
  );
};
