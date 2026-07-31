// Shared plumbing for the arcwork autonomous agents.
// Node 24 strips TS types natively, so we import the same ABI the frontend uses.
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  fallback,
  hexToString,
  http,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  arcTestnet,
  erc8183Abi,
  erc20Abi,
  ERC8183_ADDRESS,
  USDC_ADDRESS,
} from "../src/lib/arc.ts";
import { jobCreatedEvent, jobSubmittedEvent } from "../src/lib/events.ts";

export { arcTestnet, erc8183Abi, erc20Abi, ERC8183_ADDRESS, USDC_ADDRESS };
export { jobCreatedEvent, jobSubmittedEvent };

export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];

export function makeClients(privateKey) {
  const account = privateKeyToAccount(privateKey);
  // Public testnet RPCs rate-limit aggressively — spread across endpoints and
  // retry with generous backoff instead of crashing mid-flow.
  const opts = { retryCount: 5, retryDelay: 1500 };
  const transport = fallback([
    http("https://rpc.drpc.testnet.arc.network", opts),
    http("https://rpc.testnet.arc.network", opts),
    http("https://rpc.blockdaemon.testnet.arc.network", opts),
  ]);
  const pub = createPublicClient({ chain: arcTestnet, transport });
  const wallet = createWalletClient({ account, chain: arcTestnet, transport });
  return { account, pub, wallet };
}

export function log(role, msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] [${role}] ${msg}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJob(pub, jobId) {
  return pub.readContract({
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "getJob",
    args: [jobId],
  });
}

export async function writeAndWait(pub, wallet, params) {
  const hash = await wallet.writeContract(params);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return receipt;
}

// Deliverable content is embedded in submit()'s optParams — same scheme as the frontend.
export function encodeDeliverable(text) {
  const encoded = toHex(text);
  return { deliverable: keccak256(encoded), optParams: encoded };
}

export async function recoverDeliverable(pub, jobId, fromBlock) {
  const latest = await pub.getBlockNumber();
  let to = latest;
  for (let i = 0; i < 30 && to >= fromBlock; i++) {
    let from = to - 9500n;
    if (from < fromBlock) from = fromBlock;
    const logs = await pub.getLogs({
      address: ERC8183_ADDRESS,
      event: jobSubmittedEvent,
      args: { jobId },
      fromBlock: from,
      toBlock: to,
    });
    if (logs.length > 0) {
      const l = logs[logs.length - 1];
      const tx = await pub.getTransaction({ hash: l.transactionHash });
      try {
        const decoded = decodeFunctionData({ abi: erc8183Abi, data: tx.input });
        if (decoded.functionName === "submit") {
          const optParams = decoded.args[2];
          if (optParams && optParams !== "0x" && keccak256(optParams) === l.args.deliverable) {
            return { hash: l.args.deliverable, content: hexToString(optParams) };
          }
        }
      } catch {
        // fall through to hash-only
      }
      return { hash: l.args.deliverable, content: null };
    }
    to = from - 1n;
  }
  return null;
}

// ── Claude integration (optional — falls back to templates without credentials) ──

let anthropic = null;
async function getAnthropic() {
  if (anthropic === null) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      anthropic = new Anthropic();
    } catch {
      anthropic = false;
    }
  }
  return anthropic;
}

async function ask(system, user, maxTokens = 8000) {
  const client = await getAnthropic();
  if (!client) return null;
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? null;
    return text;
  } catch (e) {
    log("ai", `Claude call failed (${String(e.message ?? e).slice(0, 80)}) — using fallback`);
    return null;
  }
}

export async function aiPriceJob(description) {
  const answer = await ask(
    "You price small gig jobs paid in USDC on a testnet. Respond with ONLY a decimal number between 0.1 and 2.0 — the price in USDC. No other text.",
    `Price this job:\n\n${description}`,
    100,
  );
  const parsed = answer ? Number.parseFloat(answer.trim()) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 2) return parsed.toFixed(2);
  return "0.50";
}

export async function aiDoWork(description) {
  const answer = await ask(
    "You are an autonomous provider agent on the arcwork job marketplace (Arc Testnet, ERC-8183). Produce the requested deliverable directly and completely as plain text. Keep it under 300 words. Do not add preamble like 'Here is...' — output only the deliverable itself.",
    `Job description:\n\n${description}\n\nProduce the deliverable now.`,
  );
  return (
    answer ??
    `Deliverable for: "${description.slice(0, 80)}"\n\n(Automated fallback deliverable — no AI credentials configured. This text was submitted on-chain by the arcwork provider agent as proof of the agent-to-agent flow.)`
  );
}

// ── Local evaluator (Ollama) — the impartial judge never uses a cloud API ──

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:latest";

async function askOllama(system, user, model) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content ?? "";
}

// Neutral, evaluator-only judgment — runs entirely on the local machine via
// Ollama so no party (client or provider) can influence the model that
// decides the payout. `model` lets different judge personas (agents/judges.mjs)
// use different local models. Falls back to a conservative auto-approve only
// if Ollama itself is unreachable (keeps the demo flow from stalling).
export async function aiEvaluateLocal(description, deliverable, model = DEFAULT_MODEL) {
  try {
    const raw = await askOllama(
      "You are a neutral, impartial evaluator judging whether a submitted deliverable satisfies a job on an on-chain escrow marketplace. You are not the client or the provider — you have no stake in the outcome. Judge only on merit: does the deliverable reasonably address what the job asked for? You may think it through, but your FINAL line must be EXACTLY 'APPROVE: <short reason>' or 'REJECT: <short reason>' — nothing after it.",
      `Job description:\n${description}\n\nSubmitted deliverable:\n${deliverable}\n\nYour verdict:`,
      model,
    );
    return parseVerdict(raw, model);
  } catch (e) {
    log("evaluator", `Ollama unreachable for ${model} (${String(e.message ?? e).slice(0, 100)}) — defaulting to approve`);
    return { approve: true, reason: "auto-approved (local evaluator model unreachable)", model };
  }
}

// Reasoning models (e.g. deepseek-r1) may prefix output with <think>...</think>
// or other scratch text — search all lines for the verdict line, from the end
// (the model's final decision), not just the first match.
function parseVerdict(raw, model) {
  const lines = raw.trim().split("\n");
  const line = [...lines].reverse().find((l) => /(APPROVE|REJECT)/i.test(l)) ?? raw.trim();
  const approveIdx = line.search(/APPROVE/i);
  const rejectIdx = line.search(/REJECT/i);
  const approve = approveIdx !== -1 && (rejectIdx === -1 || approveIdx < rejectIdx);
  const reason =
    line.replace(/^[\s*_-]*\**(APPROVE|REJECT)\**:?\s*/i, "").trim().slice(0, 200) ||
    (approve ? "meets requirements" : "does not meet requirements");
  return { approve, reason, model };
}

// ── OpenRouter evaluator — same neutral-judge contract as aiEvaluateLocal,
// but routed through OpenRouter so each judge persona can run a different
// hosted model (agents/judges.mjs) without every operator needing local
// hardware for 12 different Ollama models. Used when OPENROUTER_API_KEY is
// set in agents/.env; evaluator.mjs falls back to aiEvaluateLocal otherwise.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function aiEvaluateOpenRouter(description, deliverable, model, apiKey) {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": "https://arcworkapp.vercel.app",
        "x-title": "arcwork judge",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are a neutral, impartial evaluator judging whether a submitted deliverable satisfies a job on an on-chain escrow marketplace. You are not the client or the provider — you have no stake in the outcome. Judge only on merit: does the deliverable reasonably address what the job asked for? You may think it through, but your FINAL line must be EXACTLY 'APPROVE: <short reason>' or 'REJECT: <short reason>' — nothing after it.",
          },
          {
            role: "user",
            content: `Job description:\n${description}\n\nSubmitted deliverable:\n${deliverable}\n\nYour verdict:`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("empty response");
    return parseVerdict(raw, model);
  } catch (e) {
    log("evaluator", `OpenRouter unreachable for ${model} (${String(e.message ?? e).slice(0, 100)}) — defaulting to approve`);
    return { approve: true, reason: "auto-approved (OpenRouter evaluator unreachable)", model };
  }
}

