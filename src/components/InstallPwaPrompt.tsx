import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Smartphone, X, CheckCircle2, Share, PlusSquare, Info } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Check if already running in standalone display mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      setShowBanner(false);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iosDevice);

    // Listen for beforeinstallprompt event (Android / Chrome / Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSInstructions(true);
    }
  };

  // If already installed or banner dismissed by user, don't show unless triggered
  if (isInstalled || !showBanner) {
    return null;
  }

  // Show banner if deferredPrompt exists OR if device is iOS and not installed
  if (!deferredPrompt && !isIOS) {
    return null;
  }

  return (
    <>
      {/* Floating Bottom PWA Install Banner */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-40 bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl border border-amber-500/30 shadow-2xl dir-rtl text-right font-sans"
          id="pwa-install-banner"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center shrink-0 shadow-md">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                  <span>نصب اپلیکیشن سفال طبرستان</span>
                  <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-bold border border-amber-500/30">PWA</span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                  بدون نیاز به کافه بازار یا گوگل‌پلی؛ برنامه را مستقیم روی صفحه اصلی گوشی خود داشته باشید!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowBanner(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors shrink-0"
              title="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3.5 flex items-center gap-2 pt-3 border-t border-slate-800">
            <button
              onClick={handleInstallClick}
              className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isIOS ? 'راهنمای نصب در آیفون (iOS)' : 'نصب مستقیم اپلیکیشن'}</span>
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              بعداً
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS Instructions Modal */}
      <AnimatePresence>
        {showIOSInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm dir-rtl text-right font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold text-amber-400 flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  <span>راهنمای نصب روی آیفون (iOS)</span>
                </h3>
                <button
                  onClick={() => setShowIOSInstructions(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs text-slate-300">
                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
                    <Share className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block mb-0.5">مرحله اول:</span>
                    در پایین صفحه مرورگر Safari، روی دکمه اشتراک‌گذاری (<strong className="text-amber-400">Share</strong>) کلیک کنید.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block mb-0.5">مرحله دوم:</span>
                    در منوی باز شده، گزینه <strong className="text-amber-400">Add to Home Screen</strong> (افزودن به صفحه اصلی) را انتخاب کنید.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block mb-0.5">مرحله سوم:</span>
                    روی گزینه <strong className="text-emerald-400">Add</strong> در بالای صفحه بزنید. آیکون صنایع سفال طبرستان به صفحه گوشی شما اضافه می‌شود!
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSInstructions(false)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer mt-2"
              >
                متوجه شدم
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
