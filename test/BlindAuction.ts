import {
  time,
  loadFixture,
} from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  parseEther,
  solidityPackedKeccak256,
  encodeBytes32String,
} from 'ethers';

const generateRandomDeposit = () => {
  return Math.floor(Math.random() * 100);
};

describe('BlindAuction', () => {
  const deployBlindAuctionFixture = async () => {
    const BID_DURATION = 60 * 60 * 1; // 1 hour
    const [owner, bidder1, bidder2, bidder3] = await ethers.getSigners();

    const bidData = {
      bidder1: {
        values: ['0.1', '0.7'],
        secrets: ['secret1', 'secret2'],
      },
      bidder2: {
        values: ['0.5', '0.5'],
        secrets: ['something1', 'something2'],
      },
      bidder3: {
        values: ['0.4', '0.6', '0.8'],
        secrets: ['random1', 'random2', 'random3'],
      },
    };

    const BlindAuction = await ethers.getContractFactory('BlindAuction');

    const blindAuction = await BlindAuction.deploy(BID_DURATION);

    return { blindAuction, owner, bidder1, bidder2, bidder3, bidData };
  };

  describe('Deployment', () => {
    describe('Validations ', () => {
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
  });

  describe('Bidding', () => {
    describe('Validations', () => {
      it('Should not allow bidding after auction end', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        const hashedBidBeforeAuctionEnd = solidityPackedKeccak256(
          ['uint', 'bytes32'],
          [
            parseEther(bidData['bidder1'].values[0]),
            encodeBytes32String(bidData['bidder1'].secrets[0]),
          ]
        );

        const hashedBidAfterAuctionEnd = solidityPackedKeccak256(
          ['uint', 'bytes32'],
          [
            parseEther(bidData['bidder1'].values[1]),
            encodeBytes32String(bidData['bidder1'].secrets[1]),
          ]
        );

        await expect(
          blindAuction.connect(bidder1).bid(hashedBidBeforeAuctionEnd)
        )
          .to.emit(blindAuction, 'SuccessfulBid')
          .withArgs(bidder1.address);

        const TIME = 60 * 60 * 2;

        time.increase(TIME);

        await expect(
          blindAuction.connect(bidder1).bid(hashedBidAfterAuctionEnd)
        ).to.be.revertedWithCustomError(blindAuction, 'TooLate');
      });
    });

    describe('Events', () => {
      it('Should allow bidding', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        const hashedBid = solidityPackedKeccak256(
          ['uint', 'bytes32'],
          [
            parseEther(bidData.bidder1.values[0]),
            encodeBytes32String(bidData.bidder1.secrets[0]),
          ]
        );

        expect(await blindAuction.connect(bidder1).bid(hashedBid))
          .to.emit(blindAuction, 'SuccessfulBid')
          .withArgs(bidder1.address);
      });

      it('Should allow multiple bids by same bidder', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        bidData['bidder1'].values.map(async (value, index) => {
          const hashedBid = solidityPackedKeccak256(
            ['uint', 'bytes32'],
            [
              parseEther(value),
              encodeBytes32String(bidData.bidder1.secrets[index]),
            ]
          );

          expect(
            await blindAuction.connect(bidder1).bid(hashedBid, {
              value: generateRandomDeposit(),
            })
          )
            .to.emit(blindAuction, 'SuccessfulBid')
            .withArgs(bidder1.address);
        });
      });
    });
  });

  describe('Reveal', () => {
    describe('Validations', () => {
      it('Should revert if bid in progress', async () => {
        const { blindAuction, bidder1, bidData } = await loadFixture(
          deployBlindAuctionFixture
        );

        bidData['bidder1'].values.forEach(async (value, index) => {
          const hashedBid = solidityPackedKeccak256(
            ['uint', 'bytes32'],
            [
              parseEther(value),
              encodeBytes32String(bidData.bidder1.secrets[index]),
            ]
          );

          await expect(
            blindAuction.connect(bidder1).bid(hashedBid, {
              value: generateRandomDeposit(),
            })
          )
            .to.emit(blindAuction, 'SuccessfulBid')
            .withArgs(bidder1.address);
        });

        await expect(
          blindAuction
            .connect(bidder1)
            .revealBids(
              bidData.bidder1.values.map(parseEther),
              bidData.bidder1.secrets.map(encodeBytes32String)
            )
        ).to.be.revertedWithCustomError(blindAuction, 'BidStillInProgress');
      });
    });

    describe('Events', () => {
      it('Should reveal bid', async () => {
        const { blindAuction, bidder3, bidder2, bidder1, bidData } =
          await loadFixture(deployBlindAuctionFixture);

        //@ts-ignore
        Object.keys(bidData).forEach(async (bidder) => {
          //@ts-ignore
          const values = bidData[bidder].values.map(parseEther);

          //@ts-ignore
          const secrets = bidData[bidder].secrets.map(encodeBytes32String);

          //@ts-ignore
          values.forEach(async (value, index) => {
            const hashedBid = solidityPackedKeccak256(
              ['uint', 'bytes32'],
              [value, secrets[index]]
            );

            await expect(
              blindAuction.connect(bidder1).bid(hashedBid, {
                value: generateRandomDeposit(),
              })
            )
              .to.emit(blindAuction, 'SuccessfulBid')
              .withArgs(bidder1.address);
          });
        });

        // const values = bidData['bidder3'].values.map(parseEther);
        // const secrets = bidData['bidder3'].secrets.map(encodeBytes32String);

        // bidData['bidder3'].values.forEach(async (value, index) => {
        //   const hashedBid = solidityPackedKeccak256(
        //     ['uint', 'bytes32'],
        //     [
        //       parseEther(value),
        //       encodeBytes32String(bidData.bidder3.secrets[index]),
        //     ]
        //   );

        //   await expect(blindAuction.connect(bidder3).bid(hashedBid))
        //     .to.emit(blindAuction, 'SuccessfulBid')
        //     .withArgs(bidder2.address);
        // });

        const TIME = 60 * 60 * 2;

        time.increase(TIME);

        // console.log(
        //   'bids',
        //   await blindAuction.connect(bidder3).getBidsByBidder(bidder3.address)
        // );

        // await expect(blindAuction.connect(bidder3).revealBids(values, secrets))
        //   .to.emit(blindAuction, 'HighestBidIncreased')
        //   .withArgs(bidder3.address);
      });
    });

    // it('Should not allow revealing before auction end', async () => {});

    // it('Should not allow revealing after revealBids end', async () => {});
  });
});
