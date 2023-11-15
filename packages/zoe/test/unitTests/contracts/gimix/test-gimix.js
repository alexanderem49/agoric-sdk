/* global setImmediate */
// @ts-check
/* eslint-disable no-unused-vars */
// eslint-disable-next-line import/order
import { test as anyTest } from '../../../../tools/prepare-test-env-ava.js';

import url from 'url';
import { unsafeMakeBundleCache } from '@agoric/swingset-vat/tools/bundleTool.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { E, Far } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { makeCopyBag } from '@endo/patterns';
import { makeNameHubKit } from '@agoric/vats';
import buildManualTimer from '../../../../tools/manualTimer.js';
import centralSupplyBundle from '@agoric/vats/bundles/bundle-centralSupply.js';

import { mintStablePayment } from './mintStable.js';
import { makePromiseKit } from '@endo/promise-kit';

const DAY = 24 * 60 * 60 * 1000;
const UNIT6 = 1_000_000n;

/** @type {<T>(x: T | null | undefined) => T} */
const NonNullish = x => {
  if (!x) throw Error('null/undefined');
  return x;
};

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const asset = ref => url.fileURLToPath(new URL(ref, import.meta.url));

const makeTestContext = async t => {
  const bundleCache = await unsafeMakeBundleCache('bundles/');

  const bundle = await bundleCache.load(
    asset('../../../../src/contracts/gimix/gimix.js'),
    'gimix',
  );

  const eventLoopIteration = () => new Promise(setImmediate);

  const manualTimer = buildManualTimer(
    t.log,
    BigInt((2020 - 1970) * 365.25 * DAY),
    {
      timeStep: BigInt(DAY),
      eventLoopIteration,
    },
  );

  const bootstrap = async () => {
    const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

    const { nameHub: namesByAddress, nameAdmin: namesByAddressAdmin } =
      makeNameHubKit();

    const invitationIssuer = await E(zoe).getInvitationIssuer();
    const invitationBrand = await E(invitationIssuer).getBrand();

    const istIssuer = await E(zoe).getFeeIssuer();
    const istBrand = await E(istIssuer).getBrand();
    const centralSupply = await E(zoe).install(centralSupplyBundle);

    /** @type {import('@agoric/time/src/types').TimerService} */
    const chainTimerService = manualTimer;
    const timerBrand = await E(chainTimerService).getTimerBrand();

    // really a namehub...
    const agoricNames = {
      issuer: { IST: istIssuer, Invitation: invitationIssuer },
      brand: { timerBrand, IST: istBrand, Invitation: invitationBrand },
      installation: { centralSupply },
      instance: {},
    };

    const board = new Map(); // sort of

    return {
      agoricNames,
      board,
      chainTimerService,
      feeMintAccess,
      namesByAddress,
      namesByAddressAdmin,
      zoe,
    };
  };

  const powers = await bootstrap();

  const {
    agoricNames: { installation, issuer },
  } = powers;
  /** @param {bigint} value */
  const faucet = async value => {
    const pmt = await mintStablePayment(value, {
      centralSupply: installation.centralSupply,
      feeMintAccess: powers.feeMintAccess,
      zoe: powers.zoe,
    });

    const purse = await E(issuer.IST).makeEmptyPurse();
    await E(purse).deposit(pmt);
    return purse;
  };

  return { bundle, faucet, manualTimer, powers };
};

test.before(async t => (t.context = await makeTestContext(t)));

/**
 * TODO: refactor as capabilities
 * @typedef {ReturnType<typeof makeGitHub>} GitHub
 *
 * @typedef {PromiseKit<string> & {
 *   type: 'issue',
 *   status: 'open' | 'closed'
 *   assignee?: string
 * }} IssueStatus
 * @typedef {{
 *   type: 'pull',
 *   author: string,
 *   fixes: string,
 *   status?: 'merged'
 * }} PRStatus
 */
const makeGitHub = () => {
  /** @type {Map<string, IssueStatus | PRStatus>} */
  const status = new Map();

  const notifyIssue = (issue, pr) => {
    const st = NonNullish(status.get(issue));
    assert(st.type === 'issue');
    const { resolve } = st;
    resolve(pr);
  };

  const self = Far('github', {
    /**
     * @param {string} owner
     * @param {string} repo
     */
    openIssue: (owner, repo) => {
      const num = status.size + 1;
      const url = `https://github.com/${owner}/${repo}/issues/${num}`;
      const pk = makePromiseKit();
      status.set(url, { ...pk, type: 'issue', status: 'open' });
      return url;
    },
    assignIssue: (url, name) => {
      const st = NonNullish(status.get(url));
      assert(st.type === 'issue');
      status.set(url, { ...st, assignee: name });
    },
    /** @param {string} url */
    getIssuePromise: url => {
      const st = NonNullish(status.get(url));
      assert(st.type === 'issue');
      return st.promise;
    },
    /** @param {string} url */
    closeIssue: url => {
      const st = NonNullish(status.get(url));
      assert(st.type === 'issue');
      status.set(url, { ...st, status: 'closed' });
    },

    /**
     * @param {string} owner
     * @param {string} repo
     * @param {string} author - TODO refator as capability
     * @param {string} fixes issue URL
     */
    openPR: (owner, repo, author, fixes) => {
      const num = status.size + 1;
      const url = `https://github.com/${owner}/${repo}/pull/${num}`;
      const pk = makePromiseKit();
      status.set(url, { type: 'pull', author, fixes });
      notifyIssue(fixes, url);
      return url;
    },
    /** @param {string} url */
    mergePR: url => {
      const st = NonNullish(status.get(url));
      assert(st.type === 'pull');
      status.set(url, { ...st, status: 'merged' });
      const { fixes } = st;
      return self.closeIssue(fixes);
    },
    /** @param {string} url */
    queryPR: url => {
      const pull = NonNullish(status.get(url));
      assert(pull.type === 'pull');
      const issue = NonNullish(status.get(pull.fixes));
      assert(issue.type === 'issue');
      // TODO: data propoerties only. no rights to resolve, etc.
      return harden({ pull, issue });
    },
  });
  return self;
};

test('start contract; make work agreement', async t => {
  const coreEval = async oracleDepositP => {
    const { powers, bundle } = t.context;
    const {
      agoricNames,
      board,
      chainTimerService,
      namesByAddress,
      namesByAddressAdmin,
      zoe,
    } = powers;

    // const id = await E(board).getId(chainTimerService);
    board.set('board123', chainTimerService);

    // TODO: add bob's address
    namesByAddressAdmin.update('agoric1oracle', oracleDepositP);

    /** @type {Installation<import('../../../../src/contracts/gimix/gimix').prepare>} */
    const installation = await E(zoe).install(bundle);

    const { creatorFacet, instance: gimixInstance } = await E(
      zoe,
    ).startInstance(
      installation,
      { Stable: agoricNames.issuer.IST },
      { namesByAddress, timer: chainTimerService },
    );
    const { brands, issuers } = await E(zoe).getTerms(gimixInstance);

    const oracleInvitation = await E(creatorFacet).makeOracleInvitation();
    void E(oracleDepositP).receive(oracleInvitation);

    // really a namehub...
    const withGiMix = {
      ...agoricNames,
      brand: { ...agoricNames.brand, GimixOracle: brands.GimixOracle },
      issuer: { ...agoricNames.issuer, GimixOracle: issuers.GimixOracle },
      installation: { ...agoricNames.installation, gimix: installation },
      instance: { ...agoricNames.instance, gimix: gimixInstance },
    };
    return { agoricNames: withGiMix, board };
  };

  const sync = {
    assignIssue: makePromiseKit(),
    oracleDeposit: makePromiseKit(),
    oracle: makePromiseKit(),
  };
  const { agoricNames, board } = await coreEval(sync.oracleDeposit.promise);

  /**
   * @param {ERef<GitHub>} gitHub
   * @param {SmartWallet} wallet
   * @param {PromiseKit<string>} assignIssuePK
   */
  const alice = async (
    gitHub,
    wallet,
    assignIssuePK,
    when = 1234n,
    timerBoardId = 'board123',
    bounty = 12n,
  ) => {
    const { make } = AmountMath;
    const { brand: wkBrand, instance, issuer: wkIssuer } = agoricNames;
    const { timerBrand } = wkBrand;
    const timer = board.get(timerBoardId);

    const gpf = await E(zoe).getPublicFacet(instance.gimix);

    const issue = await E(gitHub).openIssue('alice', 'project1');

    const give = {
      Acceptance: make(wkBrand.IST, bounty * UNIT6),
    };
    t.log('bounty', give);
    const want = {
      Stamp: make(wkBrand.GimixOracle, makeCopyBag([[`Fixed ${issue}`, 1n]])),
    };

    /** @type {import('@agoric/time/src/types').TimestampRecord} */
    const deadline = { timerBrand, absValue: when };
    const exit = { afterDeadline: { deadline, timer } };

    const toMakeAgreement = await E(gpf).makeWorkAgreementInvitation(issue);
    const { seat, result } = await wallet.offers.executeOffer(toMakeAgreement, {
      give,
      want,
      exit,
    });

    t.log('resulting job id', result);
    t.deepEqual(typeof result, 'string');

    const assignee = 'bob';
    await E(gitHub).assignIssue(issue, assignee);
    assignIssuePK.resolve(issue);
    t.log('alice assigns to', assignee, 'and waits for news on', issue, '...');
    const pr = await E(gitHub).getIssuePromise(issue);
    t.log('alice decides to merge', pr);
    await E(gitHub).mergePR(pr);

    const issuers = {
      Stamp: wkIssuer.GimixOracle,
      Acceptance: wkIssuer.IST,
    };
    const payouts = await E(seat).getPayouts();
    const amts = {};
    for await (const [kw, pmtP] of Object.entries(payouts)) {
      const pmt = await pmtP;
      const amt = await E(issuers[kw]).getAmountOf(pmt);
      t.log('payout', kw, amt);
      amts[kw] = amt;
    }
    t.deepEqual(amts, '@@todo');
  };

  /**
   * @param {import('@agoric/vats').NameAdmin} agoricNamesAdmin
   * @param {ERef<ZoeService>} zoe
   * @typedef {string} Address
   *
   * @typedef {{
   *   depositFacet: DepositFacet,
   *   offers: {
   *     executeOffer: (invitation: Invitation, proposal: Proposal) => Promise<{seat: UserSeat, result: any}>
   *   }
   * }} SmartWallet
   */
  const makeWalletFactory = (agoricNamesAdmin, zoe) => {
    /** @type {Map<Address, SmartWallet>} */
    const wallets = new Map();
    const { entries } = Object;

    /**
     * @param {Address} address
     * @param {(amt: Amount) => void} [onDeposit]
     */
    const provideWallet = (address, onDeposit) => {
      const purses = new Map();
      const getPurseForBrand = async brand => {
        if (purses.has(brand)) {
          return purses.get(brand);
        }
        for (const [name, candidate] of entries(agoricNames.brand)) {
          if (candidate === brand) {
            const purse = E(agoricNames.issuer[name]).makeEmptyPurse();
            purses.set(brand, purse);
            return purse;
          }
        }
        throw Error('brand not found');
      };

      /** @type {DepositFacet} */
      // @ts-expect-error callWhen
      const depositFacet = Far('deposit', {
        receive: async pmt => {
          const brand = await E(pmt).getAllegedBrand();
          const purse = await getPurseForBrand(brand);
          const amt = await E(purse).deposit(pmt);
          void onDeposit(amt);
          return amt;
        },
      });

      const offers = Far('offers', {
        getPurseForBrand,
        /**
         * @param {Invitation} invitation
         * @param {Proposal} proposal
         */
        executeOffer: async (invitation, proposal) => {
          const { entries } = Object;
          /** @type {Record<string, Payment>} */
          const payments = {};
          for await (const [kw, amt] of entries(proposal.give || {})) {
            const purse = await getPurseForBrand(amt.brand);
            const pmt = await E(purse).withdraw(amt);
            payments[kw] = pmt;
          }
          const seat = await E(zoe).offer(invitation, proposal, payments);
          const result = await E(seat).getOfferResult();
          return { seat, result };
        },
      });

      agoricNamesAdmin.update(address, depositFacet);
      /** @type {SmartWallet} */
      const sw = { depositFacet, offers };
      return sw;
    };

    return Far('WalletFactory', { provideWallet });
  };

  /**
   * @param {SmartWallet} wallet
   * @param {ERef<GitHub>} gitHub
   * @param {import('@endo/promise-kit').PromiseKit<Oracle>} oraclePK
   * @typedef {{
   *   deliver: (pr: string) => Promise<boolean>,
   * }} Oracle
   */
  const githubOracle = async (wallet, gitHub, oraclePK) => {
    const offerResults = new Map();

    const acceptId = 'oracleAccept1';

    const reportIssueDone = async issue => {
      t.log('ReportIssue', issue);
      const reporter = offerResults.get(acceptId);
      const toReport = await E(reporter).JobReport();
      const seat = await E(zoe).offer(toReport);
      const result = await E(seat).getOfferResult();
      t.log('ReportIssue result', result, issue);
      // get payouts?
      await E(seat).tryExit();
    };

    // oracle operator does this
    const setup = async amt => {
      t.log('oracle invation amount', amt);
      const invitationPurse = wallet.offers.getPurseForBrand(amt.brand);
      const invitation = await E(invitationPurse).withdraw(amt);
      const { result: reporter } = await wallet.offers.executeOffer(
        invitation,
        {
          give: {},
          want: {},
          exit: { onDemand: undefined },
        },
      );
      t.log('oracle reporter', reporter);
      offerResults.set(acceptId, reporter);
    };

    /** @type {Oracle} */
    const it = Far('OracleWebSvc', {
      /** @param {string} pr */
      deliver: async pr => {
        t.log('oracle claim', pr);
        const { pull, issue } = await E(gitHub).queryPR(pr);
        const ok =
          pull.author === issue.assignee &&
          pull.status === 'merged' &&
          issue.status === 'closed';
        if (ok) {
          await reportIssueDone(pull.fixes);
        }
        return ok;
      },
    });
    oraclePK.resolve(it);
  };

  /**
   * @param {ERef<GitHub>} gitHub
   * @param {Promise<string>} assignIssueP - issue publication
   * @param {ERef<SmartWallet>} wallet
   * @param {ERef<Oracle>} oracle
   */
  const bob = async (gitHub, assignIssueP, wallet, oracle) => {
    const issue = await assignIssueP;
    const pr = await E(gitHub).openPR('bob', 'alice', 'project1', issue);
    t.log('bob opens PR', pr);
    const ok = await E(oracle).deliver(pr);
    t.truthy(ok);
  };

  const { rootNode, data } = makeFakeStorageKit('X');

  const gitHub = Promise.resolve(makeGitHub());
  const {
    faucet,
    powers: { zoe, agoricNamesAdmin },
  } = t.context;
  const wf = makeWalletFactory(agoricNamesAdmin, zoe);

  await Promise.all([
    alice(
      gitHub,
      wf.provideWallet('agoric1alice'),
      // faucet(25n * UNIT6),
      sync.assignIssue,
    ),
    githubOracle(wf.provideWallet('agoric1oracle'), gitHub, sync.oracle),
    bob(
      gitHub,
      sync.assignIssue.promise,
      wf.provideWallet('agoric1bob'),
      sync.oracle.promise,
    ),
  ]);
  t.log('done');
  t.pass();
});

test.todo('make work agreement at wallet bridge / vstorage level');