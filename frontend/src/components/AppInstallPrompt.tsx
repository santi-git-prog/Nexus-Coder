import { useEffect, useState } from "react";
import "./AppInstallPrompt.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function AppInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const [dismissed, setDismissed] = useState(false);
  const [showAppleSteps, setShowAppleSteps] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowAppleSteps((visible) => !visible);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  if (isInstalled || dismissed || (!installPrompt && !isAppleMobile)) return null;

  return (
    <aside className="app-install-prompt" aria-label="Install Nexus Code">
      <img src="/nexus1-192.png" alt="" className="app-install-icon" />
      <div className="app-install-copy">
        <strong>Get Nexus Code as an app</strong>
        {showAppleSteps && (
          <span>Tap Share, then choose “Add to Home Screen”.</span>
        )}
      </div>
      <button type="button" className="app-install-action" onClick={handleInstall}>
        {installPrompt ? "Install" : "How to install"}
      </button>
      <button
        type="button"
        className="app-install-dismiss"
        aria-label="Dismiss install prompt"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </aside>
  );
}
