// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/Sale/IBlxPresale.sol";
import "../interfaces/Sale/IIBCO.sol";

/* test contract simulating presale/icbo via token sale
 * only for testing with biconomy calls to reduce gas use during testing

 */
contract TestBiconomyPresale {

    event NewPurchase(address indexed buyer, uint usdc, uint blx);

    function purchase(uint amount, address referrer, address msgSender, bool collectFee) public {
        referrer;collectFee;
        emit NewPurchase(msgSender, amount , amount * 10);
    }
}
