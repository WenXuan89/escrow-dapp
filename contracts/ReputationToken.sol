// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ReputationToken {

    address public minter;
    address public owner;

    mapping(address => uint256) public balances;

    event Mint(address indexed to, uint256 amount);
    event MinterChanged(address indexed oldMinter, address indexed newMinter);

    modifier onlyMinter() {
        require(
            msg.sender == minter,
            "Only the Escrow contract can mint"
        );
        _;
    }

    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Only owner can perform this action"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        minter = msg.sender;
    }
    
    function setMinter(address newMinter) public onlyOwner {
        require(newMinter != address(0), "Invalid minter address");

        address oldMinter = minter;
        minter = newMinter;

        emit MinterChanged(oldMinter, newMinter);
    }

    function mint(address to, uint256 amount)
        public
        onlyMinter
    {
        balances[to] += amount;

        emit Mint(to, amount);
    }

    /// @notice Return a carrier's reputation balance.
    function balanceOf(address account)
        public
        view
        returns (uint256)
    {
        return balances[account];
    }
}