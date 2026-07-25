import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { arcTestnet } from "./lib/arc";
import { shortAddr } from "./lib/format";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { CreateJobPage } from "./pages/CreateJobPage";
import { MyJobsPage } from "./pages/MyJobsPage";

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

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-mark">◠</span> arcwork
          <span className="brand-sub">jobs &amp; escrow on Arc · ERC-8183</span>
        </a>
        <nav className="nav">
          <a href="#/" className={route === "#/" ? "active" : ""}>Jobs</a>
          <a href="#/mine" className={route === "#/mine" ? "active" : ""}>My jobs</a>
          <a href="#/new" className={route === "#/new" ? "active" : ""}>Post a job</a>
          <ConnectButton />
        </nav>
      </header>
      <main className="content">
        {jobMatch ? (
          <JobDetailPage jobId={BigInt(jobMatch[1])} />
        ) : route === "#/new" ? (
          <CreateJobPage />
        ) : route === "#/mine" ? (
          <MyJobsPage />
        ) : (
          <JobsPage />
        )}
      </main>
      <footer className="footer">
        Built on the canonical ERC-8183 deployment on Arc Testnet · gas is paid in USDC ·{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet</a>
      </footer>
    </div>
  );
}
