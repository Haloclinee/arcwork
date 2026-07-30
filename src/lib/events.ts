// Event shapes verified against the deployed contract's logs (topic0 checked on-chain).

export const jobCreatedEvent = {
  type: "event",
  name: "JobCreated",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "evaluator", type: "address", indexed: false },
    { name: "expiredAt", type: "uint256", indexed: false },
    { name: "hook", type: "address", indexed: false },
  ],
} as const;

export const jobSubmittedEvent = {
  type: "event",
  name: "JobSubmitted",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "deliverable", type: "bytes32", indexed: false },
  ],
} as const;

export const jobFundedEvent = {
  type: "event",
  name: "JobFunded",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

export const jobCompletedEvent = {
  type: "event",
  name: "JobCompleted",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "evaluator", type: "address", indexed: true },
    { name: "reason", type: "bytes32", indexed: false },
  ],
} as const;

export const jobRejectedEvent = {
  type: "event",
  name: "JobRejected",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "rejector", type: "address", indexed: true },
    { name: "reason", type: "bytes32", indexed: false },
  ],
} as const;
