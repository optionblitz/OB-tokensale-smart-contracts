// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IBlxToken {
    function burn(uint amount) external;
    function balanceOf(address holder) external view returns (uint balance);
}

contract L1Burner {
    // the sole purpose of this contract is as the designated address
    // to receive burnable blx token from L2 and burn it
    // can be run by anyone as any blx arrived here is considered in the process of being burnt

    address public blxToken; 
    
    constructor(address _blxToken) {
        blxToken = _blxToken;
    }

    /// @dev burn all token owned, can be executed by anyone
    function burn() public {
        uint myBalance = IBlxToken(blxToken).balanceOf(address(this));
        IBlxToken(blxToken).burn(myBalance);
    }
}