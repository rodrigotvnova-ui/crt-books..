import { useCallback, useEffect, useState } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [checkingConnection, setCheckingConnection] = useState<boolean>(false);

  const verifyConnectionNow = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return true;
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    setCheckingConnection(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch('/manifest.webmanifest', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const onlineNow = res.ok;
      setIsOnline(onlineNow);
      return onlineNow;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setCheckingConnection(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    checkingConnection,
    verifyConnectionNow,
  };
}
