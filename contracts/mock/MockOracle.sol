// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";

contract MockOracle {

  struct Request {
    address callbackAddr;
    bytes4 callbackFunctionId;
  }

  address public sender;
  address public callbackAddress;
  bytes public data;
  bytes4 public func;
  bytes32 public requestId;

  function onTokenTransfer(
    address _sender,
    uint256 amount,
    bytes memory _data
  ) public {
    assembly {
      // solhint-disable-next-line avoid-low-level-calls
      mstore(add(_data, 36), _sender) // ensure correct sender is passed
      // solhint-disable-next-line avoid-low-level-calls
      mstore(add(_data, 68), amount) // ensure correct amount is passed
    }
    // solhint-disable-next-line avoid-low-level-calls
    (bool success, ) = address(this).delegatecall(_data); // calls oracleRequest
    require(success, "Unable to create request");
  }

  function oracleRequest(
    address _sender,
    uint256 _payment,
    bytes32 _specId,
    address _callbackAddress,
    bytes4 _callbackFunctionId,
    uint256 _nonce,
    uint256 _dataVersion,
    bytes calldata _data
  ) external {
    requestId = keccak256(abi.encodePacked(_sender, _nonce));
    // solhint-disable-next-line not-rely-on-time
    func = _callbackFunctionId;
    callbackAddress = _callbackAddress;
    data = _data;
    _payment;
    _specId;
    _dataVersion;
  }
  
  function fulfillOracleRequest(bytes memory _data)
    external
    returns (bool)
  {
    (bool success, bytes memory stuff) = callbackAddress.call(
        abi.encodeWithSignature("_bet_add(address,uint256,uint256,uint256,uint256,bool,bool)", address(this), 1000, 0, 100, 100, true, false)
    ); // solhint-disable-line avoid-low-level-calls
    _data;
    data = stuff;
    console.log('status: ', success);
    return success;
  }
}
