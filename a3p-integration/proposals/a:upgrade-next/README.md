# Proposal to upgrade the chain software

The `UNRELEASED_UPGRADE` software upgrade may include core proposals defined in
its upgrade handler. See `CoreProposalSteps` in the `unreleasedUpgradeHandler`
in `agoric-sdk/golang/cosmos/app/app.go`.

This test also includes a core proposal in its `upgradeInfo`. This is executed
after the core proposals defined in the software's upgrade handler. See `agoricProposal`
in `package.json`.

The "binaries" property of `upgradeInfo` is now required since Cosmos SDK 0.46, however it cannot be computed for an unreleased upgrade. To disable the check, `releaseNotes` is set to `false`.
