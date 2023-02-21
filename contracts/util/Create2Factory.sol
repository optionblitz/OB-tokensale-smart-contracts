// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Create2Factory {
    
    event Deploy(address indexed deployer, uint indexed salt, address addr);

    /// @dev deploy contract with deterministic address
    /// @param bytecode contract byte code + optional abi.encodePacked() constructor parameters
    /// @param _salt random salt value
    function deploy(bytes memory bytecode, uint _salt) external {
        address addr;
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), _salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        emit Deploy(msg.sender, _salt, addr);
    }
}
