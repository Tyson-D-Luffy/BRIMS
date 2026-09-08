import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, LogIn, AlertCircle, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import api from '../services/api';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

interface LoginProps {
  onLogin: () => void;
}

function obfuscateEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export default function Login({ onLogin }: LoginProps) {
  const { loginWithEmail } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotWorkflow, setShowForgotWorkflow] = useState(false);
  const [forgotEmployeeId, setForgotEmployeeId] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !password) {
      toast.error('Please enter both Employee ID and password');
      return;
    }

    setIsLoading(true);

    // 1. Pre-login verification block (locked check & email retrieval)
    let resolvedEmail = '';
    try {
      const checkRes = await api.post('/auth/pre-login', { employeeId });
      if (!checkRes.data.success) {
        toast.error(checkRes.data.message || 'This account is locked or inactive.');
        setIsLoading(false);
        return;
      }
      resolvedEmail = checkRes.data.email;
      if (!resolvedEmail) {
        toast.error('No email is registered for this Employee ID.');
        setIsLoading(false);
        return;
      }
    } catch (error: any) {
      if (error.response?.status === 403) {
        toast.error(error.response.data.message || 'Account is currently locked.');
      } else {
        toast.error(error.response?.data?.message || 'Employee ID not found or account is inactive.');
      }
      setIsLoading(false);
      return;
    }

    // 2. Perform primary email/password login using retrieved email
    try {
      await loginWithEmail(resolvedEmail, password);
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error:', error);

      // Report wrong password/credentials to increment attempts and lock if max reached!
      let subMessage = '';
      try {
        const failResponse = await api.post('/auth/record-failed-attempt', { employeeId });
        if (failResponse.data.locked) {
          toast.error('Maximum failed attempts reached. Your account is now locked. Please contact a QA/System Administrator to unlock your profile.');
          setIsLoading(false);
          return;
        } else if (failResponse.data.attempts > 0) {
          const remaining = failResponse.data.maxAttempts - failResponse.data.attempts;
          subMessage = ` Failure attempt ${failResponse.data.attempts} of ${failResponse.data.maxAttempts}. Account locks after ${remaining} more incorrect entries.`;
        }
      } catch (e) {
        console.error('Failed to report attempt:', e);
      }

      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        toast.error('Invalid password.' + subMessage);
      } else {
        toast.error((error.message || 'Failed to login. Please check your credentials.') + subMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmployeeId) {
      toast.error('Please enter your Employee ID');
      return;
    }

    setIsForgotLoading(true);
    try {
      const checkRes = await api.post('/auth/pre-login', { employeeId: forgotEmployeeId });
      const resolvedEmail = checkRes.data.email;
      if (!resolvedEmail) {
        toast.error('No registered email was found for this Employee ID.');
        setIsForgotLoading(false);
        return;
      }

      await sendPasswordResetEmail(auth, resolvedEmail);
      toast.success(`Password reset instructions sent to registered email: ${obfuscateEmail(resolvedEmail)}`);
      setShowForgotWorkflow(false);
      setForgotEmployeeId('');
    } catch (err: any) {
      console.error('Forgot password error:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to send password reset email. Please contact an Administrator.');
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Subtle ambient lighting glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/60 grid grid-cols-1 lg:grid-cols-12 relative z-10">
        
        {/* Left Panel - Official BRIMS Logo Poster Banner */}
        <div className="lg:col-span-6 bg-slate-900 p-8 lg:p-10 flex flex-col justify-between relative overflow-hidden text-white border-b lg:border-b-0 lg:border-r border-slate-800">
          {/* Subtle background grid pattern */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          
          <div className="relative z-10 flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] font-bold tracking-widest text-cyan-400 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Official Portal
            </div>
            <span className="text-xs font-mono text-slate-400">v2.4 • GAMP 5</span>
          </div>

          {/* Featured BRIMS Logo Image Card */}
          <div className="relative z-10 my-auto py-2 flex flex-col items-center text-center">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl shadow-cyan-950/60 border border-cyan-500/30 bg-slate-950 transform hover:scale-[1.01] transition-all duration-300">
              <img 
                src="/brims_logo.jpg" 
                alt="BRIMS - Batch Record Issuance Management System" 
                className="w-full h-auto aspect-square object-contain bg-slate-950 block"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-xs text-slate-400 font-medium mt-4 max-w-xs leading-relaxed">
              Batch Manufacturing & Packaging Record Issuance with 21 CFR Part 11 Electronic Signatures
            </p>
          </div>

          <div className="relative z-10 pt-6 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Morepen Laboratories Ltd.</span>
            <span>The Joy Of Growing Together</span>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="lg:col-span-6 p-8 md:p-10 lg:p-12 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center shadow-md shrink-0">
                <img 
                  src="/brims_logo.jpg" 
                  alt="BRIMS Mini Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">BRIMS Portal</h1>
                <p className="text-xs font-semibold text-cyan-600 uppercase tracking-wider mt-1">Batch Record Issuance Management System</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-4 bg-amber-50/80 border border-amber-200/60 rounded-2xl text-left">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Lock className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-900">21 CFR Part 11 Compliance Notice</p>
                  <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                    All login attempts and e-signature actions are recorded in an immutable audit log.
                  </p>
                </div>
              </div>
            </div>

            {showForgotWorkflow ? (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="forgotEmployeeId" className="text-xs font-bold text-slate-700">Employee ID</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      id="forgotEmployeeId"
                      type="text" 
                      placeholder="e.g. EMP00125" 
                      value={forgotEmployeeId}
                      onChange={(e) => setForgotEmployeeId(e.target.value)}
                      className="rounded-xl h-12 bg-slate-50 border-slate-200 pl-11 focus-visible:ring-indigo-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isForgotLoading}
                  className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  {isForgotLoading ? 'Sending link...' : 'Send Password Reset Link'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowForgotWorkflow(false); setForgotEmployeeId(''); }}
                  className="w-full text-slate-500 font-bold text-xs hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Back to Login
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCredentialsLogin} className="space-y-5">
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="employeeId" className="text-xs font-bold text-slate-700">Employee ID</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      id="employeeId"
                      type="text" 
                      placeholder="e.g. EMP00125" 
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="rounded-xl h-12 bg-slate-50 border-slate-200 pl-11 focus-visible:ring-indigo-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-bold text-slate-700">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotWorkflow(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold focus:outline-none cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      id="password"
                      type={showPassword ? "text" : "password"} 
                      placeholder={isPasswordFocused ? "" : "••••••••"} 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      className="rounded-xl h-12 bg-slate-50 border-slate-200 pl-11 pr-11 focus-visible:ring-indigo-500 text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Authorized personnel only. Unauthorized access is strictly prohibited and subject to legal action under 21 CFR Part 11.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> GMP Compliant</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ISO 9001</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> FDA Validated</span>
          </div>
        </div>

      </div>
    </div>
  );
}
