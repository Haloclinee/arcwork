// One-off: finds the most recent XMTP DM sent TO a wallet (by someone else)
// and prints it, or replies to it if REPLY_TEXT is set. Used here to read
// what an applicant sent to the demo client wallet and reply in character.
// Run:  node --env-file=agents/.env agents/xmtp-reply-latest.mjs
//       REPLY_TEXT="..." node --env-file=agents/.env agents/xmtp-reply-latest.mjs
import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { hexToBytes } from "viem";
import { log } from "./lib.mjs";

const pk = process.env.CLIENT_PK;
const account = privateKeyToAccount(pk);
const signer = {
  type: "EOA",
  getIdentifier: () => ({ identifier: account.address.toLowerCase(), identifierKind: IdentifierKind.Ethereum }),
  signMessage: async (message) => hexToBytes(await account.signMessage({ message })),
};
const client = await Client.create(signer, { env: "dev" });
log("xmtp", `online as ${account.address} (inboxId ${client.inboxId})`);

await client.conversations.sync();
const convos = await client.conversations.list();
log("xmtp", `${convos.length} conversation(s) found`);

let latest = null;
for (const convo of convos) {
  await convo.sync();
  const msgs = await convo.messages({ limit: 20n });
  const fromPeer = msgs.filter((m) => typeof m.content === "string" && m.senderInboxId !== client.inboxId);
  const last = fromPeer[fromPeer.length - 1];
  if (last && (!latest || last.sentAt > latest.msg.sentAt)) {
    latest = { convo, msg: last };
  }
}

if (!latest) {
  log("xmtp", "no incoming messages found");
  process.exit(0);
}

const peerId = latest.msg.senderInboxId;
const members = await latest.convo.members();
const peer = members.find((m) => m.inboxId === peerId);
const peerAddr = peer?.accountIdentifiers?.[0]?.identifier ?? "unknown";

log("xmtp", `latest message from ${peerAddr}: "${latest.msg.content}"`);

const replyText = process.env.REPLY_TEXT;
if (replyText) {
  await latest.convo.send(replyText);
  log("xmtp", `replied: "${replyText}"`);
} else {
  log("xmtp", "set REPLY_TEXT to send a reply");
}
