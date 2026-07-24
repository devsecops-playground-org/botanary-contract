// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Botanary marketplace escrow
/// @notice Holds a buyer's funds until the buyer confirms delivery, an arbiter
///         resolves a dispute, or the delivery deadline passes.
contract Escrow {
    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Deal {
        address buyer;
        address seller;
        address arbiter;
        uint256 amount;
        uint64 deadline;
        State state;
    }

    uint256 public nextDealId = 1;

    mapping(uint256 => Deal) private _deals;

    event DealFunded(
        uint256 indexed dealId, address indexed buyer, address indexed seller, uint256 amount
    );
    event DealReleased(uint256 indexed dealId, address indexed seller, uint256 amount);
    event DealRefunded(uint256 indexed dealId, address indexed buyer, uint256 amount);

    error InvalidCounterparty();
    error InvalidDeadline();
    error NoValue();
    error NotAuthorised();
    error DeadlineNotReached();
    error WrongState();
    error TransferFailed();

    /// @notice Lock funds for a purchase.
    /// @param seller Who receives the funds once the deal is released.
    /// @param arbiter Who may resolve the deal either way while it is open.
    /// @param lockSeconds How long the buyer must wait before self-refunding.
    function fund(address seller, address arbiter, uint64 lockSeconds)
        external
        payable
        returns (uint256 dealId)
    {
        if (seller == address(0) || seller == msg.sender) revert InvalidCounterparty();
        if (arbiter == address(0)) revert InvalidCounterparty();
        if (lockSeconds == 0) revert InvalidDeadline();
        if (msg.value == 0) revert NoValue();

        dealId = nextDealId++;
        _deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            arbiter: arbiter,
            amount: msg.value,
            deadline: uint64(block.timestamp) + lockSeconds,
            state: State.Funded
        });

        emit DealFunded(dealId, msg.sender, seller, msg.value);
    }

    /// @notice Pay the seller. Callable by the buyer at any time, or the arbiter.
    function release(uint256 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != State.Funded) revert WrongState();
        if (msg.sender != deal.buyer && msg.sender != deal.arbiter) revert NotAuthorised();

        // State is settled before the transfer, so a re-entrant call finds the
        // deal already released and reverts on the state check.
        uint256 amount = deal.amount;
        deal.amount = 0;
        deal.state = State.Released;

        emit DealReleased(dealId, deal.seller, amount);
        _pay(deal.seller, amount);
    }

    /// @notice Return the funds to the buyer. The arbiter may do this at any
    ///         time; the buyer only once the delivery deadline has passed.
    function refund(uint256 dealId) external {
        Deal storage deal = _deals[dealId];
        if (deal.state != State.Funded) revert WrongState();

        if (msg.sender == deal.buyer) {
            if (block.timestamp < deal.deadline) revert DeadlineNotReached();
        } else if (msg.sender != deal.arbiter) {
            revert NotAuthorised();
        }

        uint256 amount = deal.amount;
        deal.amount = 0;
        deal.state = State.Refunded;

        emit DealRefunded(dealId, deal.buyer, amount);
        _pay(deal.buyer, amount);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
