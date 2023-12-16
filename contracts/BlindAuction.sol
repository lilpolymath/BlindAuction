// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

//  @dev This is a time-based Blind Auction.
contract BlindAuction {
    struct Bid {
        bytes32 blindBid;
        uint deposit;
    }

    mapping(address => Bid[]) bids;
    mapping(address => uint) refunds;

    uint public auctionStartTime;
    uint public auctionEndTime;

    uint highestBid;
    address highestBidder;
    address payable beneficiary;

    event AuctionHasStarted(uint time);
    event RefundProcessed(address bidder, uint amount);
    event AuctionHasEnded(uint amount, address bidder);

    error TooEarly(uint time);
    error TooLate(uint time);
    error NoRefundToBeProcessed(address bidder);
    error InCompleteBidData(address bidder);

    modifier biddingIsActive(uint _time) {
        if (_time < auctionStartTime) {
            revert TooEarly({time: _time});
        }

        if (_time > auctionEndTime) {
            revert TooLate({time: _time});
        }
        _;
    }

    modifier biddingHasEnded(uint _time) {
        require(_time > auctionEndTime);
        _;
    }

    modifier isBeneficiary(address _address) {
        require(_address == beneficiary);
        _;
    }

    constructor(uint auctionDuration) {
        auctionStartTime = block.timestamp;
        auctionEndTime = block.timestamp + auctionDuration;

        beneficiary = payable(msg.sender);

        emit AuctionHasStarted(block.timestamp);
    }

    function bid(
        bytes32 _hashedBid
    ) external payable biddingIsActive(block.timestamp) {
        bids[msg.sender].push(Bid({blindBid: _hashedBid, deposit: msg.value}));
    }

    function revealBids(
        uint[] calldata _values,
        bytes32[] calldata _secrets
    ) external biddingHasEnded(block.timestamp) {
        uint lengthOfBids = bids[msg.sender].length;

        if (_values.length != lengthOfBids && _secrets.length != lengthOfBids) {
            revert InCompleteBidData(msg.sender);
        }

        uint totalRefund = 0;

        for (uint i = 0; i < bids[msg.sender].length; i++) {
            (uint value, bytes32 secret) = (_values[i], _secrets[i]);

            Bid storage currentBid = bids[msg.sender][i];

            if (
                currentBid.blindBid ==
                keccak256(abi.encodePacked(value, secret))
            ) {
                if (value <= highestBid || msg.sender == highestBidder) {
                    totalRefund += currentBid.deposit;
                } else if (value > highestBid) {
                    if (highestBidder != address(0)) {
                        refunds[highestBidder] += highestBid;
                    }

                    highestBid = value;
                    highestBidder = msg.sender;
                } else {
                    refunds[msg.sender] += currentBid.deposit;
                }
            }

            currentBid.blindBid = bytes32(0);
        }

        if (msg.sender != highestBidder) {
            refunds[msg.sender] = totalRefund;
        }
    }

    function payBeneficiary()
        external
        payable
        isBeneficiary(msg.sender)
        biddingHasEnded(block.timestamp)
    {
        emit AuctionHasEnded(highestBid, highestBidder);
        beneficiary.transfer(highestBid);
    }

    function processRefund() external payable biddingHasEnded(block.timestamp) {
        address recipient = msg.sender;
        uint amount = refunds[recipient];
        if (amount == 0) {
            revert NoRefundToBeProcessed({bidder: recipient});
        }

        refunds[recipient] = 0;

        payable(recipient).transfer(amount);
        emit RefundProcessed(recipient, amount);
    }
}
