import type { Issuer } from '@agoric/ertp/exported.js';
import type { Tagged } from '@agoric/internal/src/tagged.js';
import type { Callable } from '@agoric/internal/src/utils.js';
import type { Baggage } from '@agoric/swingset-liveslots';
import type { VatUpgradeResults } from '@agoric/swingset-vat';

// XXX https://github.com/Agoric/agoric-sdk/issues/4565
type SourceBundle = Record<string, any>;

type ContractFacet<T extends {} = {}> = {
  readonly [P in keyof T]: T[P] extends Callable ? T[P] : never;
};

/**
 * Installation of a contract, typed by its start function.
 */
export type Installation<SF extends ContractStartFunction | unknown> = Tagged<
  {
    getBundle: () => SourceBundle;
    getBundleLabel: () => string;
  },
  'StartFunction',
  SF
>;
export type Instance<SF extends ContractStartFunction | unknown> = Tagged<
  Handle<'Instance'>,
  'StartFunction',
  SF
>;

export type InstallationStart<I> =
  I extends Installation<infer SF> ? SF : never;

export type ContractStartFunction = (
  zcf?: ZCF,
  privateArgs?: {},
  baggage?: Baggage,
) => ERef<{ creatorFacet?: {}; publicFacet?: {} }>;

export type AdminFacet<SF extends ContractStartFunction> = RemotableObject & {
  // Completion, which is currently any
  getVatShutdownPromise: () => Promise<any>;
  upgradeContract: Parameters<SF>[1] extends undefined
    ? (contractBundleId: string) => Promise<VatUpgradeResults>
    : (
        contractBundleId: string,
        newPrivateArgs: Parameters<SF>[1],
      ) => Promise<VatUpgradeResults>;
  restartContract: Parameters<SF>[1] extends undefined
    ? () => Promise<VatUpgradeResults>
    : (newPrivateArgs: Parameters<SF>[1]) => Promise<VatUpgradeResults>;
};

type StartParams<SF> = SF extends ContractStartFunction
  ? Parameters<SF>[1] extends undefined
    ? {
        terms: ReturnType<Parameters<SF>[0]['getTerms']>;
      }
    : {
        terms: ReturnType<Parameters<SF>[0]['getTerms']>;
        privateArgs: Parameters<SF>[1];
      }
  : never;

type StartResult<S> = S extends (...args: any) => Promise<infer U>
  ? U
  : ReturnType<S>;

/**
 * Convenience record for contract start function, merging its result with params.
 */
export type ContractOf<S> = StartParams<S> & StartResult<S>;

type StartContractInstance<C> = (
  installation: Installation<C>,
  issuerKeywordRecord?: Record<string, Issuer<any>>,
  terms?: object,
  privateArgs?: object,
) => Promise<{
  creatorFacet: C['creatorFacet'];
  publicFacet: C['publicFacet'];
  instance: Instance;
  creatorInvitation: C['creatorInvitation'];
  adminFacet: AdminFacet<any>;
}>;

/** The result of `startInstance` */
export type StartedInstanceKit<SF> = {
  instance: Instance<SF>;
  adminFacet: AdminFacet<SF>;
  // theses are empty by default. the return type will override
  creatorFacet: {};
  publicFacet: {};
} & (SF extends ContractStartFunction
  ? // override if the start function specfies the types
    Awaited<ReturnType<SF>>
  : // if it doesn't, allow any
    { creatorFacet: any; publicFacet: any });

/**
 * Zoe is long-lived. We can use Zoe to create smart contract
 * instances by specifying a particular contract installation to use,
 * as well as the `terms` of the contract. The `terms.issuers` is a
 * record mapping string names (keywords) to issuers, such as `{
 * Asset: simoleanIssuer}`. (Note that the keywords must begin with a
 * capital letter and must be ASCII identifiers.) Parties to the
 * contract will use the keywords to index their proposal and their
 * payments.
 *
 * The custom terms are the arguments to the contract, such as the
 * number of bids an auction will wait for before closing. Custom
 * terms are up to the discretion of the smart contract. We get back
 * the creator facet, public facet, and creator invitation as defined
 * by the contract.
 */
export type StartInstance = <SF>(
  installation: Installation<SF> | PromiseLike<Installation<SF>>,
  issuerKeywordRecord?: Record<Keyword, Issuer<any>>,
  // 'brands' and 'issuers' need not be passed in; Zoe provides them as StandardTerms
  terms?: Omit<StartParams<SF>['terms'], 'brands' | 'issuers'>,
  privateArgs?: Parameters<SF>[1],
  label?: string,
) => Promise<StartedInstanceKit<SF>>;

export type GetPublicFacet = <SF>(
  instance: Instance<SF> | PromiseLike<Instance<SF>>,
) => Promise<StartResult<SF>['publicFacet']>;

export type GetTerms = <SF>(instance: Instance<SF>) => Promise<
  // only type if 'terms' info is available
  StartParams<SF>['terms'] extends {}
    ? StartParams<SF>['terms']
    : // XXX returning `any` in this case
      any
>;
