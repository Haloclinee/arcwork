// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Matches the deployed ERC8183 contract's actual getJob() return shape
///      on Arc Testnet — see contracts/JobApplications.sol for the same note.
interface IERC8183 {
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        uint8 status;
        uint256 submittedAt;
    }

    function getJob(uint256 jobId) external view returns (Job memory);
}

/// @title arcwork Judge Fee
/// @notice A mandatory 1% platform fee, paid by the job's client directly to
///         the judge (evaluator). Distinct from JudgeTips (voluntary,
///         entirely optional) — this fee is fixed at 1% of the job's budget,
///         but it is only payable once the job has actually reached
///         Completed (3). If the judge rejects the work, the job expires, or
///         it's still in progress, payFee() reverts — a judge can never
///         collect a fee on a job that didn't successfully pay out. Paid in
///         Arc's native currency (which IS USDC), scaled up from the job's
///         ERC-20 USDC budget (6 decimals) to native precision (18
///         decimals). The contract never holds funds — the fee is forwarded
///         to the judge in the same transaction.
contract JudgeFee {
    IERC8183 public immutable erc8183;

    uint256 private constant SCALE_6_TO_18 = 10 ** 12;

    mapping(uint256 => bool) public feePaid;
    mapping(address => uint256) public totalFeesReceived; // judge => cumulative native value
    mapping(address => uint256) public feeCount;           // judge => number of fees paid

    event FeePaid(uint256 indexed jobId, address indexed judge, address indexed client, uint256 amount);

    error NotClient();
    error JobNotCompleted();
    error AlreadyPaid();
    error WrongFeeAmount();
    error TransferFailed();

    constructor(address erc8183Address) {
        erc8183 = IERC8183(erc8183Address);
    }

    /// @notice The exact fee (in native wei) required for `jobId` right now —
    ///         1% of the job's budget, scaled to native precision. Budget is
    ///         fixed once Funded, so this is stable from Completed onward.
    function feeFor(uint256 jobId) public view returns (uint256) {
        IERC8183.Job memory job = erc8183.getJob(jobId);
        return (job.budget * SCALE_6_TO_18) / 100;
    }

    /// @notice Pay the platform fee for `jobId`. Caller must be the job's
    ///         client, the job must be Completed (3) — i.e. the judge
    ///         approved and the provider was actually paid — and the fee
    ///         must not already be paid. msg.value must equal exactly 1% of
    ///         the budget, computed on-chain, not trusted from the caller.
    function payFee(uint256 jobId) external payable {
        IERC8183.Job memory job = erc8183.getJob(jobId);
        if (msg.sender != job.client) revert NotClient();
        if (job.status != 3) revert JobNotCompleted(); // 3 = Completed
        if (feePaid[jobId]) revert AlreadyPaid();

        uint256 required = (job.budget * SCALE_6_TO_18) / 100;
        if (msg.value != required) revert WrongFeeAmount();

        feePaid[jobId] = true;
        totalFeesReceived[job.evaluator] += msg.value;
        feeCount[job.evaluator] += 1;

        (bool success, ) = payable(job.evaluator).call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit FeePaid(jobId, job.evaluator, msg.sender, msg.value);
    }
}
