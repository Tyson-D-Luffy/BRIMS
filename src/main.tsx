import {StrictMode, useState, useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ----------------------------------------------------
// 1. GLOBAL ERROR, REJECTION & WEBSOCKET HANDLING (Requirement 4)
// ----------------------------------------------------
// Gracefully filter out standard harmless Vite HMR connection warnings/errors and Firestore BloomFilter warnings/errors from the console globally in all environments
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const msg = args.map(arg => String(arg)).join(' ');
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
    msg.includes('Invalid hash count')
  ) {
    console.debug('[Suppressed Node WebSocket/Firebase error]', ...args);
    return;
  }
  originalConsoleError(...args);
};

console.warn = (...args) => {
  const msg = args.map(arg => String(arg)).join(' ');
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
    msg.includes('Invalid hash count')
  ) {
    console.debug('[Suppressed Node WebSocket/Firebase warning]', ...args);
    return;
  }
  originalConsoleWarn(...args);
};

if ((import.meta as any).env.DEV) {
  // Wrap original WebSocket constructor to prevent uncaught exceptions under proxies
  const OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket) {
    class SafeWebSocket extends OriginalWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        
        // Suppress unhandled exceptions inside the browser engine
        this.addEventListener('error', (event) => {
          console.debug('SafeWebSocket suppressed connection handshake issue:', event);
          // Prevent standard error propagation
          event.stopImmediatePropagation();
        }, { capture: true });

        this.addEventListener('close', (event) => {
          console.debug('SafeWebSocket closed gracefully:', event);
        }, { capture: true });
      }
    }
    // Set writable/configurable properties to bypass seal checks
    Object.defineProperty(window, 'WebSocket', {
      value: SafeWebSocket,
      configurable: true,
      writable: true
    });
  }

  // Catch unhandled promise rejections (like "WebSocket closed without opened.")
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason);
    if (
      msg.includes('WebSocket') ||
      msg.includes('closed without opened') ||
      msg.includes('socket') ||
      msg.includes('HMR')
    ) {
      console.debug('Caught unhandled WebSocket rejection smoothly:', msg);
      event.preventDefault(); // Prevents console crash/popups from this rejection
    }
  });

  // Catch synchronous window errors related to WebSockets
  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = String(message);
    if (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('HMR')
    ) {
      console.debug('Caught window WebSocket error gracefully:', msg);
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
