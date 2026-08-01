import type { Client as XmtpClient, Conversation, Signer } from "@xmtp/browser-sdk";
import type { WalletClient } from "viem";
import { hexToBytes } from "viem";

// Wallet-to-wallet chat for applicant negotiation (price/scope before
// assigning) — no arcwork backend involved. Messages live entirely on
// XMTP's network, addressed by wallet address; arcwork never sees or stores
// them. @xmtp/browser-sdk ships an ~11MB WASM binary, so it's imported
// dynamically here — only wallets that actually open a chat pay that cost,
// not every visitor to the site.
const clients = new Map<string, Promise<XmtpClient>>();

async function makeSigner(address: `0x${string}`, walletClient: WalletClient): Promise<Signer> {
  const { IdentifierKind } = await import("@xmtp/browser-sdk");
  return {
    type: "EOA",
    getIdentifier: () => ({ identifier: address.toLowerCase(), identifierKind: IdentifierKind.Ethereum }),
    signMessage: async (message: string) => {
      const signature = await walletClient.signMessage({ account: address, message });
      return hexToBytes(signature);
    },
  };
}

const readyKey = (address: string) => `arcwork:xmtp:ready:${address.toLowerCase()}`;

export function getXmtpClient(address: `0x${string}`, walletClient: WalletClient): Promise<XmtpClient> {
  const key = address.toLowerCase();
  let existing = clients.get(key);
  if (!existing) {
    existing = (async () => {
      const { Client } = await import("@xmtp/browser-sdk");
      const signer = await makeSigner(address, walletClient);
      // Default env ("dev") — arcwork itself runs on Arc Testnet, so the dev
      // XMTP network is the right fit rather than production.
      const client = await Client.create(signer);
      try {
        localStorage.setItem(readyKey(address), "1");
      } catch {
        // best effort only
      }
      return client;
    })();
    clients.set(key, existing);
  }
  return existing;
}

// True once this wallet has definitely used XMTP through arcwork before (set
// by getXmtpClient on success). Lets unread-badge checks skip the ~11MB SDK
// lazy-load entirely for wallets that have never touched chat — the whole
// point of lazy-loading it in the first place.
export function hasUsedXmtp(address: `0x${string}`): boolean {
  try {
    return localStorage.getItem(readyKey(address)) === "1";
  } catch {
    return false;
  }
}

// Reconnects to an already-registered local identity without a wallet
// signature (Client.build, not Client.create) — for silent unread checks.
// Resolves to null if this wallet has no local XMTP identity yet.
export async function peekXmtpClient(address: `0x${string}`): Promise<XmtpClient | null> {
  const key = address.toLowerCase();
  const cached = clients.get(key);
  if (cached) {
    try {
      return await cached;
    } catch {
      return null;
    }
  }
  try {
    const { Client, IdentifierKind } = await import("@xmtp/browser-sdk");
    const client = await Client.build({ identifier: key, identifierKind: IdentifierKind.Ethereum });
    clients.set(key, Promise.resolve(client));
    return client;
  } catch {
    return null;
  }
}

// Every job gets its OWN chat thread with a given peer, not one shared DM
// per wallet pair — a client who's posted several jobs with the same
// provider would otherwise see one merged conversation with no way to tell
// which message was about which job. XMTP DMs are inherently 1:1 with no
// topic/thread concept, so this uses a Group (client + one peer, effectively
// a private 2-person thread) named "arcwork-job-<id>" instead. Whichever
// side opens the chat first creates the group; the other side finds it via
// listGroups() once their client has synced (they were added as a member),
// so both ends land on the same thread instead of forking duplicates.
function jobGroupName(jobId: bigint): string {
  return `arcwork-job-${jobId}`;
}

export async function openJobChat(
  client: XmtpClient,
  jobId: bigint,
  peerAddress: `0x${string}`,
): Promise<Conversation> {
  const { IdentifierKind } = await import("@xmtp/browser-sdk");
  const name = jobGroupName(jobId);
  await client.conversations.sync();
  const groups = await client.conversations.listGroups();
  const existing = groups.find((g) => g.name === name);
  if (existing) return existing;
  return client.conversations.createGroupWithIdentifiers(
    [{ identifier: peerAddress.toLowerCase(), identifierKind: IdentifierKind.Ethereum }],
    { groupName: name },
  );
}

// Per-conversation "last seen" watermark (ms since epoch), so we can badge a
// closed chat as unread without XMTP's own read-state machinery. Keyed by
// job too, matching the per-job thread above.
const seenKey = (me: string, jobId: bigint, peer: string) =>
  `arcwork:chat:seen:${me.toLowerCase()}:${jobId}:${peer.toLowerCase()}`;

export function getLastSeen(me: `0x${string}`, jobId: bigint, peer: `0x${string}`): number {
  try {
    return Number(localStorage.getItem(seenKey(me, jobId, peer)) ?? 0);
  } catch {
    return 0;
  }
}

export function markSeen(me: `0x${string}`, jobId: bigint, peer: `0x${string}`, atMs: number): void {
  try {
    localStorage.setItem(seenKey(me, jobId, peer), String(atMs));
  } catch {
    // best effort only
  }
}
