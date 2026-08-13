import React, { useState } from 'react';
import { 
  Lock, 
  AlertCircle, 
  KeyRound, 
  LogOut,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { updatePassword, auth } from '../firebase';
import api from '../services/api';

export default function PasswordResetRequiredPage() {
  const { user, completePasswordResetSuccess, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.error('All fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        console.log('PasswordResetRequiredPage: Updating client Firebase password...');
        await updatePassword(currentUser, newPassword);
        console.log('PasswordResetRequiredPage: Client Firebase password updated successfully.');
      } else {
        console.log('PasswordResetRequiredPage: Authenticating via virtual session. Password will be updated on the backend.');
      }

      const response = await api.post('/auth/complete-reset-password', { newPassword });
      if (response.data.success) {
        toast.success('Your secret electronic signature password has been configured successfully.');
        completePasswordResetSuccess(response.data.user, response.data.token);
      } else {
        throw new Error(response.data.message || 'Failed to update password reset flag on server.');
      }
    } catch (error: any) {
      console.error('Password reset failure:', error);
      toast.error(error.message || 'An error occurred during password change.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-900 justify-center items-center p-4">
      <div className="w-full max-w-lg space-y-4">
        
        {/* Top Branding / Logo */}
        <div className="text-center space-y-1 mb-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6321]/10 text-[#FF6321] mb-2">
            <KeyRound className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white font-sans">BRIMS Portal</h2>
          <p className="text-sm text-slate-400 font-sans">Batch Record Information Management System</p>
        </div>

        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-slate-950 text-white">
          <CardHeader className="bg-slate-900 border-b border-white/5 p-6 space-y-2">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-[#FF6321]" />
              Password Reset Required
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs leading-relaxed">
              Pursuant to GMP quality specifications and Part 11 Electronic Signature controls, 
              you are required to select a permanent credential upon first login to secure your profile.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              <div className="space-y-1.5 text-left">
                <Label htmlFor="reset-new-password text-xs text-slate-300">New Signature Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    id="reset-new-password"
                    type="password" 
                    placeholder="Min. 6 characters" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="rounded-xl h-12 bg-white/5 border-white/10 text-white pl-11 focus-visible:ring-[#FF6321]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="reset-confirm-password text-xs text-slate-300">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    id="reset-confirm-password"
                    type="password" 
                    placeholder="Repeat new password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="rounded-xl h-12 bg-white/5 border-white/10 text-white pl-11 focus-visible:ring-[#FF6321]"
                    required
                  />
                </div>
              </div>

              {/* CFR 11 Alert Policy */}
              <div className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl flex gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-[#FF6321] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-200 block">Security Policy Notice</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    This password serves as your identity validation during critical electronic signature steps (Review / Approval / Issue). 
                    Keep this private. Shared passwords violate international GMP compliance regulations.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={logout}
                  className="rounded-full flex-1 border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 h-12 font-semibold"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>

                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="bg-[#FF6321] hover:bg-[#FF6321]/90 text-white rounded-full flex-[1.5] h-12 shadow-lg shadow-[#FF6321]/10 font-bold"
                >
                  {isLoading ? 'Updating Credential...' : 'Set New Password'}
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
