// Shared data for the client/provider agent swarm (agents/client-agent.mjs,
// agents/provider-agent.mjs): the task pool clients draw from, and the
// persona/specialty rosters each side picks from at startup.

// category matches a PROVIDER_SPECIALTIES key below, so "only apply to jobs
// that match your specialty" has something real to match against.
export const TASK_POOL = [
  { category: "WRITER", text: "Write a 250-word blog post about why USDC as a gas token changes DeFi UX." },
  { category: "WRITER", text: "Summarize the top 5 risks of on-chain escrow in bullet points." },
  { category: "SMART_CONTRACT_DEV", text: "Write a Python function that parses ERC-8183 job events from raw log data." },
  { category: "DATA_SPECIALIST", text: "Create a competitor analysis: arcwork vs. Upwork vs. Fiverr (3 paragraphs)." },
  { category: "SMART_CONTRACT_DEV", text: "Write clear acceptance criteria for a smart contract audit job." },
  { category: "DEVOPS_ENGINEER", text: "Produce a 10-point QA checklist for a Solidity contract deployment." },
  { category: "WRITER", text: "Write a user story: 'As a client, I want to...' for the job posting flow." },
  { category: "WRITER", text: "Summarize what ERC-8183 does in 3 sentences for a non-technical audience." },
  { category: "DEVOPS_ENGINEER", text: "Write a shell script that checks if an Ethereum address is a contract." },
  { category: "DEVOPS_ENGINEER", text: "Produce a markdown README section explaining the escrow lifecycle." },
  { category: "WRITER", text: "Write 5 example job descriptions for an agentic commerce marketplace." },
  { category: "DATA_SPECIALIST", text: "Analyze: what makes a good deliverable for an on-chain job? (300 words)" },
  { category: "DEVOPS_ENGINEER", text: "Write a structured test plan for a USDC transfer function." },
  { category: "WRITER", text: "Translate the arcwork homepage copy into formal business English." },
  { category: "DATA_SPECIALIST", text: "List 10 job categories suitable for agent-to-agent commerce on Arc." },
];

export const CLIENT_PERSONAS = [
  { key: "startup_cto", label: "STARTUP_CTO" },
  { key: "content_manager", label: "CONTENT_MANAGER" },
  { key: "data_analyst", label: "DATA_ANALYST" },
  { key: "devops_lead", label: "DEVOPS_LEAD" },
  { key: "product_owner", label: "PRODUCT_OWNER" },
];

export const PROVIDER_SPECIALTIES = [
  { key: "smart_contract_dev", label: "SMART_CONTRACT_DEV", discount: 0 },
  { key: "writer", label: "WRITER", discount: 0 },
  { key: "data_specialist", label: "DATA_SPECIALIST", discount: 0 },
  { key: "devops_engineer", label: "DEVOPS_ENGINEER", discount: 0 },
  { key: "generalist", label: "GENERALIST", discount: 0.1 },
];

export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
