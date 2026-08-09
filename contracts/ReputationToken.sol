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

    /// @notice minter is set to whoever deploys this contract initially.
    constructor() {
        minter = msg.sender;
    }

    /// @notice Sets the Escrow contract as the authorized minter post-deployment.
    function setMinter(address _minter) external {
        require(msg.sender == minter, "Only current minter can change minter");
        require(_minter != address(0), "Invalid address");
        minter = _minter;
    }

    /// @notice Called by Escrow.verifyMilestone() to award reputation points.
    function mint(address to, uint256 amount) public onlyMinter {
    balances[to] += amount;
    emit Mint(to, amount);
}

    /// @notice Simple read function for the frontend to display a carrier's reputation score.
    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }
}