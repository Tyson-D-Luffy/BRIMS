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
import { ShieldCheck, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SignatureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  title: string;
  description: string;
  meaning: string;
  isLoading?: boolean;
}

export function SignatureDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  meaning,
  isLoading = false 
}: SignatureDialogProps) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        setUsername(user.employeeId || user.email || '');
      }
    } else {
      setPassword('');
      setShowPassword(false);
      setIsPasswordFocused(false);
    }
  }, [isOpen, user]);

  const handleConfirm = () => {
    onConfirm(password);
    setPassword('');
    setShowPassword(false);
    setIsPasswordFocused(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl max-w-md max-h-[90vh] overflow-y-auto">
        <form 
          onSubmit={(e) => { 
            e.preventDefault(); 
            handleConfirm(); 
          }}
          className="space-y-6"
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-800 leading-tight">{title}</DialogTitle>
            </div>
            <DialogDescription className="text-slate-500">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Signature Meaning</p>
              <p className="text-sm text-slate-700 font-medium italic">"{meaning}"</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signature-username">Employee ID</Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="signature-username"
                    type="text" 
                    name="employeeId"
                    placeholder="Enter your Employee ID" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="rounded-xl h-12 bg-slate-50 border-none pl-11 focus-visible:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signature-password">Confirm Password</Label>
                <div className="relative font-sans">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    id="signature-password"
                    type={showPassword ? "text" : "password"} 
                    name="password"
                    autoComplete="current-password"
                    placeholder={isPasswordFocused ? "" : "Enter your password to sign"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    className="rounded-xl h-12 bg-slate-50 border-none pl-11 pr-11 focus-visible:ring-indigo-500"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 px-1">
                  By entering your password, you are applying a legally binding electronic signature (21 CFR Part 11).
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-full flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!password || !username || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 flex-1 sm:flex-none"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Sign & Confirm'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
