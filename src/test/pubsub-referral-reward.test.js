import chai from 'chai';
import {
  collectionRewardsMock,
  dbMock,
  mockResponsePath,
  mockUserHandle,
  mockUserName,
  mockUserTelegramID,
  mockWallet,
  mockAccessToken,
  mockTransactionHash,
  collectionUsersMock,
  mockUserTelegramID1,
  collectionTransfersMock,
  mockTransactionHash1,
  patchwalletAuthUrl,
  patchwalletTxUrl,
  patchwalletResolverUrl,
} from './utils.js';
import { handleReferralReward } from '../utils/webhook.js';
import Sinon from 'sinon';
import axios from 'axios';
import 'dotenv/config';
import chaiExclude from 'chai-exclude';

chai.use(chaiExclude);

describe('handleReferralReward function', function () {
  let sandbox;
  let axiosStub;

  beforeEach(function () {
    sandbox = Sinon.createSandbox();
    axiosStub = sandbox
      .stub(axios, 'post')
      .callsFake(async (url, data, options) => {
        if (url === patchwalletAuthUrl) {
          return Promise.resolve({
            data: {
              access_token: mockAccessToken,
            },
          });
        }

        if (url === patchwalletTxUrl) {
          return Promise.resolve({
            data: {
              txHash: mockTransactionHash,
            },
          });
        }

        if (url === patchwalletResolverUrl) {
          return Promise.resolve({
            data: {
              users: [{ accountAddress: mockWallet }],
            },
          });
        }

        if (url === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK) {
          return Promise.resolve({
            result: 'success',
          });
        }
      });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('Should return true and not send any tokens if there are no proper transactions', async function () {
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID,
        recipientTgId: 'anotherRecipient',
      },
      {
        transactionHash: mockTransactionHash1,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'anotherRecipient1',
      },
    ]);

    const result = await handleReferralReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    chai.expect(result).to.be.true;

    chai.expect(
      axiosStub.getCalls().find((e) => e.firstArg === patchwalletTxUrl)
    ).to.be.undefined;
  });

  it('Should not send any tokens and return true if the transaction is already rewarded', async function () {
    await collectionTransfersMock.insertOne({
      transactionHash: mockTransactionHash,
      senderTgId: mockUserTelegramID1,
      recipientTgId: mockUserTelegramID,
    });

    await collectionRewardsMock.insertOne({
      reason: '2x_reward',
      parentTransactionHash: mockTransactionHash,
    });

    const result = await handleReferralReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    chai.expect(result).to.be.true;
    chai.expect(
      axiosStub.getCalls().find((e) => e.firstArg === patchwalletTxUrl)
    ).to.be.undefined;
  });

  it('Should call the sendTokens function properly if the user is new', async function () {
    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      userHandle: mockUserHandle,
      userName: mockUserName,
      patchwallet: mockWallet,
    });
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: mockUserTelegramID,
      },
      {
        transactionHash: mockTransactionHash1,
        senderTgId: mockUserTelegramID1,
        recipientTgId: mockUserTelegramID,
      },
    ]);

    const result = await handleReferralReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    const sendTokensCalls = axiosStub
      .getCalls()
      .filter((e) => e.firstArg === patchwalletTxUrl);

    chai.expect(result).to.be.true;
    chai.expect(sendTokensCalls.length).to.equal(2);
    chai.expect(sendTokensCalls[0].args[1]).to.deep.equal({
      userId: `grindery:${process.env.SOURCE_TG_ID}`,
      chain: 'matic',
      to: [process.env.G1_POLYGON_ADDRESS],
      value: ['0x00'],
      data: [
        '0xa9059cbb00000000000000000000000095222290dd7278aa3ddd389cc1e1d165cc4bafe5000000000000000000000000000000000000000000000002b5e3af16b1880000',
      ],
      auth: '',
    });
    chai.expect(sendTokensCalls[1].args[1]).to.deep.equal({
      userId: `grindery:${process.env.SOURCE_TG_ID}`,
      chain: 'matic',
      to: [process.env.G1_POLYGON_ADDRESS],
      value: ['0x00'],
      data: [
        '0xa9059cbb00000000000000000000000095222290dd7278aa3ddd389cc1e1d165cc4bafe5000000000000000000000000000000000000000000000002b5e3af16b1880000',
      ],
      auth: '',
    });
  });

  it('Should reward only one transaction if duplicate hash', async function () {
    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      userHandle: mockUserHandle,
      userName: mockUserName,
      patchwallet: mockWallet,
    });
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: mockUserTelegramID,
      },
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: mockUserTelegramID,
      },
    ]);

    const result = await handleReferralReward(
      dbMock,
      mockUserTelegramID,
      mockResponsePath,
      mockUserHandle,
      mockUserName,
      mockWallet
    );

    const sendTokensCalls = axiosStub
      .getCalls()
      .filter((e) => e.firstArg === patchwalletTxUrl);

    chai.expect(result).to.be.true;
    chai.expect(sendTokensCalls.length).to.equal(1);
  });

  it('Should insert the rewards properly in the database', async function () {
    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      userHandle: mockUserHandle,
      userName: mockUserName,
      patchwallet: mockWallet,
    });
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
      {
        transactionHash: mockTransactionHash1,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
    ]);

    await handleReferralReward(
      dbMock,
      'newUserTgId',
      'newUserResponsePath',
      'newUserUserHandle',
      'newUserUserName',
      'patchwallet'
    );

    const rewards = await collectionRewardsMock.find({}).toArray();

    chai.expect(rewards.length).to.equal(2);
    chai.expect(rewards[0]).excluding(['_id', 'dateAdded']).to.deep.equal({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: '2x_reward',
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: '50',
      message: 'Referral reward',
      transactionHash: mockTransactionHash,
      parentTransactionHash: mockTransactionHash,
    });
    chai
      .expect(rewards[0].dateAdded)
      .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
    chai.expect(rewards[0].dateAdded).to.be.lessThanOrEqual(new Date());

    chai.expect(rewards[1]).excluding(['_id', 'dateAdded']).to.deep.equal({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: '2x_reward',
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: '50',
      message: 'Referral reward',
      transactionHash: mockTransactionHash,
      parentTransactionHash: mockTransactionHash1,
    });
    chai
      .expect(rewards[1].dateAdded)
      .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
    chai.expect(rewards[1].dateAdded).to.be.lessThanOrEqual(new Date());
  });

  it('Should call FlowXO webhook properly if the user is new', async function () {
    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      userHandle: mockUserHandle,
      userName: mockUserName,
      patchwallet: mockWallet,
    });
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
      {
        transactionHash: mockTransactionHash1,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
    ]);

    await handleReferralReward(
      dbMock,
      'newUserTgId',
      'newUserResponsePath',
      'newUserUserHandle',
      'newUserUserName',
      'patchwallet'
    );

    const flowXOCalls = axiosStub
      .getCalls()
      .filter(
        (e) => e.firstArg === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK
      );
    chai.expect(flowXOCalls.length).to.equal(2);

    chai.expect(flowXOCalls[0].args[1]).excluding(['dateAdded']).to.deep.equal({
      newUserTgId: 'newUserTgId',
      newUserResponsePath: 'newUserResponsePath',
      newUserUserHandle: 'newUserUserHandle',
      newUserUserName: 'newUserUserName',
      newUserPatchwallet: 'patchwallet',
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: '2x_reward',
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: '50',
      message: 'Referral reward',
      transactionHash: mockTransactionHash,
      parentTransactionHash: mockTransactionHash,
    });
    chai
      .expect(flowXOCalls[0].args[1].dateAdded)
      .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
    chai
      .expect(flowXOCalls[0].args[1].dateAdded)
      .to.be.lessThanOrEqual(new Date());

    chai.expect(flowXOCalls[1].args[1]).excluding(['dateAdded']).to.deep.equal({
      newUserTgId: 'newUserTgId',
      newUserResponsePath: 'newUserResponsePath',
      newUserUserHandle: 'newUserUserHandle',
      newUserUserName: 'newUserUserName',
      newUserPatchwallet: 'patchwallet',
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      walletAddress: mockWallet,
      reason: '2x_reward',
      userHandle: mockUserHandle,
      userName: mockUserName,
      amount: '50',
      message: 'Referral reward',
      transactionHash: mockTransactionHash,
      parentTransactionHash: mockTransactionHash1,
    });
    chai
      .expect(flowXOCalls[1].args[1].dateAdded)
      .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
    chai
      .expect(flowXOCalls[1].args[1].dateAdded)
      .to.be.lessThanOrEqual(new Date());
  });

  it('Should return true if there is an error in FlowXO webhook', async function () {
    axiosStub
      .withArgs(process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK)
      .rejects(new Error('Service not available'));

    await collectionUsersMock.insertOne({
      userTelegramID: mockUserTelegramID1,
      responsePath: mockResponsePath,
      userHandle: mockUserHandle,
      userName: mockUserName,
      patchwallet: mockWallet,
    });
    await collectionTransfersMock.insertMany([
      {
        transactionHash: mockTransactionHash,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
      {
        transactionHash: mockTransactionHash1,
        senderTgId: mockUserTelegramID1,
        recipientTgId: 'newUserTgId',
      },
    ]);

    chai.expect(
      await handleReferralReward(
        dbMock,
        'newUserTgId',
        'newUserResponsePath',
        'newUserUserHandle',
        'newUserUserName',
        'patchwallet'
      )
    ).to.be.true;
  });

  describe('PatchWallet transaction error', function () {
    it('Should return false if there is an error during the token sending', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      chai.expect(
        await handleReferralReward(
          dbMock,
          mockUserTelegramID,
          mockResponsePath,
          mockUserHandle,
          mockUserName,
          mockWallet
        )
      ).to.be.false;
    });

    it('Should return false if there is 1/2 error during the token sending', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      chai.expect(
        await handleReferralReward(
          dbMock,
          mockUserTelegramID,
          mockResponsePath,
          mockUserHandle,
          mockUserName,
          mockWallet
        )
      ).to.be.false;
    });

    it('Should insert only 1 element in reward database if there is 1/2 error during the token sending', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      await handleReferralReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      );

      const rewards = await collectionRewardsMock.find({}).toArray();

      chai.expect(rewards.length).to.equal(1);
      chai.expect(rewards[0]).excluding(['_id', 'dateAdded']).to.deep.equal({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        walletAddress: mockWallet,
        reason: '2x_reward',
        userHandle: mockUserHandle,
        userName: mockUserName,
        amount: '50',
        message: 'Referral reward',
        transactionHash: mockTransactionHash,
        parentTransactionHash: mockTransactionHash1,
      });
      chai
        .expect(rewards[0].dateAdded)
        .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
      chai.expect(rewards[0].dateAdded).to.be.lessThanOrEqual(new Date());
    });

    it('Should not insert the rewards in the database if there is an error during the token sending', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      await handleReferralReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      );

      chai.expect(await collectionRewardsMock.find({}).toArray()).to.be.empty;
    });

    it('Should not call FlowXO webhook if there is an error in the transaction', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
      ]);

      await handleReferralReward(
        dbMock,
        'newUserTgId',
        'newUserResponsePath',
        'newUserUserHandle',
        'newUserUserName',
        'patchwallet'
      );

      chai.expect(
        axiosStub
          .getCalls()
          .filter(
            (e) => e.firstArg === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK
          )
      ).to.be.empty;
    });

    it('Should call FlowXO webhook only 1 time if there is 1/2 error in the transaction', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .rejects(new Error('Service not available'));

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
      ]);

      await handleReferralReward(
        dbMock,
        'newUserTgId',
        'newUserResponsePath',
        'newUserUserHandle',
        'newUserUserName',
        'patchwallet'
      );

      const flowXOCalls = axiosStub
        .getCalls()
        .filter(
          (e) => e.firstArg === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK
        );

      chai.expect(flowXOCalls.length).to.equal(1);

      chai
        .expect(flowXOCalls[0].args[1])
        .excluding(['dateAdded'])
        .to.deep.equal({
          newUserTgId: 'newUserTgId',
          newUserResponsePath: 'newUserResponsePath',
          newUserUserHandle: 'newUserUserHandle',
          newUserUserName: 'newUserUserName',
          newUserPatchwallet: 'patchwallet',
          userTelegramID: mockUserTelegramID1,
          responsePath: mockResponsePath,
          walletAddress: mockWallet,
          reason: '2x_reward',
          userHandle: mockUserHandle,
          userName: mockUserName,
          amount: '50',
          message: 'Referral reward',
          transactionHash: mockTransactionHash,
          parentTransactionHash: mockTransactionHash1,
        });
      chai
        .expect(flowXOCalls[0].args[1].dateAdded)
        .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
      chai
        .expect(flowXOCalls[0].args[1].dateAdded)
        .to.be.lessThanOrEqual(new Date());
    });
  });

  describe('PatchWallet transaction without hash', function () {
    it('Should return false if there is no hash in PatchWallet response', async function () {
      axiosStub.withArgs(patchwalletTxUrl).resolves({
        data: {
          error: 'service non available',
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      chai.expect(
        await handleReferralReward(
          dbMock,
          mockUserTelegramID,
          mockResponsePath,
          mockUserHandle,
          mockUserName,
          mockWallet
        )
      ).to.be.false;
    });

    it('Should return false if there is 1/2 response without hash in PatchWallet', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .resolves({
          data: {
            error: 'service non available',
          },
        });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      chai.expect(
        await handleReferralReward(
          dbMock,
          mockUserTelegramID,
          mockResponsePath,
          mockUserHandle,
          mockUserName,
          mockWallet
        )
      ).to.be.false;
    });

    it('Should insert only 1 element in reward database if there is 1/2 without hash in PatchWallet', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .resolves({
          data: {
            error: 'service non available',
          },
        });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      await handleReferralReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      );

      const rewards = await collectionRewardsMock.find({}).toArray();

      chai.expect(rewards.length).to.equal(1);
      chai.expect(rewards[0]).excluding(['_id', 'dateAdded']).to.deep.equal({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        walletAddress: mockWallet,
        reason: '2x_reward',
        userHandle: mockUserHandle,
        userName: mockUserName,
        amount: '50',
        message: 'Referral reward',
        transactionHash: mockTransactionHash,
        parentTransactionHash: mockTransactionHash1,
      });
      chai
        .expect(rewards[0].dateAdded)
        .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
      chai.expect(rewards[0].dateAdded).to.be.lessThanOrEqual(new Date());
    });

    it('Should not insert the rewards in the database if there is no hash in PatchWallet response', async function () {
      axiosStub.withArgs(patchwalletTxUrl).resolves({
        data: {
          error: 'service non available',
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: mockUserTelegramID,
        },
      ]);

      await handleReferralReward(
        dbMock,
        mockUserTelegramID,
        mockResponsePath,
        mockUserHandle,
        mockUserName,
        mockWallet
      );

      chai.expect(await collectionRewardsMock.find({}).toArray()).to.be.empty;
    });

    it('Should not call FlowXO webhook if there is no hash in PatchWallet response', async function () {
      axiosStub.withArgs(patchwalletTxUrl).resolves({
        data: {
          error: 'service non available',
        },
      });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
      ]);

      await handleReferralReward(
        dbMock,
        'newUserTgId',
        'newUserResponsePath',
        'newUserUserHandle',
        'newUserUserName',
        'patchwallet'
      );

      chai.expect(
        axiosStub
          .getCalls()
          .filter(
            (e) => e.firstArg === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK
          )
      ).to.be.empty;
    });

    it('Should call FlowXO webhook only 1 time if there is 1/2 with no hash in PatchWallet response', async function () {
      axiosStub
        .withArgs(patchwalletTxUrl)
        .onCall(0)
        .resolves({
          data: {
            error: 'service non available',
          },
        });

      await collectionUsersMock.insertOne({
        userTelegramID: mockUserTelegramID1,
        responsePath: mockResponsePath,
        userHandle: mockUserHandle,
        userName: mockUserName,
        patchwallet: mockWallet,
      });
      await collectionTransfersMock.insertMany([
        {
          transactionHash: mockTransactionHash,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
        {
          transactionHash: mockTransactionHash1,
          senderTgId: mockUserTelegramID1,
          recipientTgId: 'newUserTgId',
        },
      ]);

      await handleReferralReward(
        dbMock,
        'newUserTgId',
        'newUserResponsePath',
        'newUserUserHandle',
        'newUserUserName',
        'patchwallet'
      );

      const flowXOCalls = axiosStub
        .getCalls()
        .filter(
          (e) => e.firstArg === process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK
        );

      chai.expect(flowXOCalls.length).to.equal(1);

      chai
        .expect(flowXOCalls[0].args[1])
        .excluding(['dateAdded'])
        .to.deep.equal({
          newUserTgId: 'newUserTgId',
          newUserResponsePath: 'newUserResponsePath',
          newUserUserHandle: 'newUserUserHandle',
          newUserUserName: 'newUserUserName',
          newUserPatchwallet: 'patchwallet',
          userTelegramID: mockUserTelegramID1,
          responsePath: mockResponsePath,
          walletAddress: mockWallet,
          reason: '2x_reward',
          userHandle: mockUserHandle,
          userName: mockUserName,
          amount: '50',
          message: 'Referral reward',
          transactionHash: mockTransactionHash,
          parentTransactionHash: mockTransactionHash1,
        });
      chai
        .expect(flowXOCalls[0].args[1].dateAdded)
        .to.be.greaterThanOrEqual(new Date(Date.now() - 20000)); // 20 seconds
      chai
        .expect(flowXOCalls[0].args[1].dateAdded)
        .to.be.lessThanOrEqual(new Date());
    });
  });
});
