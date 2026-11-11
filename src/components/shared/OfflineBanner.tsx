import { Download, WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '../../lib/brand';
import { Button } from '../ui/Button';
import { Dialog } from './Dialog';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * OfflineBanner:
 * Displays a clear banner with the MK logo only when the device is offline.
 */
export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full border-b border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2 text-xs font-medium text-[var(--danger)] flex items-center justify-center gap-2.5 no-print"
    >
      <BrandLogo size="xs" showText={false} />
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>You are offline. Reconnect to save</span>
    </div>
  );
};

/**
 * In-app PWA install button.
 */
export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setIosGuideOpen(true);
    }
  };

  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleInstall}
        aria-label="Install app"
      >
        <Download className="h-3.5 w-3.5 text-[var(--brand)]" />
        {!compact && <span>Install app</span>}
      </Button>

      <Dialog
        open={iosGuideOpen}
        onClose={() => setIosGuideOpen(false)}
        title="Install MK Solutions"
        maxWidth="sm"
        footer={
          <Button type="button" variant="primary" onClick={() => setIosGuideOpen(false)}>
            Done
          </Button>
        }
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text)]">
          <li>Tap the Share button in the Safari toolbar.</li>
          <li>Select Add to Home Screen.</li>
        </ol>
      </Dialog>
    </>
  );
};
