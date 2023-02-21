// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
  constructor() ERC20("TestERC20", "TT") { }

  function mint(uint256 amount) external {
    _mint(msg.sender, amount);
  }

  function mintFor(address _address, uint256 amount) external {
    _mint(_address, amount);
  }
}