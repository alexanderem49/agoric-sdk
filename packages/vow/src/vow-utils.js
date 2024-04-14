// @ts-check
import { E as basicE } from '@endo/eventual-send';
import { isPassable } from '@endo/pass-style';
import { M, matches } from '@endo/patterns';

/**
 * @import {RemotableObject} from '@endo/pass-style'
 * @import {Vow} from './types.js'
 */

export { basicE };

export const VowShape = M.tagged(
  'Vow',
  M.splitRecord({
    vowV0: M.remotable('VowV0'),
  }),
);

/**
 * @param {unknown} specimen
 * @returns {specimen is Vow}
 */
export const isVow = specimen =>
  isPassable(specimen) && matches(specimen, VowShape);
harden(isVow);

/**
 * A vow is a passable tagged as 'Vow'.  Its payload is a record with
 * API-versioned remotables.  payload.vowV0 is the API for the `watch` and
 * `when` operators to use for retriable shortening of the vow chain.
 *
 * If the specimen is a Vow, return its payload, otherwise undefined.
 *
 * @template T
 * @param {any} specimen any value to verify as a vow
 * @returns {import('./types').VowPayload<T> | undefined}
 *   `undefined` if specimen is not a vow, otherwise the vow's payload.
 */
export const getVowPayload = specimen => {
  if (!isVow(specimen)) {
    return undefined;
  }

  const vow = /** @type {import('./types').Vow<T>} */ (
    /** @type {unknown} */ (specimen)
  );
  return vow.payload;
};
harden(getVowPayload);

/**
 * For when you have a remotable or a vow and you need a representative
 * remotable,
 * typically to serve as a key in a Map, WeakMap, Store, or WeakStore.
 *
 * Relies on, and encapsulates, the current "V0" representation of a vow
 * as containing a unique remotable shortener.
 *
 * @param {RemotableObject | Vow} k
 * @returns {RemotableObject}
 */
export const vowishKey = k => {
  const payload = getVowPayload(k);
  if (payload === undefined) {
    return k;
  }
  const { vowV0 } = payload;
  // vowMap.set(vowV0, h);
  return vowV0;
};
harden(vowishKey);
