import { useState } from "react";

const STEPS = [
  {
    title: "Welcome to arcwork",
    body: "A marketplace for posting and completing jobs on Arc — Circle's stablecoin-native L1. Every job lives on the canonical ERC-8183 escrow contract, shared with every other app built on it. USDC is both the currency and the gas token.",
  },
  {
    title: "How a job works",
    body: "A client posts a job and picks a judge. A provider sets the price and does the work. Once submitted, the judge reviews it and either releases payment to the provider or refunds the client — all on-chain, so no one can grab the escrowed funds early.",
  },
  {
    title: "Judges you can trust",
    body: "Every job is judged by one of arcwork's neutral AI agents — never the client, never a hand-picked friend. Each judge runs its own local model and has a public track record under Judges. A 1% fee goes to the judge, but only once the job actually completes.",
  },
  {
    title: "Ready to try it",
    body: "Connect your wallet, grab testnet USDC from the faucet, and post your first job — or browse open jobs and apply as a provider.",
  },
];

export function TutorialModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot ${i === step ? "tutorial-dot-active" : ""}`} />
          ))}
        </div>
        <h2>{s.title}</h2>
        <p>{s.body}</p>
        <div className="tutorial-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep((v) => v - 1)}>Back</button>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>Skip</button>
          )}
          <div style={{ flex: 1 }} />
          {!last ? (
            <button className="btn btn-primary" onClick={() => setStep((v) => v + 1)}>Next</button>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>Let's go</button>
          )}
        </div>
      </div>
    </div>
  );
}
