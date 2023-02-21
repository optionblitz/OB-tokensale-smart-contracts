// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

interface IERC20 {
    function balanceOf(address holder) external view returns (uint balance);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

}

contract L1GatewayRouter {
    // simulation of arbitrum L1 gateway router
    // caller must set allowance(of _token) to this contract
    // for the call to work
    function outboundTransfer(
        address _token,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable returns (bytes memory) {
        _maxGas;_gasPriceBid;_data;
        IERC20(_token).transferFrom(msg.sender, _to, _amount);
        return "";
    }   
}