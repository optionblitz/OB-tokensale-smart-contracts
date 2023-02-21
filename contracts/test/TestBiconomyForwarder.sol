// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;


/* this is only used for hardhat testing, do not use in production and trust this as valid ERC2771 forwarder 
 * only use this for test script simulating the 'call via forwarder' code path
 */
contract Test2771Forwarder {

    function execute(address from, address to, bytes calldata data, uint txGas)
        public
        payable
        returns (bool, bytes memory)
    {

        (bool success, bytes memory returndata) = to.call{value: msg.value}(
            abi.encodePacked(data, from)
        );

        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.limo/blog/ethereum-gas-dangers/
        if (gasleft() <= txGas / 63) {
            // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
            // neither revert or assert consume all gas since Solidity 0.8.0
            // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
            /// @solidity memory-safe-assembly
            assembly {
                invalid()
            }
        }
        require(success, "execution failed");
        return (success, returndata);
    }
}
