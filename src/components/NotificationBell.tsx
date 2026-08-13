import React, { useState, useEffect } from 'react';
import { Bell, Info, AlertTriangle, XCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/context/NotificationContext';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isConnected } = useNotifications();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleNotificationClick = async (notification: any) => {
    await markAsRead(notification.id);
    setOpen(false);
    if (notification.link) {
      if (notification.link.startsWith('/')) {
        navigate(notification.link);
      } else {
        window.location.href = notification.link;
      }
    }
  };

  const unreadNotifications = notifications.filter((n) => {
    const isRead = n.targetType === 'USER' ? n.isRead : n.readBy?.includes(user?.uid || '');
    return !isRead;
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="relative p-2 hover:bg-slate-100 rounded-full transition-colors">
          <Bell className={`h-5 w-5 ${isConnected ? 'text-slate-600' : 'text-slate-300'}`} />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 hover:bg-red-600"
            >
              {unreadCount}
            </Badge>
          )}
          {!isConnected && (
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-amber-400 border border-white" title="Reconnecting..." />
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 rounded-2xl shadow-xl border-none" align="end">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-100 text-slate-600">
                  {unreadCount}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => markAllAsRead()}
                className="h-8 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2"
              >
                <Check className="w-3 h-3 mr-1" />
                Mark all as read
              </Button>
            )}
          </div>
          <div className="h-[350px] overflow-y-auto custom-scrollbar">
            {unreadNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-sm">
                No unread notifications
              </div>
            ) : (
              <div className="divide-y divide-slate-50 pr-1">
                {unreadNotifications.map((n) => {
                  const isRead = n.targetType === 'USER' ? n.isRead : n.readBy?.includes(user?.uid || '');
                  return (
                    <div 
                      key={n.id} 
                      className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${!isRead ? 'bg-blue-50/30' : ''}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex gap-3">
                        <div className="mt-0.5">
                          {n.type === 'INFO' && <Info className="h-4 w-4 text-blue-500" />}
                          {n.type === 'WARNING' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          {n.type === 'ERROR' && <XCircle className="h-4 w-4 text-red-500" />}
                          {n.type === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-medium ${!isRead ? 'text-slate-900' : 'text-slate-600'}`}>
                              {n.title}
                            </p>
                            {n.targetType === 'ROLE' && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase">
                                {n.targetId}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">{n.message}</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[9px] font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(n.id);
                                }}
                              >
                                <Check className="w-3 h-3 mr-0.5" />
                                Mark Read
                              </Button>
                              {n.link && <ExternalLink className="h-3 w-3 text-slate-300" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};
