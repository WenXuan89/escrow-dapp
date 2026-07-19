// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * =====================================================================
 *  REPUTATIONTOKEN.SOL — awarded to carriers on milestone completion
 * =====================================================================
 *  Owner: Person C
 *  Refer to: Lab 6, Exercise 3 (Coin.sol) — this is almost the same
 *            shape: an address-based minter check + a mapping of
 *            balances + a mint function + an event.
 *
 *  This is intentionally NOT a full ERC-20 (no transfer/approve
 *  needed for the assignment's minimum requirements) — just enough
 *  to represent "reputation points" a carrier accumulates. Only the
 *  Escrow contract should be allowed to mint.
 * =====================================================================
 */

contract ReputationToken {

    address public minter;   // the Escrow contract's address
    mapping(address => uint256) public balances;

    event Mint(address indexed to, uint256 amount);

    modifier onlyMinter() {
        require(msg.sender == minter, "Only the Escrow contract can mint");
        _;
    }

    /// @notice minter is set to whoever deploys this contract.
    /// Deploy this BEFORE Escrow.sol, then pass this contract's address
    /// into Escrow's constructor. If you deploy them separately and want
    /// Escrow to be the minter, you may need a one-time setMinter() call
    /// right after deployment instead — discuss with your team which
    /// approach fits your Truffle migration script better.
    constructor() {
        minter = msg.sender;
    }

    /// @notice Called by Escrow.verifyMilestone() (once all milestones
    /// are verified) to award points.
    function mint(address to, uint256 amount) public onlyMinter {
        // TODO(Person C):
        // - balances[to] += amount
        // - emit Mint(to, amount)
    }

    /// @notice Simple read function for the frontend to display a
    /// carrier's reputation score.
    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    // OPTIONAL, only if your team has time / wants it graded as a
    // proper token standard: add transfer(), approve(), allowance()
    // following the standard ERC-20 interface. Not required by the
    // assignment brief — it only asks you to "define a token standard",
    // which this simplified version already satisfies conceptually.

    // OPTIONAL — a penalty mechanism, only build this if there's spare
    // time near the end. Decided as a team: reputation is reward-only
    // for now (a Carrier who loses a dispute simply earns nothing for
    // that agreement, no explicit penalty). If you want to add a real
    // penalty later, it would look something like:
    //
    // function penalize(address carrier, uint256 amount) public onlyMinter {
    //     if (balances[carrier] < amount) {
    //         balances[carrier] = 0;
    //     } else {
    //         balances[carrier] -= amount;
    //     }
    //     emit Penalize(carrier, amount);
    // }
    //
    // (would need an accompanying `event Penalize(address indexed carrier, uint256 amount);`
    // declared near the top of this file)
}