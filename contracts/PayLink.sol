// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PayLink — escrowed invoices in tUSD8 on Aevum testnet
/// @notice A merchant creates an invoice, a buyer pays it into escrow, and the
/// funds release only when the buyer confirms delivery (or a timeout passes).
/// The buyer can also pay gaslessly: an EIP-2612 permit (one transaction) or an
/// EIP-3009 signed authorization submitted by any relayer / AI agent.
/// @dev Testnet only. Token is the real tUSD8 on Aevum (0x456569838f1d43009A91ebA4263147Afd7233483).
/// No admin keys, no upgradeability, no fees taken by this contract.
interface ITUSD8 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

contract PayLink {
    ITUSD8 public immutable token;

    uint256 public constant MAX_INVOICE_AMOUNT = 1_000_000 * 1e6; // 1,000,000 tUSD8 sanity cap
    uint256 public constant MAX_INVOICE_LIFETIME = 30 days;
    uint256 public constant CONFIRM_WINDOW = 7 days; // buyer has 7 days to confirm after paying

    enum Status { Created, Paid, Disputed, Released, Refunded, Cancelled }

    struct Invoice {
        address payee;      // merchant who gets paid
        address payer;      // buyer who paid (zero until paid)
        uint256 amount;     // tUSD8, 6 decimals
        uint64 expiry;      // pay-by deadline (unix seconds)
        uint64 paidAt;      // when the buyer paid (0 until paid)
        Status status;
        string memo;
    }

    uint256 public invoiceCount;
    mapping(uint256 => Invoice) public invoices;

    event InvoiceCreated(uint256 indexed id, address indexed payee, uint256 amount, uint64 expiry, string memo);
    event Paid(uint256 indexed id, address indexed payer, uint256 amount);
    event Confirmed(uint256 indexed id, address indexed payer);
    event Released(uint256 indexed id, address indexed payee, uint256 amount);
    event Refunded(uint256 indexed id, address indexed payer, uint256 amount);
    event Disputed(uint256 indexed id, address indexed payer);
    event DisputeResolved(uint256 indexed id, bool refunded);
    event Cancelled(uint256 indexed id, address indexed payee);

    bool private locked;

    modifier nonReentrant() {
        require(!locked, "PayLink: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyPayer(uint256 id) {
        require(invoices[id].payer == msg.sender, "PayLink: not the payer");
        _;
    }

    modifier onlyPayee(uint256 id) {
        require(invoices[id].payee == msg.sender, "PayLink: not the payee");
        _;
    }

    constructor(address token_) {
        require(token_ != address(0), "PayLink: zero token");
        token = ITUSD8(token_);
    }

    /// @notice Merchant creates an invoice payable in tUSD8.
    function createInvoice(address payee, uint256 amount, string calldata memo, uint64 expiry) external returns (uint256 id) {
        require(payee != address(0), "PayLink: zero payee");
        require(amount > 0 && amount <= MAX_INVOICE_AMOUNT, "PayLink: bad amount");
        require(expiry > block.timestamp, "PayLink: expiry in past");
        require(expiry <= block.timestamp + MAX_INVOICE_LIFETIME, "PayLink: expiry too far");

        id = ++invoiceCount;
        invoices[id] = Invoice({
            payee: payee,
            payer: address(0),
            amount: amount,
            expiry: expiry,
            paidAt: 0,
            status: Status.Created,
            memo: memo
        });
        emit InvoiceCreated(id, payee, amount, expiry, memo);
    }

    /// @notice Buyer pays an open invoice. Requires a prior approve().
    function payInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = invoices[id];
        _requirePayable(inv);
        require(token.transferFrom(msg.sender, address(this), inv.amount), "PayLink: pull failed");
        _recordPaid(inv, msg.sender);
        emit Paid(id, msg.sender, inv.amount);
    }

    /// @notice Buyer pays with an EIP-2612 permit: approval + payment in one tx.
    function payWithPermit(uint256 id, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        Invoice storage inv = invoices[id];
        _requirePayable(inv);
        require(value == inv.amount, "PayLink: value != amount");
        token.permit(msg.sender, address(this), value, deadline, v, r, s);
        require(token.transferFrom(msg.sender, address(this), inv.amount), "PayLink: pull failed");
        _recordPaid(inv, msg.sender);
        emit Paid(id, msg.sender, inv.amount);
    }

    /// @notice Gasless pay: anyone (a relayer or AI agent) submits the buyer's
    /// EIP-3009 signed authorization. The nonce MUST equal bytes32(invoice id),
    /// which binds the signature to this one invoice so it cannot be replayed
    /// for a different invoice. `validBefore` caps the signature window.
    function payWithAuthorization(
        uint256 id,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Invoice storage inv = invoices[id];
        _requirePayable(inv);
        require(value == inv.amount, "PayLink: value != amount");
        require(bytes32(id) == _authNonce(id), "PayLink: bad nonce binding");
        // receiveWithAuthorization already pulls the funds into this contract,
        // so _recordPaid must NOT transferFrom again (the buyer never approved).
        token.receiveWithAuthorization(from, address(this), value, validAfter, validBefore, bytes32(id), v, r, s);
        _recordPaid(inv, from);
        emit Paid(id, from, inv.amount);
    }

    /// @notice The nonce an EIP-3009 authorization must carry for invoice `id`.
    function authorizationNonce(uint256 id) external pure returns (bytes32) {
        return bytes32(id);
    }

    /// @notice Buyer confirms delivery: escrow releases to the merchant.
    function confirmDelivery(uint256 id) external nonReentrant onlyPayer(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Paid, "PayLink: not paid");
        inv.status = Status.Released;
        require(token.transfer(inv.payee, inv.amount), "PayLink: release failed");
        emit Confirmed(id, msg.sender);
        emit Released(id, inv.payee, inv.amount);
    }

    /// @notice Merchant claims after the buyer sat on a paid invoice past the
    /// confirm window without confirming or disputing.
    function claimAfterTimeout(uint256 id) external nonReentrant onlyPayee(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Paid, "PayLink: not paid");
        require(block.timestamp > inv.paidAt + CONFIRM_WINDOW, "PayLink: window open");
        inv.status = Status.Released;
        require(token.transfer(inv.payee, inv.amount), "PayLink: claim failed");
        emit Released(id, inv.payee, inv.amount);
    }

    /// @notice Merchant refunds a paid invoice in full (goodwill / undelivered).
    function refundInvoice(uint256 id) external nonReentrant onlyPayee(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Paid || inv.status == Status.Disputed, "PayLink: not refundable");
        inv.status = Status.Refunded;
        require(token.transfer(inv.payer, inv.amount), "PayLink: refund failed");
        emit Refunded(id, inv.payer, inv.amount);
    }

    /// @notice Buyer opens a dispute on a paid invoice (delivery problem).
    function openDispute(uint256 id) external onlyPayer(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Paid, "PayLink: not paid");
        inv.status = Status.Disputed;
        emit Disputed(id, msg.sender);
    }

    /// @notice Merchant resolves a dispute: true = refund the buyer, false = release to merchant.
    function resolveDispute(uint256 id, bool refundBuyer) external nonReentrant onlyPayee(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Disputed, "PayLink: not disputed");
        if (refundBuyer) {
            inv.status = Status.Refunded;
            require(token.transfer(inv.payer, inv.amount), "PayLink: refund failed");
            emit Refunded(id, inv.payer, inv.amount);
        } else {
            inv.status = Status.Released;
            require(token.transfer(inv.payee, inv.amount), "PayLink: release failed");
            emit Released(id, inv.payee, inv.amount);
        }
        emit DisputeResolved(id, refundBuyer);
    }

    /// @notice Merchant cancels an unpaid invoice.
    function cancelInvoice(uint256 id) external onlyPayee(id) {
        Invoice storage inv = invoices[id];
        require(inv.status == Status.Created, "PayLink: not open");
        inv.status = Status.Cancelled;
        emit Cancelled(id, msg.sender);
    }

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    function _requirePayable(Invoice storage inv) internal view {
        require(inv.payee != address(0), "PayLink: no such invoice");
        require(inv.status == Status.Created, "PayLink: not open");
        require(block.timestamp <= inv.expiry, "PayLink: expired");
    }

    function _recordPaid(Invoice storage inv, address payer) internal {
        inv.payer = payer;
        inv.paidAt = uint64(block.timestamp);
        inv.status = Status.Paid;
    }

    function _authNonce(uint256 id) internal pure returns (bytes32) {
        return bytes32(id);
    }
}
