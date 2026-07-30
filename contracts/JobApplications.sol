// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Matches the deployed ERC8183 contract's actual getJob() return shape
///      on Arc Testnet (verified against on-chain bytecode/storage layout —
///      the single-payment-token variant, distinct from the newer reference
///      repo). Field order and types must match exactly for ABI decoding.
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

/// @title arcwork Job Applications
/// @notice A permissionless companion registry for the canonical ERC-8183 job
///         contract. ERC-8183's setProvider() can only be called by the job's
///         client (verified on-chain: a stranger's setProvider call reverts
///         with Unauthorized) — so there is no way for an interested party to
///         self-assign to an open job. This contract lets ANY wallet signal
///         interest in an open, unassigned job; the client reads the
///         applicant list here and still calls setProvider() on the
///         canonical contract themselves.
///
///         This contract is intentionally minimal: no admin, no owner, no
///         upgradeability, no fees, and it never holds funds or touches
///         escrow. It only records "I'm interested" against jobs that exist
///         on the canonical contract, gated by that contract's own state.
contract JobApplications {
    IERC8183 public immutable erc8183;

    mapping(uint256 => address[]) private _applicants;
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    event Applied(uint256 indexed jobId, address indexed applicant, uint256 timestamp);
    event Withdrawn(uint256 indexed jobId, address indexed applicant);

    error JobNotOpen();
    error ProviderAlreadySet();
    error JobExpired();
    error AlreadyApplied();
    error NotApplied();

    constructor(address erc8183Address) {
        erc8183 = IERC8183(erc8183Address);
    }

    /// @notice Signal interest in an open job that has no provider pinned yet.
    ///         Reverts if the job is already assigned, closed, or expired —
    ///         so the applicant list always reflects genuinely open jobs.
    function applyToJob(uint256 jobId) external {
        IERC8183.Job memory job = erc8183.getJob(jobId);
        if (job.status != 0) revert JobNotOpen(); // 0 = Open
        if (job.provider != address(0)) revert ProviderAlreadySet();
        if (block.timestamp >= job.expiredAt) revert JobExpired();
        if (hasApplied[jobId][msg.sender]) revert AlreadyApplied();

        hasApplied[jobId][msg.sender] = true;
        _applicants[jobId].push(msg.sender);
        emit Applied(jobId, msg.sender, block.timestamp);
    }

    /// @notice Retract a previously submitted application.
    function withdraw(uint256 jobId) external {
        if (!hasApplied[jobId][msg.sender]) revert NotApplied();
        hasApplied[jobId][msg.sender] = false;

        address[] storage arr = _applicants[jobId];
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == msg.sender) {
                arr[i] = arr[len - 1];
                arr.pop();
                break;
            }
        }
        emit Withdrawn(jobId, msg.sender);
    }

    /// @notice Full applicant list for a job — cheap single call, no log scanning.
    function getApplicants(uint256 jobId) external view returns (address[] memory) {
        return _applicants[jobId];
    }

    function applicantCount(uint256 jobId) external view returns (uint256) {
        return _applicants[jobId].length;
    }
}
