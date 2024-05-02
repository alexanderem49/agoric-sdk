import test from '@endo/ses-ava/prepare-endo.js';
import {
  makeICAChannelAddress,
  findAddressField,
} from '../../src/utils/address.js';

test('makeICAChannelAddress', t => {
  t.throws(() => makeICAChannelAddress(), {
    message: 'hostConnectionId is required',
  });
  t.throws(() => makeICAChannelAddress('connection-0'), {
    message: 'controllerConnectionId is required',
  });
  t.is(
    makeICAChannelAddress('connection-1', 'connection-0'),
    '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-1","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"","encoding":"proto3","txType":"sdk_multi_msg"}',
    'returns connection string when controllerConnectionId and hostConnectionId are provided',
  );
  t.is(
    makeICAChannelAddress('connection-1', 'connection-0', {
      version: 'ics27-0',
    }),
    '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-0","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"","encoding":"proto3","txType":"sdk_multi_msg"}',
    'accepts custom version',
  );
  t.is(
    makeICAChannelAddress('connection-1', 'connection-0', {
      encoding: 'test',
    }),
    '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-1","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"","encoding":"test","txType":"sdk_multi_msg"}',
    'accepts custom encoding',
  );
  t.is(
    makeICAChannelAddress('connection-1', 'connection-0', {
      ordering: 'unordered',
    }),
    '/ibc-hop/connection-0/ibc-port/icahost/unordered/{"version":"ics27-1","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"","encoding":"proto3","txType":"sdk_multi_msg"}',
    'accepts custom ordering',
  );
});

test('findAddressField', t => {
  t.is(
    findAddressField('/ibc-hop/'),
    undefined,
    'returns undefined when version json is missing',
  );
  t.is(
    findAddressField(
      '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-1","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"","encoding":"proto3","txType":"sdk_multi_msg"}',
    ),
    '',
    'returns empty string if address is an empty string',
  );
  t.is(
    findAddressField(
      '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-1","controllerConnectionId":"connection-0","hostConnectionId":"connection-1","address":"osmo1m30khedzqy9msu4502u74ugmep30v69pzee370jkas57xhmjfgjqe67ayq","encoding":"proto3","txType":"sdk_multi_msg"}',
    ),
    'osmo1m30khedzqy9msu4502u74ugmep30v69pzee370jkas57xhmjfgjqe67ayq',
    'returns address',
  );
  t.is(
    findAddressField(
      '/ibc-hop/connection-0/ibc-port/icahost/ordered/{"version":"ics27-1","controller_connection_id":"connection-0","host_connection_id":"connection-1","address":"osmo1m30khedzqy9msu4502u74ugmep30v69pzee370jkas57xhmjfgjqe67ayq","encoding":"proto3","tx_type":"sdk_multi_msg"}/ibc-channel/channel-1',
    ),
    'osmo1m30khedzqy9msu4502u74ugmep30v69pzee370jkas57xhmjfgjqe67ayq',
    'returns address when localAddrr is appended to version string',
  );
});
