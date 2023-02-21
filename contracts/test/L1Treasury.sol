// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IAccessContract.sol";

interface IL1GatewayRouter {
    function outboundTransfer(
        address _token,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable returns (bytes memory);    
}

interface IERC20 {
    function balanceOf(address holder) external view returns (uint amount);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract L1Treasury is AccessContract {
    // this is holder of token that can go between L1/L2
    // this is required as arbitrum bridge frontend doesn't allow changing L2 recipient address
    // and is only designed for EOA account instead of multi-sig/dao agent etc.
    // owner is supposed to be a DAO agent
    // all outbound token should transfer to this address first
    // then execute the deposit/rawDeposit to move it to L2

    address public l1GatewayRouter; // arbitrum L1 router(transfer from L1 to L2)
    address public l2Treasury; // l2 treasury address;
    address public refund; // refund ETH receiver

    // sig for the router deposit() call
    bytes4 constant depositSelector = bytes4(keccak256(bytes("outboundTransfer(address,address,uint256,uint256,uint256,bytes")));

    constructor(address _l1GatewayRouter, address _l2Treasury, address _refund) {
        l1GatewayRouter = _l1GatewayRouter;
        l2Treasury = _l2Treasury;
        refund = _refund;
    }

    /// @dev move token from L1 to L2 arbitrum
    function depositToL2(address token, uint amount, uint maxGas, uint gasPriceBid, uint maxSubmissionCost) public payable {
        // payable and gas related params should be calculated using getDepositRequest in the arbitrum-sdk
        // refund will go back to this contract
        bytes memory callData = abi.encode(maxSubmissionCost,"");
        IL1GatewayRouter(l1GatewayRouter).outboundTransfer{ value: msg.value }(token, l2Treasury, amount, maxGas, gasPriceBid, callData);
    }

    /// @dev send constructed deposit tx(any token, but only to specific address) request from this address(created via arbitrum-sdk getDepositRequest)
    function rawDepositToL2(bytes calldata callDataWithSelector) public payable {
        bytes4 selector = getSelector(callDataWithSelector);
        //bytes4 sig = callData[0] |  bytes4(callData[1]) >> 8 | bytes4(callData[2]) >> 16  | bytes4(callData[3]) >> 24;
        require(selector == depositSelector, "wrong sig");
        
        // we don't care about the token or amount, only the designated to on L2 which is controlled by owner(DAO)
        (, address _to,,,,) = abi.decode(callDataWithSelector[4:], (address,address,uint256,uint256,uint256,bytes));
        require(_to == l2Treasury, "wrong recipient");

        (bool success,) = (l1GatewayRouter).call{ value: msg.value }(callDataWithSelector);
        require(success,"deposit failed");
    }

    /// @dev extract refund to designated address, called by anyone
    function getRefund() public {
        uint myBalance = address(this).balance;
        (bool success, ) = refund.call{value: myBalance}("");
        require(success, "fail to get refund");
    }

    /// @dev transfer token owned(if accidentally send to this), only owner of this contract can do that
    function transfer(address token, address to, uint amount) public onlyOwner returns (bool) {
        return IERC20(token).transfer(to, amount);
    }

    /// @dev config designated addresses
    function setAddresses(address _l1GatewayRouter, address _l2Treasury, address _refund) public onlyOwner {
        l1GatewayRouter = _l1GatewayRouter;
        l2Treasury = _l2Treasury;
        refund = _refund;
    }

    function getSelector(bytes memory data) private pure returns(bytes4 selector) {
        assembly {
        // load 32 bytes into `selector` from `data` skipping the first 32 bytes
        // bytes always have 32 byte header which needs to be skipped, i.e. first byte start at location 32
        selector := mload(add(data, 32))
        }
    }

    function extractCalldata(bytes memory calldataWithSelector) private pure returns (bytes memory) {
        bytes memory calldataWithoutSelector;

        require(calldataWithSelector.length >= 4);

        assembly {
            let totalLength := mload(calldataWithSelector)
            let targetLength := sub(totalLength, 4)
            calldataWithoutSelector := mload(0x40)
            
            // Set the length of callDataWithoutSelector (initial length - 4)
            mstore(calldataWithoutSelector, targetLength)

            // Mark the memory space taken for callDataWithoutSelector as allocated
            mstore(0x40, add(0x20, targetLength))

            // Process first 32 bytes (we only take the last 28 bytes)
            mstore(add(calldataWithoutSelector, 0x20), shl(0x20, mload(add(calldataWithSelector, 0x20))))

            // Process all other data by chunks of 32 bytes
            for { let i := 0x1C } lt(i, targetLength) { i := add(i, 0x20) } {
                mstore(add(add(calldataWithoutSelector, 0x20), i), mload(add(add(calldataWithSelector, 0x20), add(i, 0x04))))
            }
        }

        return calldataWithoutSelector;
    }
}
