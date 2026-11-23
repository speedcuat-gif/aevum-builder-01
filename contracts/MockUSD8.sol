// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockUSD8 — local-test stand-in for tUSD8
/// @notice Minimal ERC-20 (6 decimals) with EIP-2612 permit and EIP-3009
/// transfer/receiveWithAuthorization, mirroring the real tUSD8 on Aevum.
/// FOR LOCAL TESTS ONLY. Anyone can mint.
contract MockUSD8 {
    string public constant name = "MockUSD8";
    string public constant symbol = "tUSD8-mock";
    uint8 public constant decimals = 6;
    string public constant version = "1";

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public immutable DOMAIN_SEPARATOR;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockUSD8: allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        require(deadline >= block.timestamp, "MockUSD8: permit expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer == owner && signer != address(0), "MockUSD8: bad permit");
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s
    ) external {
        _useAuthorization(from, to, value, validAfter, validBefore, nonce, TRANSFER_WITH_AUTHORIZATION_TYPEHASH, v, r, s);
    }

    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s
    ) external {
        require(msg.sender == to, "MockUSD8: caller must be recipient");
        _useAuthorization(from, to, value, validAfter, validBefore, nonce, RECEIVE_WITH_AUTHORIZATION_TYPEHASH, v, r, s);
    }

    function _useAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes32 typehash, uint8 v, bytes32 r, bytes32 s
    ) internal {
        require(block.timestamp > validAfter, "MockUSD8: not yet valid");
        require(block.timestamp < validBefore, "MockUSD8: expired");
        require(!authorizationState[from][nonce], "MockUSD8: nonce used");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce))
            )
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer == from && signer != address(0), "MockUSD8: bad authorization");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "MockUSD8: zero to");
        require(balanceOf[from] >= amount, "MockUSD8: balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
