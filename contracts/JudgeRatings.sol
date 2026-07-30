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

/// @title arcwork Judge Ratings
/// @notice Lets a job's client OR provider — the two parties who actually
///         experienced a judge's verdict — rate that judge 1-5 stars, once
///         each, after the job reaches a judged terminal state (Completed or
///         Rejected). Rating is gated entirely by the canonical ERC-8183
///         contract's own state: you can't rate a judge for a job you had no
///         part in, or before a verdict was actually rendered. No admin, no
///         fees, no way to touch escrow — purely an aggregated reputation
///         signal keyed by judge (evaluator) address.
contract JudgeRatings {
    IERC8183 public immutable erc8183;

    // jobId => rater => already rated
    mapping(uint256 => mapping(address => bool)) public hasRated;
    // judge address => aggregate
    mapping(address => uint256) public ratingCount;
    mapping(address => uint256) public ratingSum;

    event Rated(uint256 indexed jobId, address indexed judge, address indexed rater, uint8 stars);

    error InvalidStars();
    error NotParticipant();
    error JobNotJudged();
    error AlreadyRated();

    constructor(address erc8183Address) {
        erc8183 = IERC8183(erc8183Address);
    }

    /// @notice Rate the judge (evaluator) of `jobId`. Caller must be the
    ///         job's client or provider, and the job must have reached
    ///         Completed (3) or Rejected (4) — the only states where the
    ///         judge has actually rendered a verdict.
    function rateJudge(uint256 jobId, uint8 stars) external {
        if (stars < 1 || stars > 5) revert InvalidStars();

        IERC8183.Job memory job = erc8183.getJob(jobId);
        if (msg.sender != job.client && msg.sender != job.provider) revert NotParticipant();
        if (job.status != 3 && job.status != 4) revert JobNotJudged();
        if (hasRated[jobId][msg.sender]) revert AlreadyRated();

        hasRated[jobId][msg.sender] = true;
        ratingCount[job.evaluator] += 1;
        ratingSum[job.evaluator] += stars;

        emit Rated(jobId, job.evaluator, msg.sender, stars);
    }

    /// @notice Aggregate stats for a judge. Average = sum / count (compute
    ///         client-side to avoid on-chain rounding decisions).
    function judgeStats(address judge) external view returns (uint256 count, uint256 sum) {
        return (ratingCount[judge], ratingSum[judge]);
    }
}
