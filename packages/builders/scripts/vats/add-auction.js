import { makeHelpers } from '@agoric/deploy-script-support';

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const defaultProposalBuilder = async () => {
  return harden({
    sourceSpec: '@agoric/inter-protocol/src/proposals/add-auction.js',
    getManifestCall: ['getManifestForAddAuction'],
  });
};

export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('add-auction', defaultProposalBuilder);
};
