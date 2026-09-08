import React, { useState, useEffect } from 'react';
import { Bell, Mail, Shield, Save, CheckCircle2, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import api from '../services/api';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const PERMISSIONS_CATEGORIES = [
  {
    category: "Product Master",
    events: [
      { id: "create:product", name: "Create Product Master", desc: "Notification on creation of new product specifications" },
      { id: "edit:product", name: "Edit Product Master", desc: "Notification on changes made to active product masters" },
      { id: "product:submit", name: "Submit Product Master", desc: "Notification when product master is submitted for GAMP review" },
      { id: "product:review", name: "Review Product Master", desc: "Notification when product master is submitted for review" },
      { id: "product:approve", name: "Approve Product Master", desc: "Notification when product master has been approved" }
    ]
  },
  {
    category: "Batch Issuance & Production",
    events: [
      { id: "batch:create", name: "Create New Batch Request", desc: "Notification on registration of a new batch sheet request" },
      { id: "batch:review", name: "Pending for Review Batch Request", desc: "Notification when a batch sheet request is pending secondary review" },
      { id: "batch:approve", name: "Approve Batch Request", desc: "Notification when a batch sheet has been formally approved" },
      { id: "batch:issue", name: "Issue Batch Sheet", desc: "Notification when a batch sheet has been authorized and issued" },
      { id: "batch:print", name: "Print Batch Sheet", desc: "Notification when a physical batch sheet is printed" },
      { id: "batch:preview", name: "Preview PDF", desc: "Notification when an electronic PDF record is generated for review" },
      { id: "batch:status", name: "Change Production Status", desc: "Notification when production state transitions are modified" },
      { id: "batch:close", name: "Close Batch Sheet", desc: "Notification when production is completed and sheet is locked" }
    ]
  },
  {
    category: "Compliance & System Operations",
    events: [
      { id: "audit:view", name: "View Audit Trail", desc: "Notification when sensitive system logs or compliance parameters are audited" },
      { id: "user:manage", name: "Manage Users", desc: "Notification on credential additions, role modifications, or lockouts" }
    ]
  },
  {
    category: "Master Configurations",
    events: [
      { id: "department:create", name: "Department Master: Create", desc: "Notify when a new functional department is added" },
      { id: "department:submit", name: "Department Master: Submit", desc: "Notify when a department master is submitted for approval" },
      { id: "department:approve", name: "Department Master: Approve", desc: "Notify when a department master is verified and approved" },
      { id: "designation:create", name: "Designation Master: Create", desc: "Notify when a new organizational designation is registered" },
      { id: "designation:submit", name: "Designation Master: Submit", desc: "Notify when a designation master is submitted for compliance check" },
      { id: "designation:approve", name: "Designation Master: Approve", desc: "Notify when a designation is authorized for assignment" }
    ]
  },
  {
    category: "Formula & Sequence Setup",
    events: [
      { id: "batch_number:create", name: "Batch Number: Create", desc: "Notify when a new batch identification series is created" },
      { id: "batch_number:submit", name: "Batch Number: Submit", desc: "Notify when a batch sequence is submitted for secondary sign-off" },
      { id: "batch_number:approve", name: "Batch Number: Approve", desc: "Notify when a batch sequence code formula is activated" },
      { id: "format:create", name: "Format Layout: Create/Edit", desc: "Notify when a GxP batch record format layout is modified" },
      { id: "format:submit", name: "Format Layout: Submit", desc: "Notify when a format layout draft is completed for review" },
      { id: "format:approve", name: "Format Layout: Approve", desc: "Notify when a format layout has been finalized" }
    ]
  },
  {
    category: "Lookup Registers & Operational Status",
    events: [
      { id: "product:reject", name: "Reject Product Master", desc: "Notify when product master draft is rejected" },
      { id: "product:return", name: "Return Product Master", desc: "Notify when product master draft is returned for correction" },
      { id: "product:deactivate", name: "Deactivate Product Master", desc: "Notify when an active product master is deactivated" },
      { id: "lookup:create", name: "Master Lookup: Create", desc: "Notify when global lookup registers are added" },
      { id: "lookup:submit", name: "Master Lookup: Submit", desc: "Notify when lookup data is submitted for authorization" },
      { id: "lookup:approve", name: "Master Lookup: Approve", desc: "Notify when lookup registers are approved and locked" },
      { id: "op:issued", name: "Operational: Issued", desc: "Notify when production materials are officially issued" },
      { id: "op:ready_for_handover", name: "Operational: Ready for Handover", desc: "Notify when batch custody transfer is prepared" },
      { id: "op:production_in_progress", name: "Operational: Received by Production", desc: "Notify when batch is received by production" },
      { id: "op:ready_for_qa_review", name: "Operational: Send for QA Review", desc: "Notify when batch is sent for QA review" },
      { id: "op:completed", name: "Operational: QA Received", desc: "Notify when batch has been received by QA" },
      { id: "op:return_for_correction", name: "Operational: Return For Correction", desc: "Notify when batch sheet is returned for correction" }
    ]
  }
];

export default function Settings() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(['IN_APP']);
  const [saving, setSaving] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [loadingOutbox, setLoadingOutbox] = useState(false);
  const [activeOutboxEmail, setActiveOutboxEmail] = useState<any | null>(null);

  useEffect(() => {
    fetchSubscriptions();
    fetchOutbox();
  }, []);

  useEffect(() => {
    if (user?.email) {
      setTestEmailAddress(user.email);
    }
  }, [user]);

  const fetchOutbox = async () => {
    setLoadingOutbox(true);
    try {
      const res = await api.get('/notifications/outbox');
      if (res.data.success) {
        setOutbox(res.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch simulated outbox emails", error);
    } finally {
      setLoadingOutbox(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error("Please enter a valid recipient email address");
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.post('/notifications/test-email', { to: testEmailAddress });
      if (res.data.success) {
        toast.success(res.data.message || `Test email dispatched to ${testEmailAddress}`);
        setTimeout(() => {
          fetchOutbox();
        }, 1200);
      } else {
        toast.error("Failed to trigger test email");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || "Failed to trigger test email");
    } finally {
      setSendingTest(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await api.get('/subscriptions/me');
      if (res.data.success) {
        setSubscriptions(res.data.data.eventTypes || []);
        setChannels(res.data.data.channels || ['IN_APP']);
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.post('/subscriptions/me', { 
        eventTypes: subscriptions, 
        channels 
      });
      if (res.data.success) {
        toast.success("Settings saved successfully");
      }
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (id: string) => {
    setSubscriptions(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const toggleChannel = (id: string) => {
    setChannels(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500">Manage your account preferences and notifications</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600" />
                Event Subscriptions
              </CardTitle>
              <CardDescription>
                System task events linked to your Roles/Permissions Matrix. You automatically receive alerts for tasks you have permission to perform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {PERMISSIONS_CATEGORIES.map((cat, catIdx) => (
                <div key={catIdx} className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100/80 pb-2">
                    <span className="w-1.5 h-3.5 bg-indigo-600 rounded-full shrink-0" />
                    {cat.category}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.events.map((event) => {
                      const hasPermission = user?.permissions?.includes(event.id) || user?.role?.toLowerCase() === 'admin';
                      const isChecked = subscriptions.includes(event.id) || hasPermission;
                      
                      return (
                        <div 
                          key={event.id} 
                          className={`flex items-start gap-3 p-3 rounded-xl bg-white border transition-all ${
                            isChecked 
                              ? 'border-indigo-100 bg-indigo-50/5 hover:border-indigo-200' 
                              : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="pt-0.5">
                            <Checkbox 
                              id={event.id} 
                              checked={isChecked}
                              disabled={hasPermission}
                              onCheckedChange={() => toggleEvent(event.id)}
                            />
                          </div>
                          <div className="grid gap-1 leading-none flex-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <Label 
                                htmlFor={event.id} 
                                className={`text-xs font-bold leading-tight cursor-pointer ${
                                  hasPermission ? 'text-slate-900' : 'text-slate-800'
                                }`}
                              >
                                {event.name}
                              </Label>
                              {hasPermission && (
                                <Badge 
                                  variant="secondary" 
                                  className="text-[9px] font-extrabold bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 border-none px-1.5 py-0 select-none scale-95 shrink-0"
                                >
                                  Granted by Matrix
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">
                              {event.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                Security & Compliance
              </CardTitle>
              <CardDescription>
                Configure your security settings and 21 CFR Part 11 preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Session Timeout</Label>
                  <p className="text-xs text-slate-500">Automatically log out after 15 minutes of inactivity</p>
                </div>
                <Badge variant="secondary">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">E-Signature Confirmation</Label>
                  <p className="text-xs text-slate-500">Require password for every electronic signature</p>
                </div>
                <Badge variant="secondary">Required</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Notification Channels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  channels.includes('IN_APP') ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100'
                }`}
                onClick={() => toggleChannel('IN_APP')}
              >
                <div className={`p-2 rounded-md ${channels.includes('IN_APP') ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">In-App</p>
                  <p className="text-[10px] text-slate-500">Real-time alerts in dashboard</p>
                </div>
                {channels.includes('IN_APP') && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
              </div>

              <div 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  channels.includes('EMAIL') ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100'
                }`}
                onClick={() => toggleChannel('EMAIL')}
              >
                <div className={`p-2 rounded-md ${channels.includes('EMAIL') ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Mail className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Email</p>
                  <p className="text-[10px] text-slate-500">Daily summary & critical alerts</p>
                </div>
                {channels.includes('EMAIL') && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-indigo-600" />
                Email Diagnostics
              </CardTitle>
              <CardDescription className="text-xs">
                Verify system delivery behavior. Sends a test notification to your email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="testEmailInput" className="text-[10px] text-slate-500 font-medium">Recipient Email</Label>
                <input
                  id="testEmailInput"
                  type="email"
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 bg-white text-slate-900 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="name@domain.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={handleSendTestEmail}
                disabled={sendingTest || !testEmailAddress}
              >
                {sendingTest ? "Sending Test..." : "Send Test Alert"}
              </Button>

              <div className="mt-2 p-2 bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-600 space-y-1 flex flex-col">
                <div className="flex items-center gap-1 text-slate-700 font-semibold mb-0.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  Connection Sandbox Notice
                </div>
                <span>
                  The cloud sandbox uses a mock-simulated dispatch by default. Live SMTP dispatch is automatically triggered if 
                  <code className="bg-slate-200 px-1 py-0.5 rounded font-mono select-all ml-1 text-[9px]">SMTP_HOST</code> exists in configuration.
                </span>
              </div>

              {outbox.some(m => m.status === 'FAILED' && m.error?.toLowerCase().includes('535')) && (
                <div className="mt-3 p-2.5 bg-rose-50 border border-rose-150 rounded-lg text-[10px] text-rose-800 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 font-bold text-rose-900">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    SMTP Authentication Error Detected (Code 535)
                  </div>
                  <p className="leading-relaxed text-rose-700">
                    Your SMTP server rejected the username or password. If you are using Google/Gmail:
                  </p>
                  <ul className="list-disc pl-4 text-rose-700 space-y-0.5 font-medium">
                    <li>Enable <strong>2-Step Verification</strong> on your Google Account.</li>
                    <li>Generate a 16-character <strong>App Password</strong> in your Google Account Security settings.</li>
                    <li>Ensure you paste that 16-character code as the <code className="bg-rose-100 px-1 rounded font-mono text-[9px]">SMTP_PASS</code> environment variable without any spaces.</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  Simulated Outbox Log
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-6 h-6 hover:bg-slate-100" 
                  onClick={fetchOutbox} 
                  disabled={loadingOutbox}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loadingOutbox ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <CardDescription className="text-xs">
                Review compiled headers & rich HTML templates dispatched by the notification engine.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {outbox.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-100 rounded-lg">
                  <p className="text-[10px] text-slate-400">No emails have been dispatched yet.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {outbox.map((mail, idx) => {
                    const isExpanded = activeOutboxEmail?.id === mail.id;
                    return (
                      <div 
                        key={mail.id || idx} 
                        className="p-2.5 border border-slate-150 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setActiveOutboxEmail(isExpanded ? null : mail)}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="truncate flex-1">
                            <p className="text-[11px] font-semibold text-slate-800 truncate">{mail.subject}</p>
                            <p className="text-[10px] text-slate-500 truncate">To: {mail.to}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant={mail.deliveryType === 'SMTP' ? 'default' : 'secondary'} className="text-[8px] px-1 py-0 select-none scale-95 shrink-0">
                              {mail.deliveryType || 'Simulation'}
                            </Badge>
                            {mail.status && (
                              <Badge 
                                variant={mail.status === 'SENT' ? 'default' : mail.status === 'FAILED' ? 'destructive' : 'secondary'} 
                                className="text-[7px] px-1 py-0 select-none scale-90 font-mono tracking-wider shrink-0"
                              >
                                {mail.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-slate-200 space-y-2 animate-in fade-in duration-200">
                            {mail.error && (
                              <div className="text-[9.5px] font-mono p-2 rounded bg-rose-50 text-rose-700 border border-rose-100 leading-tight">
                                <strong>SMTP Delivery Error:</strong> {mail.error}
                              </div>
                            )}
                            <p className="text-[10px] text-slate-600 font-mono leading-relaxed bg-white p-2 rounded border border-slate-100 whitespace-pre-wrap">
                              {mail.message}
                            </p>
                            <div className="text-[9px] text-slate-400 flex justify-between items-center bg-slate-100/50 px-1 py-0.5 rounded">
                              <span>Sent: {new Date(mail.sentAt).toLocaleTimeString()}</span>
                              <span className="text-indigo-600 font-semibold">Click to collapse</span>
                            </div>
                            {mail.htmlContent && (
                              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-left">
                                <div className="bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500 border-b border-slate-200">
                                  Pre-rendered HTML template view:
                                </div>
                                <div 
                                  className="p-3 bg-white max-h-[220px] overflow-y-auto text-[11px] leading-relaxed select-all"
                                  dangerouslySetInnerHTML={{ __html: mail.htmlContent }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Compliance Note</h4>
            <p className="text-[10px] text-amber-700 leading-relaxed">
              Notification settings are audited. Any changes to your subscription preferences will be logged in the system audit trail for regulatory review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
