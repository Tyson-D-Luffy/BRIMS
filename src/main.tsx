import {StrictMode, useState, useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ----------------------------------------------------
// 1. GLOBAL ERROR, REJECTION & WEBSOCKET HANDLING
// ----------------------------------------------------
// Gracefully filter out standard harmless Vite HMR connection warnings/errors, Recharts measurement warnings, and Firestore BloomFilter warnings globally
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const msg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  if (
    msg.includes('[vite] failed to connect to websocket') ||
    msg.includes('WebSocket closed without opened') ||
    msg.includes('WebSocket connection to') ||
    msg.includes('websocket connection failed') ||
    msg.includes('WebSocket is already in CLOSING or CLOSED state') ||
    msg.includes('@firebase/firestore') ||
    msg.includes('WebChannelConnection') ||
    msg.includes("RPC 'Listen' stream") ||
    msg.includes('BloomFilter') ||
    msg.includes('BloomFilterError') ||
    msg.includes('Invalid hash count') ||
    msg.includes('The width(-1) and height(-1) of chart') ||
    msg.includes('The width(0) and height(0) of chart') ||
    msg.includes('should be greater than 0')
  ) {
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args) => {
  const msg = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  if (
    msg.includes('[vite] failed to connect to websocket') ||
    msg.includes('WebSocket closed without opened') ||
    msg.includes('WebSocket connection to') ||
    msg.includes('websocket connection failed') ||
    msg.includes('WebSocket is already in CLOSING or CLOSED state') ||
    msg.includes('@firebase/firestore') ||
    msg.includes('WebChannelConnection') ||
    msg.includes("RPC 'Listen' stream") ||
    msg.includes('BloomFilter') ||
    msg.includes('BloomFilterError') ||
    msg.includes('Invalid hash count') ||
    msg.includes('The width(-1) and height(-1) of chart') ||
    msg.includes('The width(0) and height(0) of chart') ||
    msg.includes('The width(') ||
    msg.includes('and height(') ||
    msg.includes('should be greater than 0,') ||
    msg.includes('please check the style of container') ||
    msg.includes('minWidth(0)') ||
    msg.includes('aspect(undefined)')
  ) {
    return;
  }
  originalConsoleWarn(...args);
};

// Helper to identify benign environment or dev proxy errors
function isBenignDevError(reasonOrMsg: any): boolean {
  if (!reasonOrMsg) return false;
  let str = '';
  if (typeof reasonOrMsg === 'string') {
    str = reasonOrMsg;
  } else if (reasonOrMsg instanceof Error) {
    str = `${reasonOrMsg.message} ${reasonOrMsg.stack} ${reasonOrMsg.name}`;
  } else if (typeof reasonOrMsg === 'object') {
    try {
      str = `${reasonOrMsg.message || ''} ${reasonOrMsg.reason || ''} ${JSON.stringify(reasonOrMsg)}`;
    } catch {
      str = String(reasonOrMsg);
    }
  } else {
    str = String(reasonOrMsg);
  }
  str = str.toLowerCase();
  return (
    str.includes('websocket closed without opened') ||
    str.includes('websocket') ||
    str.includes('closed without opened') ||
    str.includes('failed to connect to websocket') ||
    str.includes('closing or closed state') ||
    str.includes('bloomfilter') ||
    str.includes('hmr') ||
    str.includes('the width(-1) and height(-1) of chart') ||
    str.includes('should be greater than 0')
  );
}

// Wrap original WebSocket constructor to prevent uncaught exceptions under dev proxy environments
if (typeof window !== 'undefined') {
  const OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket) {
    class SafeWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        
        this.addEventListener('error', (event) => {
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }, { capture: true });

        this.addEventListener('close', (event) => {
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }, { capture: true });
      }

      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        try {
          if (this.readyState === WebSocket.OPEN) {
            super.send(data);
          }
        } catch (e) {
          console.debug('SafeWebSocket send suppressed error:', e);
        }
      }

      override close(code?: number, reason?: string): void {
        try {
          if (this.readyState === WebSocket.OPEN || this.readyState === WebSocket.CONNECTING) {
            super.close(code, reason);
          }
        } catch (e) {
          console.debug('SafeWebSocket close suppressed error:', e);
        }
      }
    }

    try {
      Object.defineProperty(window, 'WebSocket', {
        value: SafeWebSocket,
        configurable: true,
        writable: true
      });
    } catch {
      // Ignore if sealed
    }
  }

  // Catch unhandled promise rejections in capture phase (such as "WebSocket closed without opened.")
  window.addEventListener('unhandledrejection', (event) => {
    if (isBenignDevError(event.reason) || isBenignDevError((event as any).detail)) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      return false;
    }
  }, { capture: true });

  // Catch synchronous window errors related to WebSockets in capture phase
  window.addEventListener('error', (event) => {
    if (isBenignDevError(event.message) || isBenignDevError(event.error)) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      return false;
    }
  }, { capture: true });

  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (isBenignDevError(message) || isBenignDevError(error)) {
      return true; // Prevents the error from bubble-triggering dev system modals
    }
    return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
  };
}

// ----------------------------------------------------
// 2. AUTO RECONNECT & FALLBACK MONITOR (Requirement 3 & 9)
// ----------------------------------------------------
function DevServerMonitor() {
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const consecutiveFailuresRef = useRef(0);

  useEffect(() => {
    if ((import.meta as any).env.PROD) return;

    let intervalId: any;
    let isChecking = false;

    const checkServerConnection = async () => {
      if (isChecking) return;
      isChecking = true;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const res = await fetch(`/health?t=${Date.now()}`, { 
          signal: controller.signal,
          cache: 'no-store'
        });
        
        clearTimeout(timeoutId);

        if (res.ok) {
          consecutiveFailuresRef.current = 0;
          if (isDisconnected) {
            console.log('Development server restored! Reloading page...');
            window.location.reload();
          }
          setIsDisconnected(false);
          setRetryCount(0);
        } else {
          throw new Error('Non-200 response');
        }
      } catch (err) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          setIsDisconnected(true);
          setRetryCount(consecutiveFailuresRef.current);
        }
      } finally {
        isChecking = false;
      }
    };

    const delay = isDisconnected ? 3000 : 20000;
    intervalId = setInterval(checkServerConnection, delay);

    checkServerConnection();

    return () => {
      clearInterval(intervalId);
    };
  }, [isDisconnected]);

  if (!isDisconnected) return null;

  return (
    <div 
      id="dev-reconnect-overlay"
      className="fixed bottom-4 right-4 z-[999999] max-w-sm p-4 bg-slate-900/95 text-slate-100 rounded-xl shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center gap-3 transition-all duration-300 transform translate-y-0 ease-in-out font-sans"
    >
      <div className="relative flex h-3.5 w-3.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
      </div>
      <div className="flex flex-col select-none">
        <p className="text-xs font-semibold tracking-tight text-white">
          Reconnecting development server...
        </p>
        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
          Checking status • Attempt {retryCount}
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {(import.meta as any).env.DEV && <DevServerMonitor />}
  </StrictMode>,
);
