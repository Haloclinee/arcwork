import { useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { Conversation, DecodedMessage } from "@xmtp/browser-sdk";
import { getLastSeen, getXmtpClient, hasUsedXmtp, markSeen, openDm, peekXmtpClient } from "../lib/xmtp";
import { shortAddr } from "../lib/format";

const UNREAD_POLL_MS = 20_000;

// Wallet-to-wallet negotiation chat, scoped to one applicant. Opt-in per row
// (building the XMTP identity needs a wallet signature) rather than eagerly
// loaded for every applicant. Nothing here touches arcwork's own contracts —
// it's purely XMTP's network, keyed by the two wallet addresses.
export function Chat({ peerAddress, label }: { peerAddress: `0x${string}`; label: string }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DecodedMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [myInboxId, setMyInboxId] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const streamRef = useRef<{ end: () => Promise<unknown> } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    return () => {
      streamRef.current?.end().catch(() => {});
    };
  }, []);

  // Silent unread check — never prompts a signature. Only runs at all for a
  // wallet that has already used XMTP through arcwork once (hasUsedXmtp),
  // so wallets that have never touched chat don't pay the SDK's lazy-load
  // cost just for sitting on a page with applicants listed.
  useEffect(() => {
    if (!address || !hasUsedXmtp(address)) return;
    let cancelled = false;

    async function check() {
      if (openRef.current) return; // already viewing — stream/markSeen covers it
      const client = await peekXmtpClient(address!);
      if (!client || cancelled) return;
      try {
        const dm = await openDm(client, peerAddress);
        await dm.sync();
        const recent = (await dm.messages({ limit: 5n })).filter((m) => typeof m.content === "string");
        const last = recent[recent.length - 1];
        if (!cancelled && last && last.senderInboxId !== client.inboxId) {
          const lastSeen = getLastSeen(address!, peerAddress);
          setUnread(last.sentAt.getTime() > lastSeen);
        }
      } catch {
        // peer has no inbox yet, or a transient network hiccup — not worth surfacing
      }
    }

    check();
    const id = setInterval(check, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address, peerAddress]);

  async function startChat() {
    if (!address || !walletClient) return;
    setStatus("connecting");
    setError(null);
    setUnread(false);
    try {
      const client = await getXmtpClient(address, walletClient);
      setMyInboxId(client.inboxId ?? null);
      const dm = await openDm(client, peerAddress);
      setConversation(dm);
      const initial = await dm.messages();
      setMessages(initial);
      setStatus("ready");
      markSeen(address, peerAddress, Date.now());

      const stream = await dm.stream();
      streamRef.current = stream;
      (async () => {
        for await (const msg of stream) {
          setMessages((prev) => [...prev, msg]);
          markSeen(address, peerAddress, Date.now());
        }
      })();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /inbox id for address .* not found/i.test(msg)
          ? "This wallet hasn't set up messaging yet — they'll be reachable as soon as they apply, post a job, or open a chat themselves."
          : msg.split("\n")[0].slice(0, 200),
      );
      setStatus("error");
    }
  }

  async function send() {
    if (!conversation || !text.trim()) return;
    setSending(true);
    try {
      await conversation.sendText(text.trim());
      setText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setSending(false);
    }
  }

  // Conversations carry system entries too (e.g. a "group_updated" event
  // fired when the DM is first created) — only render actual text messages.
  const textMessages = messages.filter((m) => typeof m.content === "string");

  if (!address) return null;

  if (!open) {
    return (
      <button
        className="btn btn-ghost small-btn chat-toggle-btn"
        onClick={() => { setOpen(true); void startChat(); }}
      >
        💬 {label}
        {unread && <span className="chat-badge-dot" aria-label="unread message" />}
      </button>
    );
  }

  return (
    <div className="chat-box">
      <div className="chat-header">
        <span>
          {label} — {shortAddr(peerAddress)}
        </span>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
      </div>

      {status === "connecting" && (
        <p className="muted small" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", margin: 0 }}>
          <span className="chat-typing"><span /><span /><span /></span>
          Connecting — check your wallet for a signature request…
        </p>
      )}
      {status === "error" && <div className="error">{error}</div>}

      {status === "ready" && (
        <>
          <div className="chat-messages">
            {textMessages.length === 0 ? (
              <p className="muted small">No messages yet — say hello.</p>
            ) : (
              textMessages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-msg ${m.senderInboxId === myInboxId ? "chat-msg-me" : "chat-msg-them"}`}
                >
                  {m.content as string}
                </div>
              ))
            )}
          </div>
          <div className="chat-input-row">
            <input
              placeholder="Message…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !sending && void send()}
            />
            <button className="btn btn-primary small-btn" disabled={sending || !text.trim()} onClick={send}>
              {sending ? "…" : "Send"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
