// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";

//  @dev This is a time-based Blind Auction.
contract BlindAuction {
    struct Bid {
        bytes32 blindBid;
        uint deposit;
    }

    mapping(address => Bid[]) public bids;
    mapping(address => uint) refunds;

    uint public auctionStartTime;
    uint public auctionEndTime;
    uint public auctionDuration;

    uint highestBid;
    address highestBidder;
    address payable public beneficiary;

    event AuctionHasStarted(uint time);
    event RefundProcessed(address indexed bidder, uint amount);
    event AuctionHasEnded(uint amount, address bidder);
    event SuccessfulBid(address indexed bidder);
    event HighestBidIncreased(address indexed bidder);

    error TooEarly(uint time);
    error TooLate(uint time);
    error NotBeneficiary(address sender);
    error BidStillInProgress(uint time);
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
        if (_time < auctionEndTime) {
            revert BidStillInProgress({time: _time});
        }
        _;
    }

    modifier isBeneficiary(address _address) {
        if (_address != beneficiary) {
            revert NotBeneficiary({sender: _address});
        }
        _;
    }

    constructor(uint _auctionDuration) {
        auctionStartTime = block.timestamp;
        auctionDuration = _auctionDuration;
        auctionEndTime = block.timestamp + auctionDuration;

        beneficiary = payable(msg.sender);

        emit AuctionHasStarted(block.timestamp);
    }

    function getNoOfBidsByBidder(address bidder) external view returns (uint) {
        return bids[bidder].length;
    }

    function getBidsByBidder(
        address bidder
    ) external view returns (Bid[] memory) {
        return bids[bidder];
    }

    function bid(
        bytes32 _hashedBid
    ) external payable biddingIsActive(block.timestamp) {
        console.log("Deposit is %o", msg.value);
        bids[msg.sender].push(Bid({blindBid: _hashedBid, deposit: msg.value}));
        emit SuccessfulBid(msg.sender);
    }

    function revealBids(
        uint[] calldata _values,
        bytes32[] calldata _secrets
    ) external biddingHasEnded(block.timestamp) {
        uint lengthOfBids = bids[msg.sender].length;

        console.log("Length of bids is %o", lengthOfBids);

        if (_values.length != lengthOfBids && _secrets.length != lengthOfBids) {
            revert InCompleteBidData(msg.sender);
        }

        uint totalRefund = 0;

        for (uint i = 0; i < bids[msg.sender].length; i++) {
            (uint value, bytes32 secret) = (_values[i], _secrets[i]);

            Bid storage currentBid = bids[msg.sender][i];

            console.log("Bid Deposit is %o", currentBid.deposit);

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

                    emit HighestBidIncreased(msg.sender);
                } else {
                    refunds[msg.sender] += currentBid.deposit;
                }
            }

            currentBid.blindBid = bytes32(0);
        }

        if (msg.sender != highestBidder) {
            refunds[msg.sender] = totalRefund;
        }

        console.log("Total Refund is %o ", totalRefund);
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
