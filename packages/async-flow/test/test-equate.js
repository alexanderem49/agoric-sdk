// eslint-disable-next-line import/order
import {
  test,
  getBaggage,
  annihilate,
  nextLife,
  asyncFlowVerbose,
} from './prepare-test-env-ava.js';

import { X, makeError } from '@endo/errors';
import { Far } from '@endo/pass-style';
import { prepareVowTools } from '@agoric/vow';
import { prepareVowTools as prepareWatchableVowTools } from '@agoric/vat-data/vow.js';
import { isVow } from '@agoric/vow/src/vow-utils.js';
import { makeHeapZone } from '@agoric/zone/heap.js';
import { makeVirtualZone } from '@agoric/zone/virtual.js';
import { makeDurableZone } from '@agoric/zone/durable.js';

import { prepareWeakBijection } from '../src/weak-bijection.js';
import { makeEquate } from '../src/equate.js';

/**
 * @param {any} t
 * @param {Zone} zone
 * @param {VowTools} vowTools
 * @param {boolean} [showOnConsole]
 */
const testEquate = (t, zone, { makeVowKit }, showOnConsole = false) => {
  const makeBijection = prepareWeakBijection(zone);
  const bij = zone.makeOnce('bij', makeBijection);

  t.throws(() => zone.makeOnce('equate', () => makeEquate(bij)), {
    message: 'maker return value "[Function equate]" is not storable',
  });

  const equate = makeEquate(bij);

  equate(8, 8);
  t.throws(() => equate(8, 9), {
    message: 'unequal primitives 8 vs 9',
  });

  const h1 = zone.exo('h1', undefined, {});
  const h2 = zone.makeOnce('h2', () => makeVowKit().vow);
  t.true(isVow(h2));

  const g1 = Far('g1', {});
  const g2 = harden(Promise.resolve('g2'));

  t.throws(() => equate(g1, h1), {
    message:
      'cannot yet send guest remotables to host "[Alleged: g1]" vs "[Alleged: h1]"',
  });
  bij.init(g1, h1);
  equate(g1, h1);
  t.throws(() => equate(g1, h2), {
    message: 'internal: g->h "[Alleged: g1]" -> "[Vow]" vs "[Alleged: h1]"',
  });
  t.throws(() => equate(g2, h1), {
    message: 'key not found: "[Alleged: h1]"',
  });
  bij.init(g2, h2);
  equate(g2, h2);

  t.throws(() => equate(g1, h2), {
    message: 'internal: g->h "[Alleged: g1]" -> "[Vow]" vs "[Alleged: h1]"',
  });
  t.throws(() => equate(g2, h1), {
    message: 'internal: g->h "[Promise]" -> "[Alleged: h1]" vs "[Vow]"',
  });

  equate(harden([g1, g2]), harden([h1, h2]));
  t.throws(() => equate(harden([g1, g2]), harden([h1, h1])), {
    message: '[1]: internal: g->h "[Promise]" -> "[Alleged: h1]" vs "[Vow]"',
  });

  const gErr1 = harden(makeError(X`error ${'redacted message'}`, URIError));
  const hErr1 = harden(makeError(X`another message`, URIError));
  const gErr2 = harden(makeError(X`another error`, TypeError));

  equate(gErr1, hErr1);
  t.throws(() => equate(gErr2, hErr1), {
    message: 'name: unequal primitives "TypeError" vs "URIError"',
  });

  if (showOnConsole) {
    // To see the annotation chain. Once we're synced with the next ses-ava,
    // change this to a t.log, so we will see the annotation chain in context.
    t.log('hErr1', hErr1);
  }
};

test('test heap equate', t => {
  const zone = makeHeapZone('heapRoot');
  const vowTools = prepareVowTools(zone);
  testEquate(t, zone, vowTools, asyncFlowVerbose());
});

test.serial('test virtual equate', t => {
  annihilate();
  const zone = makeVirtualZone('virtualRoot');
  const vowTools = prepareVowTools(zone);
  testEquate(t, zone, vowTools);
});

test.serial('test durable equate', t => {
  annihilate();

  nextLife();
  const zone1 = makeDurableZone(getBaggage(), 'durableRoot');
  const vowTools1 = prepareWatchableVowTools(zone1);
  testEquate(t, zone1, vowTools1);

  // equate keeps its state only in the bijection,
  // which loses all its memory between incarnations.

  nextLife();
  const zone2 = makeDurableZone(getBaggage(), 'durableRoot');
  const vowTools2 = prepareWatchableVowTools(zone2);
  testEquate(t, zone2, vowTools2);
});
