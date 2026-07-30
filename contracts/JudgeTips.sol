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

/// @title arcwork Judge Tips
/// @notice Lets a completed job's client or provider send a tip — in Arc's
///         native currency, which *is* USDC (Arc uses USDC as the native gas
///         token) — directly to the judge who evaluated it. The tip is
///         forwarded immediately to the judge; this contract never holds
///         funds. Gated by the canonical ERC-8183 contract's own state: only
///         tippable once the job has actually reached Completed.
contract JudgeTips {
    IERC8183 public immutable erc8183;

    mapping(address => uint256) public totalTipsReceived; // judge => cumulative native value
    mapping(address => uint256) public tipCount;           // judge => number of tips

    event Tipped(uint256 indexed jobId, address indexed judge, address indexed tipper, uint256 amount);

    error NotParticipant();
    error JobNotCompleted();
    error ZeroTip();
    error TransferFailed();

    constructor(address erc8183Address) {
        erc8183 = IERC8183(erc8183Address);
    }

    /// @notice Tip the judge of `jobId`. Caller must be the job's client or
    ///         provider, and the job must be Completed (3) — the state where
    ///         the judge approved the work and everyone got what they wanted.
    function tipJudge(uint256 jobId) external payable {
        if (msg.value == 0) revert ZeroTip();

        IERC8183.Job memory job = erc8183.getJob(jobId);
        if (msg.sender != job.client && msg.sender != job.provider) revert NotParticipant();
        if (job.status != 3) revert JobNotCompleted(); // 3 = Completed

        totalTipsReceived[job.evaluator] += msg.value;
        tipCount[job.evaluator] += 1;

        (bool success, ) = payable(job.evaluator).call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit Tipped(jobId, job.evaluator, msg.sender, msg.value);
    }
}
