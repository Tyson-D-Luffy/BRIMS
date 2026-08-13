import React, { useState } from 'react';
import { useNotifications } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';
import { 
  Search, 
  Info, 
  AlertTriangle, 
  XCircle, 
  CheckCircle, 
  Check, 
  Bell, 
  Trash2,
  Calendar,
  Sparkles,
  Inbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function NotificationsEmbed() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const getIsRead = (n: any) => {
    return n.targetType === 'USER' ? n.isRead : n.readBy?.includes(user?.uid || '');
  };

  const filteredNotifications = notifications.filter(n => {
    const isRead = getIsRead(n);
    
    // Status Filter
    if (filter === 'unread' && isRead) return false;
    if (filter === 'read' && !isRead) return false;

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = n.title?.toLowerCase().includes(q);
      const matchMsg = n.message?.toLowerCase().includes(q);
      const matchType = n.type?.toLowerCase().includes(q);
      return matchTitle || matchMsg || matchType;
    }

    return true;
  });

  const handleNotificationClick = async (n: any) => {
    if (!getIsRead(n)) {
      await markAsRead(n.id);
    }
    if (n.link) {
      if (n.link.startsWith('/')) {
        try {
          if (window.parent && (window.parent as any).__appNavigate) {
            (window.parent as any).__appNavigate(n.link);
            return;
          }
        } catch (e) {
          console.error("Failed parent navigation fallback to direct parent loc:", e);
        }
      }
      // In iframes, window.parent.location can be used if they share single origin
      try {
        window.parent.location.href = n.link;
      } catch (e) {
        window.location.href = n.link;
      }
    }
  };

  return (
    <div id="notifications-embed-root" className="min-h-screen bg-slate-50/50 p-4 md:p-6 flex flex-col font-sans select-none antialiased">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-600 animate-swing" />
            System Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit logs and real-time operational alerts for {user?.displayName || 'User'}.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button 
            onClick={() => markAllAsRead()}
            variant="outline"
            size="sm"
            className="rounded-full text-xs font-semibold px-4 border-slate-200 hover:bg-slate-100/80 hover:text-slate-900 shadow-sm self-start sm:self-auto"
          >
            <Check className="w-4 h-4 mr-1.5 text-indigo-600" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Main Container with Search and Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex-1 flex flex-col overflow-hidden max-h-[calc(100vh-100px)]">
        
        {/* Search & Tabs Controls bar */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              type="text"
              placeholder="Search notifications by keyword, title, or alert level..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-indigo-500/30 h-10 w-full"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                filter === 'all' 
                  ? 'bg-slate-900 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              All Logs ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all flex items-center gap-1 ${
                filter === 'unread' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100/50'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                filter === 'read' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              Read ({notifications.length - unreadCount})
            </button>
          </div>
        </div>

        {/* Scrollable List Container */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scroll-area">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[280px]">
              <div className="p-4 bg-slate-50 rounded-2xl mb-3">
                <Inbox className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No matching notifications</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {searchQuery ? "Try searching for a different keyword or check your spelling." : "You're all caught up with your notifications!"}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const isRead = getIsRead(n);
              return (
                <div 
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 md:p-5 hover:bg-slate-50/80 transition-all cursor-pointer flex gap-4 relative group ${
                    !isRead ? 'bg-indigo-50/10' : ''
                  }`}
                >
                  {/* Status Indicator Bar */}
                  {!isRead && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r" />
                  )}

                  {/* Icon Indicator based on Type */}
                  <div className="mt-0.5 flex-shrink-0">
                    {n.type === 'SUCCESS' && (
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    )}
                    {n.type === 'INFO' && (
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                        <Info className="w-5 h-5" />
                      </div>
                    )}
                    {n.type === 'WARNING' && (
                      <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                    )}
                    {n.type === 'ERROR' && (
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                        <XCircle className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Notification Details */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className={`text-sm font-bold tracking-tight ${!isRead ? 'text-slate-900' : 'text-slate-700 line-clamp-1'}`}>
                          {n.title}
                        </h3>
                        {n.targetType === 'ROLE' && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 uppercase font-bold bg-slate-100 text-slate-500 rounded">
                            Role: {n.targetId}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-1 rounded font-medium flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className={`text-xs leading-relaxed ${!isRead ? 'text-slate-600font-medium' : 'text-slate-500'}`}>
                      {n.message}
                    </p>

                    {/* Mark as read link overlay badge */}
                    <div className="flex items-center justify-between pt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!isRead ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(n.id);
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                        >
                          <Check className="w-3 h-3" />
                          Mark as Read
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          Read
                        </span>
                      )}
                      {n.link && (
                        <span className="text-[10px] text-slate-400 group-hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors">
                          View details &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        .custom-scroll-area::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scroll-area::-webkit-scrollbar-track {
          background: #f8fafc;
        }
        .custom-scroll-area::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        /* swing animation for bell */
        @keyframes swing {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(10deg); }
          30% { transform: rotate(-10deg); }
          50% { transform: rotate(5deg); }
          70% { transform: rotate(-5deg); }
          90% { transform: rotate(3deg); }
        }
        .animate-swing {
          animation: swing 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
