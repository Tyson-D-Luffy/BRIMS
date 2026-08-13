import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, googleProvider, FirebaseUser } from '../firebase';
import { User } from '../types';
import api from '../services/api';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
  completePasswordResetSuccess: (user: User, token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('brims_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      // 1. Wait for Firebase Auth to initialize/restore state first.
      // This is crucial because Firebase Auth is async, and we must wait for it to run
      // so `auth.currentUser` is non-null when `/auth/me` is called in case of 401.
      let resolved = false;
      const getInitialFirebaseUser = new Promise<FirebaseUser | null>((resolve) => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
          unsub();
          resolved = true;
          resolve(firebaseUser);
        });
        
        // Safety timeout to prevent infinite blocking of the app startup
        setTimeout(() => {
          if (!resolved) {
            resolve(null);
          }
        }, 1500);
      });

      await getInitialFirebaseUser;

      const savedToken = localStorage.getItem('brims_token');
      if (savedToken) {
        try {
          // Use the api service which already has interceptors for the token
          const response = await api.get('/auth/me');
          if (response.data.success) {
            setUser(response.data.user);
            setToken(savedToken);
            if (!localStorage.getItem('brims_auth_method')) {
              localStorage.setItem('brims_auth_method', 'credentials');
            }
          } else {
            localStorage.removeItem('brims_token');
            localStorage.removeItem('brims_auth_method');
            setToken(null);
            setUser(null);
          }
        } catch (error: any) {
          console.log("Token validation info: Previous session expired or invalid. Cleared local credentials.");
          localStorage.removeItem('brims_token');
          localStorage.removeItem('brims_auth_method');
          setToken(null);
          setUser(null);
        }
      }
      
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          if (firebaseUser.isAnonymous) {
            console.log("Client signed in anonymously for Firestore access.");
            setLoading(false);
            return;
          }
          try {
            const idToken = await firebaseUser.getIdToken();
            
            const response = await api.post('/auth/login', { idToken });

            if (response.data.success) {
              localStorage.setItem('brims_token', response.data.token);
              localStorage.setItem('brims_auth_method', 'firebase');
              setToken(response.data.token);
              setUser(response.data.user);
            }
          } catch (error) {
            console.error("Auth sync error:", error);
          }
        } else {
          const authMethod = localStorage.getItem('brims_auth_method');
          if (authMethod === 'firebase' || !authMethod) {
            setUser(null);
            setToken(null);
            localStorage.removeItem('brims_token');
            localStorage.removeItem('brims_auth_method');
          } else if (authMethod === 'credentials') {
            // Automatically establish anonymous Firebase session for Firestore subscription access
            try {
              const { signInAnonymously } = await import('firebase/auth');
              await signInAnonymously(auth);
            } catch (err) {
              console.warn("Failed to establish anonymous Firebase session (benign if offline):", err);
            }
          }
        }
        setLoading(false);
      });

      return unsubscribe;
    };

    const unsubscribePromise = initAuth();
    return () => {
      unsubscribePromise.then(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
    };
  }, []);

  // Monitor inactivity based on user session timeout settings (GMP compliance)
  useEffect(() => {
    if (!user) return;

    const timeoutMinutes = user.sessionTimeout || 30;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    let timer: NodeJS.Timeout;

    const performInactivityLogout = () => {
      console.log(`Inactivity limit reached: ${timeoutMinutes} minutes`);
      toast.error('Your session has expired due to inactivity in accordance with GMP security requirements.', {
        duration: 12000
      });
      logout();
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(performInactivityLogout, timeoutMs);
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    // Initialize timer
    resetTimer();

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login-credentials', { email, password });
      if (response.data.success) {
        localStorage.setItem('brims_token', response.data.token);
        localStorage.setItem('brims_auth_method', 'credentials');
        setToken(response.data.token);
        setUser(response.data.user);
        
        // Immediately establish anonymous Firebase session for Firestore subscription access
        try {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
        } catch (err) {
          console.warn("Failed to establish anonymous Firebase session on login (benign if offline):", err);
        }
      } else {
        throw new Error(response.data.message || "Failed to login");
      }
    } catch (error: any) {
      console.error("Email login failed", error);
      // Preserve auth error code structure for Login.tsx failure logging
      if (error.response?.data) {
        const serverError = new Error(error.response.data.message || "Failed to log in");
        (serverError as any).code = error.response.data.code || "auth/invalid-credential";
        throw serverError;
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('brims_token');
      localStorage.removeItem('brims_auth_method');
      setToken(null);
      setUser(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const completePasswordResetSuccess = (updatedUser: User, updatedToken: string) => {
    localStorage.setItem('brims_token', updatedToken);
    localStorage.setItem('brims_auth_method', 'credentials');
    setToken(updatedToken);
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithEmail, logout, token, completePasswordResetSuccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
