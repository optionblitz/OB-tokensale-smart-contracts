//SPDX-License-Identifier: GPL-3.0
pragma solidity >0.6.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract USDC is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {}

    function mint(address addressOwner, uint256 amount) external onlyOwner {
        _mint(addressOwner, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
