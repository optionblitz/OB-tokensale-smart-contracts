// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {Abdk} from "../util/AbdkUtil.sol";

/// @dev the only purpose of this contract is to test the CND() function
contract MockAbdk {
    using Abdk for int128;
    using Abdk for uint256;

    function CND(int128 x) public pure returns(int128) {
        return x.CND();
    }

    function toTokenValue(int128 val, uint256 decimals) public pure returns (uint256) {
        return val.toTokenValue(decimals);
    }

    function fromTokenValue(uint256 val, uint256 decimals) public pure returns (int128) {
        return val.fromTokenValue(decimals);
    }
}
