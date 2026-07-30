// ERC-8004 ("Trustless Agents") — Arc's own deployment on Arc Testnet, per
// docs.arc.io/arc/tutorials/register-your-first-ai-agent. Not the canonical
// Ethereum mainnet registries — an Arc-specific implementation of the same
// standard (three ERC-1967 proxies, verified on-chain this session: real
// bytecode, distinct implementation addresses per registry). ABIs below were
// dry-run verified via simulateContract before any real tx was sent.
export const ERC8004_IDENTITY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const ERC8004_REPUTATION_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const erc8004IdentityAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "metadataURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Per the standard, an agent's own owner can't record feedback for itself
// (self-dealing guard) — feedback comes from the counterparty, i.e. the job's
// client or provider rating the judge after the verdict lands.
export const erc8004ReputationAbi = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "int128" },
      { name: "feedbackType", type: "uint8" },
      { name: "tag", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "evidenceURI", type: "string" },
      { name: "comment", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
