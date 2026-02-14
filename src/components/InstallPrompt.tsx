"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share, Plus, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_EXPIRY_DAYS = 7;

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const expiry = Number(raw);
  if (Date.now() > expiry) {
    localStorage.removeItem(DISMISS_KEY);
    return false;
  }
  return true;
}

function setDismissed() {
  localStorage.setItem(
    DISMISS_KEY,
    String(Date.now() + DISMISS_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  const handleBeforeInstall = useCallback((e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e as BeforeInstallPromptEvent);
    if (!isDismissed() && !isStandalone()) {
      setShow(true);
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    // iOS detection
    if (isIOS()) {
      setIsIOSDevice(true);
      // Small delay so page loads first
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }

    // Android / Chrome
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, [handleBeforeInstall]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border"
        >
          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3 p-4">
            {/* App Icon */}
            <div className="flex-shrink-0 overflow-hidden rounded-xl">
              <Image
                src="/icon-192.png"
                alt="Kikstshop"
                width={56}
                height={56}
                className="rounded-xl"
              />
            </div>

            {/* Info */}
            <div className="flex-1 pr-4">
              <h3 className="text-sm font-semibold text-foreground">
                Install Kikstshop
              </h3>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Tambahkan ke homescreen untuk akses cepat seperti aplikasi native.
              </p>
            </div>
          </div>

          {isIOSDevice ? (
            /* iOS Instructions */
            <div className="border-t border-border px-4 pb-4 pt-3">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                Cara install di iPhone / iPad:
              </p>
              <ol className="space-y-2 text-[11px] text-foreground">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    1
                  </span>
                  <span className="flex items-center gap-1">
                    Tap <Share className="inline h-3.5 w-3.5 text-blue-500" /> di toolbar Safari
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    2
                  </span>
                  <span className="flex items-center gap-1">
                    Pilih <Plus className="inline h-3.5 w-3.5" /> <strong>Add to Home Screen</strong>
                  </span>
                </li>
              </ol>
            </div>
          ) : (
            /* Android / Chrome Install Button */
            <div className="border-t border-border px-4 pb-4 pt-3">
              <button
                onClick={handleInstall}
                className="btn-primary w-full py-2.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Install Sekarang
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
