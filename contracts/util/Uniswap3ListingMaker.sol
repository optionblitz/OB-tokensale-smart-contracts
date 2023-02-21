// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "../interfaces/IAccessContract.sol";
import "../interfaces/Sale/UniswapV3/INonfungiblePositionManager.sol";

import {Abdk} from "../util/AbdkUtil.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";

import "hardhat/console.sol";

contract Uniswap3ListingMaker is AccessContract {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for uint128;
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    using Abdk for uint256;
    using Abdk for int128;
    
    uint private constant TO_WEI = 1e6;
    uint private constant DECIMALS = 1e6;
    int128 private constant X96 = int128(79228162514264337593543950336); //2^96
    //Uniswap listing constants
    uint public constant TIME_CONST = 10000; // used in uniswap deadline
    uint24 public constant FEES = 3000; // 0.3 %
    int24 public constant TICK_LOWER = -887220;
    int24 public constant TICK_UPPER = 887220;

    address public posManagerAddress;
    address public poolAddress;
    
    //Uniswap LP NFT
    uint public tokenId;

    INonfungiblePositionManager positionManager;

    /// @dev sets uniswap3 position manager address
    /// @param _posManagerAddress address of uniswap position manager contract
    function setPositionManagerAddress (
        address _posManagerAddress
    )
        public
        onlyOwner
    {
        require(
            _posManagerAddress != address(0),
            "ULM:UNISWAP_POSITION_MANAGER_ADDRESS_ZERO"
        );

        positionManager = INonfungiblePositionManager(_posManagerAddress);
        posManagerAddress = _posManagerAddress;
    }

    /// @dev calculates sqrt(x) * 2^96
    /// @param price price of the token
    function priceToSqrtX96(uint price) public pure returns(uint160) {
        int128 _amount = price.toAbdk().div(TO_WEI.toAbdk()); 
        _amount = _amount.sqrt().mul(X96);
        uint160 result = uint160(uint128(_amount));
        return result;
    }

    /// @dev creates token listing on Uniswap
    /// @param token1Address token1 address (BLX goes here)
    /// @param token2Address token2 address (USDC goes here)
    function createListing(
        address token1Address,
        address token2Address
    ) public onlyTrustedCaller {
        require(token1Address != address(0), "ULM:TOKEN1_ADDRESS_ZERO");
        require(token2Address != address(0), "ULM:TOKEN2_ADDRESS_ZERO");
        
        IERC20 token1 = IERC20(token1Address);
        IERC20 token2 = IERC20(token2Address);

        uint token1Amount = token1.balanceOf(address(this));
        uint token2Amount = token2.balanceOf(address(this));

        require(token1Amount != 0, "ULM:TOKEN1_AMOUNT_ZERO");
        require(token2Amount != 0, "ULM:TOKEN2_AMOUNT_ZERO");

        uint price = token2Amount * DECIMALS / token1Amount;

        uint160 priceSqrtX96 = priceToSqrtX96(price); 

        poolAddress = positionManager.createAndInitializePoolIfNecessary(
            address(token1),
            address(token2),
            uint24(FEES),
            priceSqrtX96
        );

        token1.safeApprove(posManagerAddress, type(uint).max);
        token2.safeApprove(posManagerAddress, type(uint).max);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0: address(token1),
                token1: address(token2),
                fee: FEES,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount0Desired: token1Amount,
                amount1Desired: token2Amount,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + TIME_CONST
            });

        (tokenId, , , ) = positionManager.mint(params);
    }
}
