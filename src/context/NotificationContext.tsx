import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { db, collection, query, where, onSnapshot, orderBy, limit, auth, doc } from '../firebase';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged } from 'firebase/auth';
import api from '../services/api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  targetType: 'USER' | 'ROLE';
  targetId: string;
  isRead: boolean;
  readBy: string[];
  link?: string;
  createdAt: string;
  eventType?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [rawNotifications, setRawNotifications] = useState<Notification[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<string[]>([]);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [isFirebaseAuthed, setIsFirebaseAuthed] = useState(auth.currentUser !== null);
  const socketRef = useRef<Socket | null>(null);

  // Keep a ref of userSubscriptions to avoid stale closures in the WebSocket listener
  const userSubscriptionsRef = useRef<string[]>([]);
  useEffect(() => {
    userSubscriptionsRef.current = userSubscriptions;
  }, [userSubscriptions]);

  useEffect(() => {
    return onAuthStateChanged(auth, (fUser) => {
      setIsFirebaseAuthed(fUser !== null);
    });
  }, []);

  useEffect(() => {
    if (!user || !isFirebaseAuthed) {
      if (!user) {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
        setIsConnected(false);
      }
      setRawNotifications([]);
      setUserSubscriptions([]);
      setLocalReadIds(new Set());
      return;
    }

    // Subscribe to user's custom event subscriptions
    const unsubSub = onSnapshot(doc(db, 'subscriptions', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserSubscriptions(docSnap.data().eventTypes || []);
      } else {
        setUserSubscriptions([]);
      }
    }, (error) => {
      console.error("Failed to load user subscriptions:", error);
    });

    // Initialize WebSocket connection
    const initSocket = async () => {
      const token = await auth.currentUser?.getIdToken();
      
      const socket = io({
        auth: { token },
        transports: ['polling']
      });

      socket.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to notification server');
        socket.emit('join-role', user.role);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from notification server');
      });

      socket.on('notification', (notification: Notification) => {
        // Filter incoming real-time notifications by the same rules
        const isTargeted = 
          (notification.targetType === 'USER' && notification.targetId === user.uid) ||
          (notification.targetType === 'ROLE' && notification.targetId?.toUpperCase() === user.role?.toUpperCase()) ||
          (notification.eventType && (
            userSubscriptionsRef.current.includes(notification.eventType) ||
            user.permissions?.includes(notification.eventType) ||
            user.role?.toLowerCase() === 'admin'
          ));

        if (!isTargeted) return;

        setRawNotifications(prev => {
          // Prevent duplicates
          if (prev.some(n => n.id === notification.id)) return prev;
          
          const updated = [notification, ...prev];
          return updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        });
        
        toast(notification.title, { 
          description: notification.message,
          action: notification.link ? {
            label: 'View',
            onClick: () => window.location.href = notification.link!
          } : undefined
        });
      });

      socketRef.current = socket;
    };

    initSocket();

    // Query all the latest notifications so that subscription matches are completely checked
    const qAll = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubAll = onSnapshot(qAll, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setRawNotifications(allDocs);
    });

    return () => {
      unsubSub();
      unsubAll();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, isFirebaseAuthed]);

  // Derived filtered notifications based on user subscription choices and Roles/Permissions Matrix
  const filteredNotifications = rawNotifications.filter(n => {
    if (!user) return false;

    // 1. Target matches user directly
    if (n.targetType === 'USER' && n.targetId === user.uid) {
      return true;
    }

    // 2. Target matches user's role
    if (n.targetType === 'ROLE' && n.targetId?.toUpperCase() === user.role?.toUpperCase()) {
      return true;
    }

    // 3. Match by Event Subscription (explicitly selected or automatically granted by Roles/Permissions Matrix)
    if (n.eventType) {
      const hasSubscribed = userSubscriptions.includes(n.eventType);
      const hasPermission = user.permissions?.includes(n.eventType) || user.role?.toLowerCase() === 'admin';
      if (hasSubscribed || hasPermission) {
        return true;
      }
    }

    return false;
  });

  // Apply local optimistic reads
  const notifications = filteredNotifications.map(n => {
    if (localReadIds.has(n.id)) {
      return {
        ...n,
        isRead: true,
        readBy: n.readBy ? (n.readBy.includes(user?.uid || '') ? n.readBy : [...n.readBy, user?.uid || '']) : [user?.uid || '']
      };
    }
    return n;
  });

  const unreadCount = notifications.filter(n => {
    if (n.targetType === 'USER') return !n.isRead;
    return !n.readBy?.includes(user?.uid || '');
  }).length;

  const markAsRead = async (id: string) => {
    // Optimistic update
    setLocalReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      await api.post(`/notifications/${id}/read`);
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const markAllAsRead = async () => {
    // Optimistic update
    const allIds = notifications.map(n => n.id);
    setLocalReadIds(prev => {
      const next = new Set(prev);
      allIds.forEach(id => next.add(id));
      return next;
    });

    try {
      await api.post('/notifications/read-all');
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, isConnected }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};
