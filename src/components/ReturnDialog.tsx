import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw, ShieldCheck, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WorkflowEntityType, getReturnConfig, validateReturnReason } from '../lib/workflowEngine';

export interface ReturnDialogConfirmPayload {
  returnReason: string;
  returnToStep: string;
  comments?: string;
  password?: string;
}

interface ReturnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: ReturnDialogConfirmPayload) => void;
  title?: string;
  recordId: string;
  recordTitle?: string;
  entityType: WorkflowEntityType;
  currentStep: string;
  isLoading?: boolean;
  requiresESignature?: boolean;
}

export function ReturnDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "RETURN RECORD FOR CORRECTION",
  recordId,
  recordTitle,
  entityType,
  currentStep,
  isLoading = false,
  requiresESignature = true,
}: ReturnDialogProps) {
  const { user } = useAuth();
  
  const config = getReturnConfig(entityType, currentStep);
  const allowedSteps = config?.allowedReturnSteps || [{ stepId: 'DRAFT', label: 'Return to Creator (Draft)', roleName: 'Creator' }];
  
  const [returnToStep, setReturnToStep] = useState<string>(config?.defaultReturnStep || 'DRAFT');
  const [returnReason, setReturnReason] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        setUsername(user.employeeId || user.email || '');
      }
      if (config?.defaultReturnStep) {
        setReturnToStep(config.defaultReturnStep);
      } else if (allowedSteps.length > 0) {
        setReturnToStep(allowedSteps[0].stepId);
      }
      setReturnReason('');
      setComments('');
      setPassword('');
      setValidationError(null);
    }
  }, [isOpen, user, currentStep, entityType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateReturnReason(returnReason);
    if (!validation.valid) {
      setValidationError(validation.message || 'Invalid return reason');
      return;
    }

    if (requiresESignature && (!password || !username)) {
      setValidationError('Electronic signature password is required to authorize Return.');
      return;
    }

    setValidationError(null);
    onConfirm({
      returnReason: returnReason.trim(),
      returnToStep,
      comments: comments.trim() || undefined,
      password: requiresESignature ? password : undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl max-w-lg max-h-[92vh] overflow-y-auto border-amber-200">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 leading-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Send record back for correction under 21 CFR Part 11 / GMP audit control.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Record Details Card */}
          <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-amber-900">Record ID:</span>
              <span className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-amber-200">{recordId}</span>
            </div>
            {recordTitle && (
              <div className="flex justify-between items-center">
                <span className="font-semibold text-amber-900">Title / Name:</span>
                <span className="text-slate-800 font-medium truncate max-w-[200px]">{recordTitle}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="font-semibold text-amber-900">Current Step:</span>
              <span className="text-slate-700 font-medium">{currentStep}</span>
            </div>
          </div>

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Return Destination Dropdown (if multiple allowed) */}
          {allowedSteps.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="returnToStep" className="text-xs font-semibold text-slate-700">
                Return Destination Step <span className="text-red-500">*</span>
              </Label>
              <select
                id="returnToStep"
                value={returnToStep}
                onChange={(e) => setReturnToStep(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {allowedSteps.map((s) => (
                  <option key={s.stepId} value={s.stepId}>
                    {s.label} ({s.roleName})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Return Destination:</span>
              <span className="font-bold text-amber-800">{allowedSteps[0]?.label || 'Draft / Creator'}</span>
            </div>
          )}

          {/* Return Reason (Mandatory) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="returnReason" className="text-xs font-semibold text-slate-800">
                Reason for Return <span className="text-red-500">*</span>
              </Label>
              <span className="text-[10px] text-slate-400">
                {returnReason.length}/1000 chars (min 5)
              </span>
            </div>
            <Textarea
              id="returnReason"
              placeholder="State the explicit reasons for returning this record and required corrections..."
              value={returnReason}
              onChange={(e) => {
                setReturnReason(e.target.value);
                if (validationError) setValidationError(null);
              }}
              rows={3}
              className="rounded-xl bg-slate-50 border-slate-200 text-xs focus-visible:ring-amber-500"
              required
            />
          </div>

          {/* Additional Comments (Optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="comments" className="text-xs font-semibold text-slate-700">
              Additional Review Comments (Optional)
            </Label>
            <Input
              id="comments"
              placeholder="E.g., Please check page 3 CPP limits or weight record logs"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="rounded-xl h-10 bg-slate-50 border-slate-200 text-xs focus-visible:ring-amber-500"
            />
          </div>

          {/* 21 CFR Part 11 Electronic Signature Block */}
          {requiresESignature && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">Electronic Signature Authorization</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="signature-user" className="text-[11px] font-medium text-slate-600">Employee ID</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      id="signature-user"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="rounded-xl h-9 text-xs bg-slate-50 pl-9 border-slate-200"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="signature-pwd" className="text-[11px] font-medium text-slate-600">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input
                      id="signature-pwd"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (validationError) setValidationError(null);
                      }}
                      className="rounded-xl h-9 text-xs bg-slate-50 pl-9 pr-8 border-slate-200"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 italic leading-tight">
                Signing meaning: "Returned for Correction". E-signature logged under 21 CFR Part 11.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="rounded-xl text-xs h-9 px-4 text-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || returnReason.trim().length < 5 || (requiresESignature && !password)}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs h-9 px-6 font-semibold flex items-center gap-1.5"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Confirm Return
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
