// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract BiconomyForwarder {
    using ECDSA for bytes32;

    // Cache the domain separator as an immutable value, but also store the chain id that it corresponds to, in order to
    // invalidate the cached domain separator if the chain id changes.
    // this are different from the base EIP712 as that is V4, here use V3(no chainId but salt)
    bytes32 public immutable _CACHED_DOMAIN_SEPARATOR;
    uint256 public immutable _CACHED_CHAIN_ID;
    address public immutable _CACHED_THIS;

    bytes32 public immutable _HASHED_NAME;
    bytes32 public immutable _HASHED_VERSION;
    bytes32 public immutable _DOMAIN_TYPE_HASH;

    struct ERC20ForwardRequest {
        address from;
        address to;
        address token;
        uint256 txGas;
        uint256 tokenGasPrice;
        uint256 batchId;
        uint256 batchNonce;
        uint256 deadline;
        bytes data;
    }

    //0xc223e141cca349f82125254307136aaa76c49db05db9f480cc1af6f3bdd453af
    bytes32 public constant _REQUEST_TYPEHASH =
        keccak256("ERC20ForwardRequest(address from,address to,address token,uint256 txGas,uint256 tokenGasPrice,uint256 batchId,uint256 batchNonce,uint256 deadline,bytes data)");
    mapping(address => uint256) private _nonces;
    mapping(address => mapping(uint256 => uint256)) nonces;

    constructor() {
        bytes32 hashedName = keccak256(bytes("Biconomy Forwarder"));
        bytes32 hashedVersion = keccak256(bytes("1"));
        //0x36c25de3e541d5d970f66e4210d728721220fff5c077cc6cd008b3a0c62adab7
        bytes32 domainTypeHash = keccak256(
            "EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)"
        );
        _HASHED_NAME = hashedName;
        _HASHED_VERSION = hashedVersion;
        _CACHED_CHAIN_ID = block.chainid;
        //0x7453b2e400472e35ddc60608a2a484fefa6dd978a15dcf5259c44805cba232b2
        _CACHED_DOMAIN_SEPARATOR = _buildDomainSeparatorV3(domainTypeHash, hashedName, hashedVersion);
        _CACHED_THIS = address(this);
        _DOMAIN_TYPE_HASH = domainTypeHash;
    }

    function EIP712_DOMAIN_TYPE() public pure returns(string memory) {
        return "EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)";
    } 

    function REQUEST_TYPEHASH() public pure returns(bytes32) {
        return 0xc223e141cca349f82125254307136aaa76c49db05db9f480cc1af6f3bdd453af;
    }

    function getNonce(address from, uint256 batchId) public view returns (uint256) {
        //batchId;
        //return _nonces[from];
        return nonces[from][batchId];
    }

    function encodeRequest(ERC20ForwardRequest calldata req) public pure returns (bytes memory) {
        return abi.encode(_REQUEST_TYPEHASH, req.from, req.to, req.token, req.txGas, req.tokenGasPrice, req.batchId, req.batchNonce, req.deadline, keccak256(req.data));
    }
    function calcRequestHash(ERC20ForwardRequest calldata req) public view returns (bytes32) {
        return _hashTypedDataV3(keccak256(encodeRequest(req)));
        
    }
    function verifyEIP712(ERC20ForwardRequest calldata req, bytes32 domainSeparator, bytes calldata signature) public view returns (bool) {
        address signer = _hashTypedDataV3(
            keccak256(encodeRequest(req))
        ).recover(signature);
        domainSeparator; // ignore just for function params parity to real biconomy inplementation
        require(signer == req.from,"sig not match");
        require(nonces[req.from][req.batchId] == req.batchNonce,"nonce not match");
        return true;
    }

    function _verifySigEIP712(
        ERC20ForwardRequest calldata req,
        bytes32 domainSeparator,
        bytes memory sig)
    public
    view
    {   
        uint256 id;
        /* solhint-disable-next-line no-inline-assembly */
        assembly {
            id := chainid()
        }
        require(req.deadline == 0 || block.timestamp + 20 <= req.deadline, "request expired");
        bytes32 digest =
            keccak256(abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                keccak256(abi.encode(_REQUEST_TYPEHASH,
                            req.from,
                            req.to,
                            req.token,
                            req.txGas,
                            req.tokenGasPrice,
                            req.batchId,
                            nonces[req.from][req.batchId],
                            req.deadline,
                            keccak256(req.data)
                        ))));
        require(digest.recover(sig) == req.from, "signature mismatch");
    }

    function executeEIP712(ERC20ForwardRequest calldata req, bytes32 domainSeparator, bytes calldata signature)
        public
        payable
        returns (bool, bytes memory)
    {
        require(domainSeparator == _domainSeparatorV3(), "BiconomyForwarder: wrong domain type hash");
        require(verifyEIP712(req, _DOMAIN_TYPE_HASH, signature), "BiconomyForwarder: signature does not match request");
        nonces[req.from][req.batchId]++;
        //_nonces[req.from] = req.batchNonce + 1;

        (bool success, bytes memory returndata) = req.to.call{gas: req.txGas, value: msg.value}(
            abi.encodePacked(req.data, req.from)
        );

        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.limo/blog/ethereum-gas-dangers/
        if (gasleft() <= req.txGas / 63) {
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

    /**
     * @dev Returns the domain separator for the current chain.
     * this is V3 which don't use chainId but salt(with chainId value)
     */
    function _domainSeparatorV3() internal view returns (bytes32) {
        if (address(this) == _CACHED_THIS && block.chainid == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        } else {
            return _buildDomainSeparatorV3(_DOMAIN_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION);
        }
    }

    /**
     * @dev Returns the domain separator for the given chainId and verifyingContract.
     * this is V3 which don't use chainId but salt(with chainId value)
     * only here as a helper for cross checking other contract values
     */
    function calcDomainSeparatorV3(
        uint chainId,
        address verifyingContract
    ) public view returns (bytes32) {
        // "EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)
        return keccak256(abi.encode(_DOMAIN_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, verifyingContract, bytes32(chainId)));
    }

    function _buildDomainSeparatorV3(
        bytes32 domainTypeHash,
        bytes32 nameHash,
        bytes32 versionHash
    ) private view returns (bytes32) {
        // "EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)
        return keccak256(abi.encode(domainTypeHash, nameHash, versionHash, address(this), bytes32(block.chainid)));
    }

    /**
     * @dev Given an already https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct[hashed struct], this
     * function returns the hash of the fully encoded EIP712 message for this domain.
     *
     * This hash can be used together with {ECDSA-recover} to obtain the signer of a message. For example:
     *
     * ```solidity
     * bytes32 digest = _hashTypedDataV3(keccak256(abi.encode(
     *     keccak256("Mail(address to,string contents)"),
     *     mailTo,
     *     keccak256(bytes(mailContents))
     * )));
     * address signer = ECDSA.recover(digest, signature);
     * ```
     */
    function _hashTypedDataV3(bytes32 structHash) internal view virtual returns (bytes32) {
        return ECDSA.toTypedDataHash(_domainSeparatorV3(), structHash);
    }

}
