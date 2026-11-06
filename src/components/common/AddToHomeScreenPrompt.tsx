import React, { useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

const isIOS = () => {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
};

const isInStandaloneMode = () => {
  return 'standalone' in window.navigator && window.navigator.standalone === true;
};

const DISMISS_KEY = 'a2hs_prompt_dismissed';

const AddToHomeScreenPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) {
      setDismissed(true);
      return;
    }
    // Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as InstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);

    // iOS
    if (isIOS() && !isInStandaloneMode()) {
      setShowIOS(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt && 'prompt' in deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setShowInstall(false));
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (dismissed) return null;

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-md w-full mx-2 bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 text-white rounded-2xl shadow-2xl border border-blue-200/30 flex items-center px-4 py-3 relative animate-fade-in">
      <div className="flex items-center gap-3 w-full">{children}</div>
      <button
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition"
        onClick={handleDismiss}
        aria-label="Dismiss add to home screen prompt"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.15"/>
          <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );

  const AppIcon = () => (
    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shadow-md">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="#2563eb"/>
        <path d="M8 12h8M12 8v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );

  if (showInstall) {
    return (
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <div className="pointer-events-auto w-full flex justify-center">
          <Card>
            <AppIcon />
            <div className="flex-1">
              <div className="font-semibold text-base">Install EasyBizInvoice</div>
              <div className="text-xs text-white/90 mt-0.5">Add this app to your home screen for a better experience.</div>
            </div>
            <button
              className="ml-2 bg-white text-blue-600 px-3 py-1.5 rounded-lg font-semibold text-sm shadow hover:bg-blue-100 transition"
              onClick={handleInstallClick}
            >
              Add
            </button>
          </Card>
        </div>
      </div>
    );
  }

  if (showIOS) {
    return (
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <div className="pointer-events-auto w-full flex justify-center">
          <Card>
            <AppIcon />
            <div className="flex-1">
              <div className="font-semibold text-base">Install EasyBizInvoice</div>
              <div className="text-xs text-white/90 mt-0.5">To install, tap <span className="font-bold">Share</span> then <span className="font-bold">Add to Home Screen</span>.</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};

export default AddToHomeScreenPrompt; 