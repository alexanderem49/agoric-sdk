// eslint-disable-next-line import/order
import {
  test,
  getBaggage,
  annihilate,
  nextLife,
} from './prepare-test-env-ava.js';

import { Fail } from '@endo/errors';
import { eventLoopIteration } from '@agoric/internal/src/testing-utils.js';
import { prepareVowTools } from '@agoric/vow';
import { prepareVowTools as prepareWatchableVowTools } from '@agoric/vat-data/vow.js';
import { makeHeapZone } from '@agoric/zone/heap.js';
import { makeVirtualZone } from '@agoric/zone/virtual.js';
import { makeDurableZone } from '@agoric/zone/durable.js';

import { prepareLogStore } from '../src/log-store.js';
import { prepareWeakBijection } from '../src/weak-bijection.js';
import { makeReplayMembrane } from '../src/replay-membrane.js';

const watchWake = _vowish => {};
const panic = problem => Fail`panic over ${problem}`;

/**
 * @param {Zone} zone
 */
const preparePingee = zone =>
  zone.exoClass('Pingee', undefined, () => ({}), {
    ping() {},
  });

/**
 * @param {any} t
 * @param {Zone} zone
 * @param {VowTools} vowTools
 */
const testFirstPlay = async (t, zone, vowTools) => {
  const makeLogStore = prepareLogStore(zone);
  const makeBijection = prepareWeakBijection(zone);
  const makePingee = preparePingee(zone);
  const { makeVowKit } = vowTools;
  const { vow: v1, resolver: r1 } = zone.makeOnce('v1', () => makeVowKit());
  const { vow: _v2, resolver: _r2 } = zone.makeOnce('v2', () => makeVowKit());

  const log = zone.makeOnce('log', () => makeLogStore());
  const bij = zone.makeOnce('bij', makeBijection);

  const mem = makeReplayMembrane(log, bij, vowTools, watchWake, panic);

  const p1 = mem.hostToGuest(v1);
  t.deepEqual(log.dump(), []);

  const pingee = zone.makeOnce('pingee', () => makePingee());
  const guestPingee = mem.hostToGuest(pingee);
  t.deepEqual(log.dump(), []);

  guestPingee.ping();
  t.deepEqual(log.dump(), [
    // keep on separate lines
    ['checkCall', pingee, 'ping', [], 0],
    ['doReturn', 0, undefined],
  ]);

  r1.resolve('x');
  t.is(await p1, 'x');

  t.deepEqual(log.dump(), [
    ['checkCall', pingee, 'ping', [], 0],
    ['doReturn', 0, undefined],
    ['doFulfill', v1, 'x'],
  ]);
};

/**
 * @param {any} t
 * @param {Zone} zone
 * @param {VowTools} vowTools
 */
const testReplay = async (t, zone, vowTools) => {
  prepareLogStore(zone);
  prepareWeakBijection(zone);
  preparePingee(zone);
  const { vow: v1 } = zone.makeOnce('v1', () => Fail`need v1`);
  const { vow: v2, resolver: r2 } = zone.makeOnce('v2', () => Fail`need v2`);

  const log = /** @type {LogStore} */ (
    zone.makeOnce('log', () => Fail`need log`)
  );
  const bij = /** @type {WeakBijection} */ (
    zone.makeOnce('bij', () => Fail`need bij`)
  );

  const pingee = zone.makeOnce('pingee', () => Fail`need pingee`);

  t.deepEqual(log.dump(), [
    ['checkCall', pingee, 'ping', [], 0],
    ['doReturn', 0, undefined],
    ['doFulfill', v1, 'x'],
  ]);

  const mem = makeReplayMembrane(log, bij, vowTools, watchWake, panic);
  t.true(log.isReplaying());
  t.is(log.getIndex(), 0);

  const guestPingee = mem.hostToGuest(pingee);
  const p2 = mem.hostToGuest(v2);
  // @ts-expect-error TS doesn't know that r2 is a resolver
  r2.resolve('y');
  await eventLoopIteration();

  const p1 = mem.hostToGuest(v1);
  mem.wake();
  t.true(log.isReplaying());
  t.is(log.getIndex(), 0);

  guestPingee.ping();
  t.is(await p1, 'x');
  t.is(await p2, 'y');
  t.false(log.isReplaying());

  t.deepEqual(log.dump(), [
    ['checkCall', pingee, 'ping', [], 0],
    ['doReturn', 0, undefined],
    ['doFulfill', v1, 'x'],
    ['doFulfill', v2, 'y'],
  ]);
};

await test.serial('test heap replay-membrane settlement', async t => {
  const zone = makeHeapZone('heapRoot');
  const vowTools = prepareVowTools(zone);
  return testFirstPlay(t, zone, vowTools);
});

await test.serial('test virtual replay-membrane settlement', async t => {
  annihilate();
  const zone = makeVirtualZone('virtualRoot');
  const vowTools = prepareVowTools(zone);
  return testFirstPlay(t, zone, vowTools);
});

await test.serial('test durable replay-membrane settlement', async t => {
  annihilate();

  nextLife();
  const zone1 = makeDurableZone(getBaggage(), 'durableRoot');
  const vowTools1 = prepareWatchableVowTools(zone1);
  await testFirstPlay(t, zone1, vowTools1);

  nextLife();
  const zone3 = makeDurableZone(getBaggage(), 'durableRoot');
  const vowTools3 = prepareWatchableVowTools(zone3);
  return testReplay(t, zone3, vowTools3);
});
