import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const ONE_ETHER = ethers.parseEther('1');
const LOCK_SECONDS = 7n * 24n * 60n * 60n;

async function deploy() {
  const [buyer, seller, arbiter, stranger] = await ethers.getSigners();
  const escrow = await ethers.deployContract('Escrow');
  await escrow.waitForDeployment();
  return { escrow, buyer, seller, arbiter, stranger };
}

async function fundDeal() {
  const ctx = await deploy();
  await ctx.escrow
    .connect(ctx.buyer)
    .fund(ctx.seller.address, ctx.arbiter.address, LOCK_SECONDS, { value: ONE_ETHER });
  return { ...ctx, dealId: 1n };
}

describe('Escrow', () => {
  describe('fund', () => {
    it('locks the funds and records the counterparties', async () => {
      const { escrow, buyer, seller, arbiter } = await fundDeal();

      const deal = await escrow.getDeal(1n);
      expect(deal.buyer).to.equal(buyer.address);
      expect(deal.seller).to.equal(seller.address);
      expect(deal.arbiter).to.equal(arbiter.address);
      expect(deal.amount).to.equal(ONE_ETHER);
      expect(deal.state).to.equal(1n); // Funded
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(ONE_ETHER);
    });

    it('emits DealFunded', async () => {
      const { escrow, buyer, seller, arbiter } = await deploy();

      await expect(
        escrow.connect(buyer).fund(seller.address, arbiter.address, LOCK_SECONDS, {
          value: ONE_ETHER,
        }),
      )
        .to.emit(escrow, 'DealFunded')
        .withArgs(1n, buyer.address, seller.address, ONE_ETHER);
    });

    it('rejects a zero value deal', async () => {
      const { escrow, buyer, seller, arbiter } = await deploy();

      await expect(
        escrow.connect(buyer).fund(seller.address, arbiter.address, LOCK_SECONDS, { value: 0 }),
      ).to.be.revertedWithCustomError(escrow, 'NoValue');
    });

    it('rejects the buyer as their own seller', async () => {
      const { escrow, buyer, arbiter } = await deploy();

      await expect(
        escrow.connect(buyer).fund(buyer.address, arbiter.address, LOCK_SECONDS, {
          value: ONE_ETHER,
        }),
      ).to.be.revertedWithCustomError(escrow, 'InvalidCounterparty');
    });

    it('rejects a missing arbiter and a zero lock', async () => {
      const { escrow, buyer, seller, arbiter } = await deploy();

      await expect(
        escrow.connect(buyer).fund(seller.address, ethers.ZeroAddress, LOCK_SECONDS, {
          value: ONE_ETHER,
        }),
      ).to.be.revertedWithCustomError(escrow, 'InvalidCounterparty');

      await expect(
        escrow.connect(buyer).fund(seller.address, arbiter.address, 0, { value: ONE_ETHER }),
      ).to.be.revertedWithCustomError(escrow, 'InvalidDeadline');
    });
  });

  describe('release', () => {
    it('pays the seller when the buyer confirms', async () => {
      const { escrow, buyer, seller, dealId } = await fundDeal();

      await expect(escrow.connect(buyer).release(dealId)).to.changeEtherBalances(
        [seller, escrow],
        [ONE_ETHER, -ONE_ETHER],
      );
      expect((await escrow.getDeal(dealId)).state).to.equal(2n); // Released
    });

    it('lets the arbiter settle in the seller’s favour', async () => {
      const { escrow, arbiter, seller, dealId } = await fundDeal();

      await expect(escrow.connect(arbiter).release(dealId)).to.changeEtherBalance(
        seller,
        ONE_ETHER,
      );
    });

    it('refuses anyone else', async () => {
      const { escrow, stranger, seller, dealId } = await fundDeal();

      await expect(escrow.connect(stranger).release(dealId)).to.be.revertedWithCustomError(
        escrow,
        'NotAuthorised',
      );
      // Not even the seller can pay themselves.
      await expect(escrow.connect(seller).release(dealId)).to.be.revertedWithCustomError(
        escrow,
        'NotAuthorised',
      );
    });

    it('cannot be released twice', async () => {
      const { escrow, buyer, dealId } = await fundDeal();
      await escrow.connect(buyer).release(dealId);

      await expect(escrow.connect(buyer).release(dealId)).to.be.revertedWithCustomError(
        escrow,
        'WrongState',
      );
    });
  });

  describe('refund', () => {
    it('blocks the buyer until the deadline passes', async () => {
      const { escrow, buyer, dealId } = await fundDeal();

      await expect(escrow.connect(buyer).refund(dealId)).to.be.revertedWithCustomError(
        escrow,
        'DeadlineNotReached',
      );

      await time.increase(LOCK_SECONDS + 1n);
      await expect(escrow.connect(buyer).refund(dealId)).to.changeEtherBalance(buyer, ONE_ETHER);
      expect((await escrow.getDeal(dealId)).state).to.equal(3n); // Refunded
    });

    it('lets the arbiter refund immediately', async () => {
      const { escrow, arbiter, buyer, dealId } = await fundDeal();

      await expect(escrow.connect(arbiter).refund(dealId)).to.changeEtherBalance(buyer, ONE_ETHER);
    });

    it('refuses a stranger', async () => {
      const { escrow, stranger, dealId } = await fundDeal();

      await expect(escrow.connect(stranger).refund(dealId)).to.be.revertedWithCustomError(
        escrow,
        'NotAuthorised',
      );
    });

    it('cannot refund a released deal', async () => {
      const { escrow, buyer, arbiter, dealId } = await fundDeal();
      await escrow.connect(buyer).release(dealId);

      await expect(escrow.connect(arbiter).refund(dealId)).to.be.revertedWithCustomError(
        escrow,
        'WrongState',
      );
    });
  });

  it('keeps concurrent deals independent', async () => {
    const { escrow, buyer, seller, arbiter, stranger } = await deploy();

    await escrow.connect(buyer).fund(seller.address, arbiter.address, LOCK_SECONDS, {
      value: ONE_ETHER,
    });
    await escrow.connect(stranger).fund(seller.address, arbiter.address, LOCK_SECONDS, {
      value: ONE_ETHER * 2n,
    });

    await escrow.connect(buyer).release(1n);

    expect((await escrow.getDeal(1n)).state).to.equal(2n);
    expect((await escrow.getDeal(2n)).state).to.equal(1n);
    expect((await escrow.getDeal(2n)).amount).to.equal(ONE_ETHER * 2n);
  });
});
