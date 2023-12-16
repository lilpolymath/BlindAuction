import {
  time,
  loadFixture,
} from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import {
  parseEther,
  solidityPackedKeccak256,
  encodeBytes32String,
} from 'ethers';

describe('BlindAuction', () => {
  const deployBlindAuctionFixture = async () => {
    const BID_DURATION = 60 * 60 * 1; // 1 hour
    const [owner, bidder1, bidder2, bidder3] = await ethers.getSigners();

    const bidData = {
      bidder1: {
        values: [parseEther('0.3'), parseEther('0.7')],
        secrets: ['secret1', 'secret2'],
      },
      bidder2: {
        values: [parseEther('0.5'), parseEther('0.5')],
        secrets: ['something1', 'something2'],
      },
      bidder3: {
        values: [parseEther('0.4'), parseEther('0.6'), parseEther('0.8')],
        secrets: ['random1', 'random2', 'random3'],
      },
    };

    const BlindAuction = await ethers.getContractFactory('BlindAuction');

    const blindAuction = await BlindAuction.deploy(BID_DURATION);

    return { blindAuction, owner, bidder1, bidder2, bidder3, bidData };
  };

  describe('Deployment', () => {
    it('Should set the right bidDuration', async () => {
      const { blindAuction } = await loadFixture(deployBlindAuctionFixture);

      expect(await blindAuction.auctionDuration()).to.equal(60 * 60 * 1);
    });

    it('Should set the right beneficiary', async () => {
      const { blindAuction, owner } = await loadFixture(
        deployBlindAuctionFixture
      );

      expect(await blindAuction.beneficiary()).to.equal(owner.address);
    });
  });

  describe('Bidding', () => {
    it('Should allow bidding', async () => {
      const { blindAuction, bidder1, bidData } = await loadFixture(
        deployBlindAuctionFixture
      );

      const hashedBid = solidityPackedKeccak256(
        ['uint', 'bytes32'],
        [
          bidData.bidder1.values[0],
          encodeBytes32String(bidData.bidder1.secrets[0]),
        ]
      );

      await expect(blindAuction.connect(bidder1).bid(hashedBid))
        .to.emit(blindAuction, 'SuccessfulBid')
        .withArgs(bidder1.address);
    });

    it('Should allow multiple bids by same bidder', async () => {
      const { blindAuction, bidder1, bidData } = await loadFixture(
        deployBlindAuctionFixture
      );

      bidData['bidder1'].values.forEach(async (value, index) => {
        const hashedBid = solidityPackedKeccak256(
          ['uint', 'bytes32'],
          [value, encodeBytes32String(bidData.bidder1.secrets[index])]
        );

        if (index === 0) {
          await expect(blindAuction.connect(bidder1).bid(hashedBid))
            .to.emit(blindAuction, 'SuccessfulBid')
            .withArgs(bidder1.address);
        } else {
          await expect(
            blindAuction.connect(bidder1).bid(hashedBid, {
              value: 3,
            })
          )
            .to.emit(blindAuction, 'SuccessfulBid')
            .withArgs(bidder1.address);
        }
      });
    });

    it('Should not allow bidding after auction end', async () => {
      const { blindAuction, bidder1, bidData } = await loadFixture(
        deployBlindAuctionFixture
      );

      const hashedBidBeforeAuctionEnd = solidityPackedKeccak256(
        ['uint', 'bytes32'],
        [
          bidData['bidder1'].values[0],
          encodeBytes32String(bidData['bidder1'].secrets[0]),
        ]
      );

      const hashedBidAfterAuctionEnd = solidityPackedKeccak256(
        ['uint', 'bytes32'],
        [
          bidData['bidder1'].values[0],
          encodeBytes32String(bidData['bidder1'].secrets[0]),
        ]
      );

      await expect(blindAuction.connect(bidder1).bid(hashedBidBeforeAuctionEnd))
        .to.emit(blindAuction, 'SuccessfulBid')
        .withArgs(bidder1.address);

      const TIME = 60 * 60 * 2;

      time.increase(TIME);

      await expect(
        blindAuction.connect(bidder1).bid(hashedBidAfterAuctionEnd)
      ).to.be.revertedWithCustomError(blindAuction, 'TooLate');
    });
  });

  describe('Reveal', () => {
    describe('Validations', () => {
      it('Should allow revert if bid in progress', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        bidData['bidder1'].values.forEach(async (value, index) => {
          const hashedBid = solidityPackedKeccak256(
            ['uint', 'bytes32'],
            [value, encodeBytes32String(bidData.bidder1.secrets[index])]
          );

          if (index === 0) {
            await expect(blindAuction.connect(bidder1).bid(hashedBid))
              .to.emit(blindAuction, 'SuccessfulBid')
              .withArgs(bidder1.address);
          } else {
            await expect(
              blindAuction.connect(bidder1).bid(hashedBid, {
                value: 3,
              })
            )
              .to.emit(blindAuction, 'SuccessfulBid')
              .withArgs(bidder1.address);
          }
        });

        await expect(
          blindAuction
            .connect(bidder1)
            .revealBids(
              bidData.bidder1.values,
              bidData.bidder1.secrets.map(encodeBytes32String)
            )
        ).to.be.revertedWithCustomError(blindAuction, 'BidStillInProgress');
      });
    });

    describe('Events', () => {
      it('Should allow revealing', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        bidData['bidder1'].values.map(async (value, index) => {
          const hashedBid = solidityPackedKeccak256(
            ['uint', 'bytes32'],
            [value, encodeBytes32String(bidData.bidder1.secrets[index])]
          );

          if (index === 0) {
            await expect(blindAuction.connect(bidder1).bid(hashedBid))
              .to.emit(blindAuction, 'SuccessfulBid')
              .withArgs(bidder1.address);
          } else {
            await expect(
              blindAuction.connect(bidder1).bid(hashedBid, {
                value: 3,
              })
            )
              .to.emit(blindAuction, 'SuccessfulBid')
              .withArgs(bidder1.address);
          }
        });

        console.log(blindAuction.bids(bidder1.address));

        const TIME = 60 * 60 * 2;

        time.increase(TIME);

        await expect(
          blindAuction
            .connect(bidder1)
            .revealBids(
              bidData.bidder1.values,
              bidData.bidder1.secrets.map(encodeBytes32String)
            )
        ).to.be.revertedWithCustomError(blindAuction, 'BidStillInProgress');
      });
    });

    // it('Should not allow revealing before auction end', async () => {});

    // it('Should not allow revealing after revealBids end', async () => {});
  });
});
