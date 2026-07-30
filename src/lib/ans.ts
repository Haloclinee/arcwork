// ANS — a small, independent community name registry on Arc Testnet
// (https://arcnames.xyz, source: github.com/Alicepoltora/arc-name-service).
// Not an official Circle product. Verified on-chain: contract at ANS_REGISTRY
// matches this ABI (register/resolve/reverseResolve/isAvailable), is
// non-payable (gas only, no fee), has no admin/owner functions, and is not
// upgradeable — so integrating read-only reverse resolution carries no fund
// or governance risk beyond the gas of registering a name.
export const ANS_REGISTRY = "0xEDcd3636584074cBCa4B685Cc5FE5080E70CC080" as const;

export const ansAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isAvailable",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "reverseResolve",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;
