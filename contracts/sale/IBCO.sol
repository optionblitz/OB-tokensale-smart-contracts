// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "../interfaces/Sale/IBlxPresale.sol";
import "../interfaces/IAccessContract.sol";
import "../interfaces/IBlxToken.sol";
import "../interfaces/Sale/IIBCO.sol";

import {Abdk} from "../util/AbdkUtil.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";

import "hardhat/console.sol";

contract IBCO is IIBCO, ERC2771Context, AccessContract, Initializable {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for uint128;
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    using Abdk for uint256;
    using Abdk for int128;

    // these constants are here to get pass stack too deep compilation issue
    int128 private constant _01 = int128(1844674407370955161600000);// 0.1 
    int128 private constant _towei = int128(18446744073709551616000000); // 1000000 for token decimal
    int128 private constant _1 = int128(18446744073709551616); // 1 
    int128 private constant _3 = int128(55340232221128654848); // 3
    int128 private constant _001 = int128(18446744073709551); // 0.001
    //below net ~10M for 30M BLX
    int128 private constant k1 = int128(24595658764946068821); // 1 + 1/3
    int128 private constant k2 = int128(13835058055282163); // 0.001 / k1
    //below net 9.6M for 30M BLX
    //int128 private constant k1 = int128(24534169618033703649); // 1 + 33/100
    //int128 private constant k2 = int128(13869732386247782); // 0.001 / k1

    uint private constant TO_WEI = 1e6;

    uint public softCap; //1.000.000 USDC
    uint public hardCap; //10.000.000 USDC
    uint public minAmount; //1 USDC
    uint public maxAmount; //max amount per purchase in USDC
    uint public duration; //28 days
    
    //IBCO status
    //true - after IBCO start
    //false - hard cap reached
    bool public ibcoActive; 

    bool public softCapReached;
    bool public hardCapReached;
    uint public ibcoStart;
    //IBCO start time + DURATION
    uint public ibcoEnd;

    // tx cost in USDC value in case of metaTx usage(add on top of the purchase amount)
    uint public txCost;
    // fee(gas cost) collected
    uint public txFee;

    IERC20 USDC;
    IBlxToken BLX;
    IBlxPresale presale;
    address public tokenSaleAddress;
    address public daoAgentAddress;
    address public daoAddress;

    struct Collateral {
        uint amount;//invested amount
        uint amountToClaim;
        bool redeemed;//claimed or refunded
    }
    //investor's address => Collateral
    mapping(address => Collateral) public collaterals;
    //amount aquired from whitelisted users
    uint public amountFromWhitelisted;
    uint public distributedBlx;

    event NewPurchase(address indexed buyer, uint usdc, uint blx);
    event BlxClaimed(address indexed user, uint blx);
    event IBCOStart(uint endTime, uint duration, uint softCap, uint hardCap);

    constructor (
        address trustedForwarder,
        address _usdcAddress,
        address _blxAddress,
        address _tokenSaleAddress
    ) ERC2771Context(trustedForwarder)
    {
        require(_usdcAddress != address(0), "IBCO:USDC_ADDRESS_ZERO");
        require(_blxAddress != address(0), "IBCO:BLX_ADDRESS_ZERO");
        require(_tokenSaleAddress != address(0), "IBCO:TOKENSALE_ADDRESS_ZERO");

        USDC = IERC20(_usdcAddress);
        BLX = IBlxToken(_blxAddress);
        tokenSaleAddress = _tokenSaleAddress;
    }

    function config (
        address _presaleAddress,
        address _daoAgentAddress,
        address _daoAddress,
        uint _duration,
        uint _softCap,
        uint _hardCap,
        uint _start
    )
        external
        onlyOwner
        initializer
    {
        require(_presaleAddress != address(0), "IBCO:PRESALE_ADDRESS_ZERO");
        require(_daoAgentAddress != address(0), "IBCO:DAO_AGENT_ADDRESS_ZERO");
        require(_daoAddress != address(0), "IBCO:DAO_ADDRESS_ZERO");
        require(_start > 0, "IBCO:NEED_START_TIME");
        require(_duration > 0, "IBCO:NEED_DURATION");
        require(amountFromWhitelisted == 0,"IBCO:ALREADY_STARTED");
        presale = IBlxPresale(_presaleAddress);
        daoAgentAddress = _daoAgentAddress;
        daoAddress = _daoAddress;
        duration = _duration;
        softCap = _softCap;
        hardCap = _hardCap;
        ibcoStart = _start;
        ibcoEnd = _start + _duration;
    }

    /// @dev calculates BLX price based on distributed tokens amount
    function currentPrice() public view returns(uint) {
        if(distributedBlx == 0)
            return 100000; // 0.1
        (,uint price18,) = calcPrice(distributedBlx, 1_000_000);
        
        if (price18 > 0) return price18/1_000_000_000_000;
        
        int128 t = distributedBlx.toAbdk();
        //int128 _2 = int128(36893488147419103232); // 2
        //Price = 0.001 * T^2/3
        //int128 log = t.log_2().div(_3).mul(_2);
        //should be Price = 0.001 * T ^ 1/3
        int128 log = t.log_2().div(_3).mul(_1);
        int128 y = log.exp_2();
        uint256 price = y.mul(_001).div(_1).toUInt();
        return price + 100000; // 0.1
    }

    /// @dev calculates BLX price based on distributed tokens amount
    /// @param purchased blx already purchased
    /// @param blxToBuy blx to be purchased
    function calcPrice(uint purchased, uint blxToBuy) public pure returns(uint256 usdc, uint256 price18, uint256 blx) {
        if (blxToBuy < 1) return (0, 0, 0);
        //t = purchased
        //n = new
        //k1 = 1 + 1/3(or 33/100)
        //k2 = (0.001)/k1
        //usdc = k2*(t + n)^k1 - k2*t^k1 + 0.1*n
        //p = n/usdc
        
        //general formula for x^y
        // z = x^y
        // ln(z) = y * ln(x)
        // exp(ln(z)) = z = exp(ln(y*ln(x))) = x^y

        int128 t = (purchased).toAbdk() / int128(uint128(TO_WEI)); // always whole number or the formula doesn't work
        int128 n = (blxToBuy).toAbdk() / int128(uint128(TO_WEI)); // always whole number or the formula doesn't work
        //int128 k1 = _1.add(_1.mul(_1).div(_3));
        //int128 k2 = _001.mul(_1).div(k1);
        //int128 log_tn = t.add(n).log_2();
        //int128 log_t = purchased > 0 ? t.log_2() : int128(0);
        int128 x = (t.add(n).log_2()).mul(k1).div(_1);
        int128 y = purchased > 0 ? (purchased > 0 ? t.log_2() : int128(0)).mul(k1).div(_1) : int128(0);
        //int128 x1 = x.exp_2();
        //int128 x2 = k2.mul(x.exp_2()).div(_1);
        //int128 y1 = purchased > 1 ? y.exp_2() : t;
        //int128 y2 = k2.mul(purchased > 1 ? y.exp_2() : t).div(_1);
        int128 _usdc = ((k2.mul(x.exp_2()).div(_1)) - (k2.mul(purchased > 1 ? y.exp_2() : t).div(_1)) + n.div(uint256(10).toAbdk()).mul(_1));
        usdc = _usdc.mul(_towei).toUInt();
        price18 = usdc * 1_000_000_000_000_000_000 / blxToBuy;
        blx = usdc * 1_000_000_000_000_000_000 / price18;
    }

    /// @dev calculates BLX amount from USDC
    /// @param usdcAmount usdc to pay
    function calcBlxAmount(uint usdcAmount) external view returns(uint256 usdcNeeded, uint256 blxAmount, uint256 price18, uint i) {
        uint startPrice = currentPrice();
        blxAmount = usdcAmount * TO_WEI / startPrice;
        (usdcNeeded, price18,) = calcPrice(distributedBlx, blxAmount);
        for (i = 0; i < 20; i++) {
            // b-search
            // this should be good for max 1B usdc input, above that it would return nothing as the loop would end
            // basically every 10x would require 2 more round to converge 
            // so 10^12 would need 24 + 2(initial/end)
            uint diff = usdcNeeded > usdcAmount ? usdcNeeded - usdcAmount : usdcAmount - usdcNeeded;
            if (diff <= TO_WEI) break;
            blxAmount = usdcAmount * TO_WEI / ((startPrice + price18/1_000_000_000_000)/2);
            (usdcNeeded,price18,) = calcPrice(distributedBlx, blxAmount);
            startPrice = price18/1_000_000_000_000;
        }
    }


    /// @dev calculates k1/k2 and other constants  for the pricing formula 
    // function k1k2(uint num, uint denom) public pure returns(int128 _k1, int128 _k2, int128 _wei, int128 _01) {
    //     //k1 = 1 + 1/3(or 33/100)
    //     //k2 = (0.001)/k1
    //     _k1 = _1.add(_1.mul(num.toAbdk()).div(denom.toAbdk()));
    //     _k2 = _001.mul(_1).div(_k1);
    //     _wei = TO_WEI.toAbdk();
    //     _01 = (uint256(100000)).toAbdk(); 
    // }

    /// @dev launches the IBCO
    function start() external onlyTrustedCaller {
        //not needed
        //require(presale.presaleSoftCapStatus(), "IBCO:PRESALE_SOFT_CAP_NOT_REACHED");
        //this? FIXME
        //require(presale.presaleClosed(),"IBCO:PRESALE_NOT_CLOSED");
        require(amountFromWhitelisted == 0 && !ibcoActive, "IBCO:ALREADY_STARTED");
        require(duration > 0, "IBCO:NOT_CONFIG");
        require(block.timestamp < ibcoEnd, "IBCO:IBCO_CLOSED");
        uint presaleBlxBal = BLX.balanceOf(address(presale));
        uint presaleBlxObligation = presale.blxObligation();
        uint chainid = block.chainid;
        //BLX need to be 3x of hardcap(to fullfil sales) before start
        require(BLX.balanceOf(address(this)) >= hardCap * 3 || !(chainid == 1 || chainid == 31337) , "IBCO:NEED_BLX");
        //Presale which handles rewards must have enough balances to cover max potential rewards
        require(presaleBlxBal >= hardCap * 3 / 10  + presaleBlxObligation || !(chainid == 1 || chainid == 31337), "IBCO:NEED_REWARD_BLX");

        ibcoActive = true;
        emit IBCOStart(ibcoEnd, duration, softCap, hardCap);
    }
    /// @dev set minimum amount USDC to enter sale
    /// @param amount USDC amount to enter in wei
    function setMinAmount(uint amount) external onlyTrustedCaller {
        minAmount = amount;
    }
    /// @dev set max amount USDC to enter sale
    /// @param amount USDC amount to enter in wei
    function setMaxAmount(uint amount) external onlyTrustedCaller {
        maxAmount = amount;
    }
    /// @dev set tx cost charged
    /// @param amount USDC amount to enter in wei
    function setTxCost(uint amount) external onlyTrustedCaller {
        txCost = amount;
    }

    /// @dev return BLX
    /// only if not started, in cases there need to be logic revision BETFORE start(and BLX already deposited)
    function returnBLX() external onlyTrustedCaller {
        require(amountFromWhitelisted == 0 && block.timestamp < ibcoStart, "IBCO:ALREADY_START");
        BLX.transfer(presale.daoAgentAddress(), BLX.balanceOf(address(this)));
    }
    
    /// @dev receive USDC from users
    /// @param blxAmount BLX amount
    /// @param msgSender user making the purchase, we trust only TokenSale contract for this call
    function purchase(uint blxAmount, uint maxUsdc, address referrer, address msgSender, bool collectFee) external {
        require(_msgSender() == tokenSaleAddress,"IBCO:ONLY_FROM_TOKENSALE");
        _enterIbco(blxAmount, maxUsdc, referrer, msgSender, collectFee);
    }

    /// @dev receive USDC from users
    /// @param blxAmount BLX amount

    function enterIbco(uint blxAmount, uint maxUsdc, address referrer) external {
        _enterIbco(blxAmount, maxUsdc, referrer, _msgSender(), isTrustedForwarder(msg.sender));
    }

    /// @dev receive USDC from users
    /// @param blxAmount BLX amount
    function _enterIbco(uint blxAmount, uint maxUsdc, address referrer, address msgSender, bool collectFee) private {
        require(block.timestamp >= ibcoStart, "IBCO:IBCO_NOT_STARTED");
        require(ibcoActive, hardCapReached ? "IBCO:IBCO_CLOSED" : "IBCO:IBCO_NOT_STARTED");
        require(block.timestamp < ibcoEnd, "IBCO:IBCO_CLOSED");
        blxAmount = (blxAmount/TO_WEI)*TO_WEI;
        //get BLX price
        (uint amount,,) = calcPrice(distributedBlx, blxAmount);
        amount = (amount/TO_WEI)*TO_WEI;
        if (amount < maxUsdc && amount + 1e6 >= maxUsdc) {
            amount = maxUsdc;
        }
        else if (amount > maxUsdc && amount <= maxUsdc + 1e6) {
            amount = maxUsdc;
        }
        require(amount <= maxUsdc || maxUsdc == 0,"IBCO:PRICE_INCREASED");
        
        uint myBlx = BLX.balanceOf(address(this));
        uint postSold = distributedBlx + blxAmount;
        uint diff = postSold > myBlx ? postSold - myBlx : myBlx - postSold;
        // for the 'last' purchase that hit hardcap of BLX, just round up/down to 10 BLX to round things up
        // of allocated Blx

        if (diff < 10_000_000) blxAmount = myBlx - distributedBlx;

        if(blxAmount + distributedBlx > myBlx)
            revert("IBCO:BLX_AMOUNT_EXCEEDS_SALES_BALANCE");

        require(amount >= minAmount 
                || amount + amountFromWhitelisted >= hardCap 
                || blxAmount + distributedBlx >= myBlx, "IBCO:MIN_AMOUNT_REQUIREMENT_NOT_MET");

        // add fee for metaTx(note we use msg.sender not intended _msgSender())
        uint fee = collectFee ? txCost : 0;
        USDC.transferFrom(msgSender, address(this), amount + fee);
        // remember fee collected
        txFee += fee;

        //update whitelisted funds amount 
        amountFromWhitelisted += amount;
        collaterals[msgSender].amountToClaim += blxAmount;
        distributedBlx += blxAmount;

        collaterals[msgSender].amount += amount;
        // revise referrer reward status
        presale.updateReferrer(msgSender, referrer, amount, blxAmount);
        // state can only be updated AFTER
        if (!softCapReached && amountFromWhitelisted >= softCap) softCapReached = true;
        if (!hardCapReached && (amountFromWhitelisted >= hardCap || distributedBlx >= myBlx)) {
            hardCapReached = true; ibcoActive = false;
        }
        emit NewPurchase(msgSender, amount, blxAmount);
    }

    /// @dev allows to claim BLX for whitelisted users
    function claim() external {
        require(block.timestamp >= ibcoStart, "IBCO:NOT_STARTED");
        // don't allow even sold out earlier still wait until end
        require(block.timestamp >= ibcoEnd && ibcoEnd > 0, "IBCO:SALE_IN_PROGRESS");
        require(softCapReached, "IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");
        address msgSender = _msgSender();
        require(!collaterals[msgSender].redeemed, "IBCO:ALREADY_CLAIMED");
        //BLX to send
        uint blxToSend = collaterals[msgSender].amountToClaim; 

        // possibility that only referral rewards but no purchase           
        if (blxToSend > 0) {
            // assume this would successed
            BLX.transfer(msgSender, blxToSend);
            emit BlxClaimed(msgSender, blxToSend);
        }

        //use redeemed flag to indicate claimed state but keep purchased amount for history
        //collaterals[msgSender].amount = 0;
        //collaterals[msgSender].amountToClaim = 0;
        
        collaterals[msgSender].redeemed = true;

        // claim rewards
        try presale.claimRewards(msgSender) returns (uint presaleBlx, uint rewards) {
            // it is possible there is no presale or rewards
            presaleBlx; rewards;
            //require(presaleBlx > 0 || rewards > 0, "IBCO:NOTHING_TO_CLAIM");
        }
        catch {

        }
    } 
    
    /// @dev allows to refund USDC for everyone if conditions are met
    function refund() external {
        require(block.timestamp >= ibcoStart, "IBCO:SALE_NOT_STARTED");
        require((block.timestamp >= ibcoEnd && ibcoEnd > 0),"IBCO:SALE_IN_PROGRESS");
        address msgSender = _msgSender();
        require(!collaterals[msgSender].redeemed, "IBCO:ALREADY_REDEEMED");
        bool hasPresaleRefund;

        // potential refund of presale for the case presale hitting softcap but ibco does not
        // state change there
        try presale.refund(msgSender) returns (uint presaleAmount, bool alreadyRedeemed) {
            hasPresaleRefund = !alreadyRedeemed && presaleAmount > 0;
        } 
        catch {

        }

        if (!softCapReached) {
            //Sale didn't reach it's goal, return money to investor
            USDC.transfer(msgSender, collaterals[msgSender].amount);
            amountFromWhitelisted -= collaterals[msgSender].amount;
            distributedBlx -= collaterals[msgSender].amountToClaim;
            collaterals[msgSender].amount = 0;
            collaterals[msgSender].amountToClaim = 0;
            collaterals[msgSender].redeemed = true;

            uint256 myUSDC = USDC.balanceOf(address(this));
            if (myUSDC > txFee && txFee > 0) {
                address presaleDaoAgentAddress = presale.daoAgentAddress();
                // ignore fail so we don't block refund, worst case collected fee
                // trapped here
                try USDC.transfer(presaleDaoAgentAddress, txFee) returns (bool success) {
                    if (success) txFee = 0;
                }
                catch {}
            }
        }
        else if (!hasPresaleRefund) {
            // only revert if there is no refund of presale
            // as we need to accept state change in presale in case there is refund
            // the second time called would fail
            revert("IBCO:PLEASE_CLAIM_YOUR_BLX_TOKENS");
        }
    } 

    /// @dev transfer all funds received from whitelisted to DAO agent
    function transferToDaoAgent() external onlyTrustedCaller {
        require(block.timestamp >= ibcoStart, "IBCO:IBCO_NOT_STARTED");
        require(
            (block.timestamp >= ibcoEnd && ibcoEnd > 0) || hardCapReached,
            "IBCO:SALE_IN_PROGRESS"
        );
        require(softCapReached, "IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");
        uint256 myUSDC = USDC.balanceOf(address(this));
        // transfer collected USDC from purchase
        USDC.transfer(daoAgentAddress, amountFromWhitelisted);
        
        // excess are from txFee or unknown source
        if (myUSDC > amountFromWhitelisted) {
            address presaleDaoAgentAddress = presale.daoAgentAddress();
            // we assume this cannot fail
            USDC.transfer(presaleDaoAgentAddress, myUSDC  - amountFromWhitelisted);
            txFee = 0;
        }
        amountFromWhitelisted = 0;
    }
    
    /// @dev transfer collected tx fee, regardless whether it softcap reach or not
    function transferTxFee() external onlyTrustedCaller {
        require(txFee > 0, "IBCO:NO_TX_FEE"); // only done once
        // only tx fee portion, rest are untouched(for refund etc.)
        uint myBalance = USDC.balanceOf(address(this));
        address presaleDaoAgentAddress = presale.daoAgentAddress();
        if (myBalance > txFee) {
            try USDC.transfer(presaleDaoAgentAddress, txFee) returns (bool success) {
                // reset
                if (success) txFee = 0;
            }
            catch {}
        }
    }

    /// @dev burn unsold BLX(not including rewards)
    function burnUnsoldBLX() external {
        require(block.timestamp >= ibcoStart, "IBCO:IBCO_NOT_STARTED");
        // speed up burning before the 90 days where rewards would also be burnt
        require(
            (block.timestamp >= ibcoEnd && ibcoEnd > 0) || hardCapReached,
            "IBCO:IBCO_IN_PROGRESS"
        );
        uint unused = _burnUnsoldBLX();

        require(unused > 0, "IBCO:NO_UNUSED_BLX");
    }

    function _burnUnsoldBLX() internal returns (uint unused)  {
        // claimable
        uint claimable = softCapReached ? distributedBlx : 0;
        // outstanding balance
        uint blxBalance = BLX.balanceOf(address(this));
        unused = (blxBalance > claimable ? blxBalance - claimable : 0);
        if (unused > 0) {
            BLX.burn(unused);
        }
    }

    /// @dev burn all unused BLX including unclaimed rewards
    function burnRemainingBLX() external {
        require(
            block.timestamp >= ibcoEnd + 60*60*24*90 && ibcoEnd > 0, // 90 days after ibco end
            "IBCO:NOT_REACH_BURNT_TIME"
        );

        // burn unsolded(if not burnt)
        _burnUnsoldBLX();

        // burn rewards
        presale.burnRemainingBLX();
    }
    
    /// @dev closed
    function closed() external view returns (bool status) {
        return (block.timestamp >= ibcoEnd && ibcoEnd > 0) || hardCapReached;
    }
    /// @dev started
    function started() external view returns (bool status) {
        return (block.timestamp >= ibcoStart && ibcoEnd > 0 && (ibcoActive || hardCapReached || block.timestamp >= ibcoEnd));
    }

    /// @dev soft cap reached(no refund)
    function softCapStatus() external view returns (bool status) {
        return softCapReached;
    }

    /// @dev available BLX
    function blxAvailable() public view returns (uint available) {
        uint blxBalance = BLX.balanceOf(address(this));
        available = blxBalance > distributedBlx ? blxBalance - distributedBlx : 0;
    }

    /// @dev max purchaseable usdc
    function maxPurchase() external view returns (uint available) {
        (available,,) = calcPrice(distributedBlx, blxAvailable());
        uint maxUsdc = hardCap > amountFromWhitelisted ? hardCap - amountFromWhitelisted : 0;
        available = ((available > maxUsdc ? maxUsdc : available)/TO_WEI)*TO_WEI;
    }

    /// @dev pick ERC2771Context over Ownable
    function _msgSender() internal view override(Context, ERC2771Context)
      returns (address sender) {
      sender = ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context)
      returns (bytes calldata) {
      return ERC2771Context._msgData();
    }

}
