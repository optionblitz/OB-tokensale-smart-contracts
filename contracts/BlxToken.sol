// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "./interfaces/IBlxToken.sol";

contract BlxToken is IBlxToken, ERC20Permit {
    string private constant symbol_ = "BLX";
    string private constant name_ = "BLX token";
    
    uint256 private constant totalSupply_ = 100 * 10**6 * 10**6; // fixed initial supply 100M, 6 decimal 

    string public constant EIP712Domain = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
    string public constant version = "1"; // match ERC20Permit value

    constructor(address mintTo) ERC20(name_, symbol_) ERC20Permit(name_) {
        if (mintTo == address(0)) mintTo = _msgSender();
        _mint(mintTo, totalSupply_);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev burn tokens, anyone can burn their token
    /// @param amount amount to be burnt, must have balance
    function burn(uint256 amount)
        public override
    {
        _burn(_msgSender(), amount);
    }

    /// @dev for constructing eth_signTypedData usage(EIP712)
    function verifyingContract() public view returns(address) { return address(this); }    
}
