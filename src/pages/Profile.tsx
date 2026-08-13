import React, { useState } from 'react';
import { 
  User, 
  Lock, 
  ShieldCheck, 
  Mail, 
  BadgeCheck, 
  Save,
  AlertCircle,
  Briefcase,
  Building,
  MapPin,
  CalendarDays,
  Hash,
  Fingerprint,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import api from '../services/api';
import { 
  updatePassword, 
  auth, 
  EmailAuthProvider, 
  reauthenticateWithCredential 
} from '../firebase';

export default function Profile() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showReauth, setShowReauth] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Eye visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Password policy guidelines states
  const [isPasswordDirty, setIsPasswordDirty] = useState(false);

  const getMissingPasswordRequirements = (pass: string) => {
    const missing = [];
    if (pass.length < 8) missing.push("Minimum 8 characters");
    if (!/[A-Z]/.test(pass)) missing.push("at least 1 uppercase letter");
    if (!/[a-z]/.test(pass)) missing.push("at least 1 lowercase letter");
    if (!/[0-9]/.test(pass)) missing.push("at least 1 number");
    if (!/[^A-Za-z0-9]/.test(pass)) missing.push("at least 1 special character/symbol");
    return missing;
  };

  const getDaysRemaining = () => {
    if (!user) return 'N/A';
    const expiry = user.passwordExpiry || '90 Days';
    if (expiry === 'No Expiry' || (user.role as string) === 'System Administrator') {
      return 'No Expiry';
    }
    
    const passwordSetAt = user.passwordSetAt || user.createdAt;
    if (!passwordSetAt) return expiry;
    
    const daysLimit = parseInt(expiry, 10);
    if (isNaN(daysLimit)) return 'N/A';
    
    const setDate = new Date(passwordSetAt);
    const msElapsed = Date.now() - setDate.getTime();
    const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, daysLimit - daysElapsed);
    
    return `${daysRemaining} Days`;
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const missingRequirements = getMissingPasswordRequirements(newPassword);
    if (missingRequirements.length > 0) {
      toast.error(`Signature password is not compliant. Missing: ${missingRequirements.join(", ")}`);
      setIsPasswordDirty(true);
      return;
    }

    setIsLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('No authenticated user found');
      
      // If the user has a password provider, we might need to re-authenticate
      const isPasswordUser = currentUser.providerData.some(p => p.providerId === 'password');

      if (isPasswordUser && !showReauth) {
        // Try update first, if it fails with requires-recent-login, then show re-auth
        try {
          await updatePassword(currentUser, newPassword);
          await api.post('/auth/complete-reset-password');
          toast.success('Signature password updated successfully');
          setNewPassword('');
          setConfirmPassword('');
        } catch (error: any) {
          if (error.code === 'auth/requires-recent-login') {
            setShowReauth(true);
            toast.info('Please enter your current password to confirm this change.');
          } else {
            throw error;
          }
        }
      } else if (showReauth) {
        // Perform re-authentication then update
        const credential = EmailAuthProvider.credential(currentUser.email!, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        await api.post('/auth/complete-reset-password');
        
        toast.success('Signature password updated successfully');
        setNewPassword('');
        setConfirmPassword('');
        setCurrentPassword('');
        setShowReauth(false);
      } else {
        // User doesn't have a password yet (e.g. Google user), updatePassword will set it
        await updatePassword(currentUser, newPassword);
        await api.post('/auth/complete-reset-password');
        toast.success('Signature password set successfully');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error: any) {
      console.error('Password update error:', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        toast.error('Invalid current password');
      } else {
        toast.error(error.message || 'Failed to update password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">User Profile</h1>
        <p className="text-slate-500 mt-1">Manage your account settings and electronic signature credentials.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Info & Details */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardContent className="p-8 text-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-100">
                <User className="w-12 h-12 text-indigo-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">{user?.displayName || 'User'}</h2>
              <p className="text-sm text-slate-500 mb-4">{user?.email}</p>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold uppercase tracking-wider">
                <BadgeCheck className="w-3 h-3" />
                {user?.role}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
              <CardTitle className="text-base font-bold text-slate-800">Account Details</CardTitle>
            </CardHeader>
            <CardContent className="p-6 divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Employee ID</span>
                </div>
                <span className="text-slate-900 font-semibold">{user?.employeeId || 'N/A'}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Fingerprint className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Username</span>
                </div>
                <span className="text-slate-900 font-semibold">{user?.username || 'N/A'}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Building className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Department</span>
                </div>
                <span className="text-slate-900 font-semibold">{user?.department || 'N/A'}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Designation</span>
                </div>
                <span className="text-slate-900 font-semibold">{user?.designation || 'N/A'}</span>
              </div>
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">User Role</span>
                </div>
                <span className="text-slate-900 font-semibold">{user?.role || 'N/A'}</span>
              </div>
              <div className="py-3 flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Allowed Branches</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1 pl-6">
                  {user?.allowedBranches && user.allowedBranches.length > 0 ? (
                    user.allowedBranches.map((branch) => (
                      <span key={branch} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-md border border-indigo-100 font-medium">
                        {branch}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </div>
              </div>
              <div className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <CalendarDays className="w-4 h-4 text-slate-400" />
                  <span className="font-medium">Password Expiry</span>
                </div>
                <span className={`font-semibold ${
                  getDaysRemaining().includes('0 Days') || getDaysRemaining().includes('1 Day') 
                    ? 'text-rose-600' 
                    : getDaysRemaining() === 'No Expiry' 
                      ? 'text-emerald-600' 
                      : 'text-indigo-600'
                }`}>
                  {getDaysRemaining()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security Settings */}
        <div className="md:col-span-2 space-y-8">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                Electronic Signature Security
              </CardTitle>
              <CardDescription>
                Update your password to change your electronic signature credential.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  {showReauth && (
                    <div className="space-y-2 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                      <Label htmlFor="current-password">Current Password (to confirm)</Label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input 
                          id="current-password"
                          type={showCurrentPassword ? "text" : "password"} 
                          placeholder="Enter current password" 
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="rounded-xl h-12 bg-white border-none pl-11 pr-12 focus-visible:ring-indigo-500 w-full"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Signature Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        id="new-password"
                        type={showNewPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setIsPasswordDirty(true);
                        }}
                        className="rounded-xl h-12 bg-slate-50 border-none pl-11 pr-12 focus-visible:ring-indigo-500 w-full"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">Policy: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol</p>
                    {isPasswordDirty && getMissingPasswordRequirements(newPassword).length > 0 && (
                      <p className="text-[11px] text-rose-500 font-bold bg-rose-50/50 p-3 rounded-xl border border-rose-100 flex flex-wrap gap-1.5 mt-2">
                        <span>Missing:</span>
                        {getMissingPasswordRequirements(newPassword).map((req) => (
                          <Badge key={req} className="bg-rose-100 hover:bg-rose-100/80 text-rose-700 border-none text-[10px] py-0.5 px-2 font-bold rounded">
                            {req}
                          </Badge>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"} 
                        placeholder="Repeat new password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="rounded-xl h-12 bg-slate-50 border-none pl-11 pr-12 focus-visible:ring-indigo-500 w-full"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Important:</strong> Your login password is used for electronic signatures (21 CFR Part 11). 
                    Changing it here will update both your login and signature credentials.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  disabled={isLoading || !newPassword}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 h-12 shadow-lg shadow-indigo-100"
                >
                  {isLoading ? 'Updating...' : 'Update Signature Password'}
                  <Save className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-slate-900 text-white">
            <CardContent className="p-8 flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Compliance Status</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Your account is currently active and authorized for electronic signatures in accordance with 21 CFR Part 11 requirements.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
