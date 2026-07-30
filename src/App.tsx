import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcTestnet } from "./lib/arc";
import { shortAddr } from "./lib/format";
import { LandingPage } from "./pages/LandingPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { CreateJobPage } from "./pages/CreateJobPage";
import { MyJobsPage } from "./pages/MyJobsPage";
import { ReputationPage } from "./pages/ReputationPage";
import { JudgesPage } from "./pages/JudgesPage";
import { JudgeHistoryPage } from "./pages/JudgeHistoryPage";
import { ArenaPage } from "./pages/ArenaPage";
import { TutorialModal } from "./components/Tutorial";

const TUTORIAL_KEY = "arcwork:tutorial:seen";
const THEME_KEY = "arcwork:theme";

type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = getStoredTheme();
    if (stored) return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function pick(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // best effort only
    }
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Toggle theme">
      <button type="button" className={theme === "light" ? "is-active" : ""} onClick={() => pick("light")}>
        Light
      </button>
      <button type="button" className={theme === "dark" ? "is-active" : ""} onClick={() => pick("dark")}>
        Dark
      </button>
    </div>
  );
}

function NavJump() {
  const [value, setValue] = useState("");
  return (
    <form
      className="jump"
      onSubmit={(e) => {
        e.preventDefault();
        const id = value.trim().replace(/^#/, "");
        if (/^\d+$/.test(id)) {
          window.location.hash = `#/job/${id}`;
          setValue("");
        }
      }}
    >
      <input
        placeholder="Go to job #…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
      />
      <kbd>↵</kbd>
    </form>
  );
}

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        className="btn btn-primary"
        disabled={isPending}
        onClick={() => connect({ connector: connectors[0] })}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }
  if (chainId !== arcTestnet.id) {
    return (
      <button className="btn btn-warn" onClick={() => switchChain({ chainId: arcTestnet.id })}>
        Switch to Arc
      </button>
    );
  }
  return (
    <button className="btn btn-ghost" title="Disconnect" onClick={() => disconnect()}>
      <span className="dot" /> {shortAddr(address!)}
    </button>
  );
}

export default function App() {
  const route = useHashRoute();
  const jobMatch = route.match(/^#\/job\/(\d+)$/);
  const repMatch = route.match(/^#\/rep\/(0x[0-9a-fA-F]{40})$/);
  const judgeMatch = route.match(/^#\/judge\/(0x[0-9a-fA-F]{40})$/);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [route]);
  const [showTutorial, setShowTutorial] = useState(false);

  // Let the page render first — a blocking modal before the visitor has
  // even seen the site is a bad first impression. Delay the first-run
  // tutorial slightly instead of firing it on mount.
  useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem(TUTORIAL_KEY);
    } catch {
      // storage unavailable — treat as unseen, still delay
    }
    if (seen) return;
    const t = setTimeout(() => setShowTutorial(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function closeTutorial() {
    try {
      localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      // storage unavailable — just close for this session
    }
    setShowTutorial(false);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand">
            <span className="brand-mark">◠</span> arcwork
            <span className="brand-sub">jobs &amp; escrow on Arc · ERC-8183</span>
          </a>
          <nav className={`nav ${mobileNavOpen ? "nav-open" : ""}`}>
            <a href="#/jobs" className={route === "#/jobs" ? "active" : ""}>Jobs</a>
            <a href="#/mine" className={route === "#/mine" ? "active" : ""}>My jobs</a>
            <a href="#/judges" className={route === "#/judges" ? "active" : ""}>Judges</a>
            <a href="#/arena" className={route === "#/arena" ? "active" : ""}>Arena</a>
          </nav>
          <button
            className="nav-burger"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>
      <div className="container">
        <main className="content">
          {jobMatch ? (
            <JobDetailPage jobId={BigInt(jobMatch[1])} />
          ) : repMatch ? (
            <ReputationPage address={repMatch[1] as `0x${string}`} />
          ) : judgeMatch ? (
            <JudgeHistoryPage address={judgeMatch[1] as `0x${string}`} />
          ) : route === "#/new" ? (
            <CreateJobPage />
          ) : route === "#/mine" ? (
            <MyJobsPage />
          ) : route === "#/judges" ? (
            <JudgesPage />
          ) : route === "#/arena" ? (
            <ArenaPage />
          ) : route === "#/jobs" ? (
            <JobsPage />
          ) : (
            <LandingPage />
          )}
        </main>
        <footer className="footer">
          Built on the canonical ERC-8183 deployment on Arc Testnet · gas is paid in USDC ·{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet</a> ·{" "}
          <button className="footer-help" onClick={() => setShowTutorial(true)}>how this works</button>
        </footer>
      </div>
      {showTutorial && <TutorialModal onClose={closeTutorial} />}
      <div className="corner-actions">
        <NavJump />
        <a href="#/new" className="btn btn-primary small-btn">Post a job</a>
      </div>
      <div className="wallet-fab">
        <ConnectButton />
      </div>
      <ThemeToggle />
    </div>
  );
}
