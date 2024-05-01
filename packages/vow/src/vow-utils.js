// @ts-check
import { E as basicE } from '@endo/eventual-send';
import { isPassable } from '@endo/pass-style';
import { M, matches } from '@endo/patterns';

/**
 * @import {PassableCap} from '@endo/pass-style'
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
 * For when you have a Vow or a `PassableCap` (`RemotableObject` or
 * passable `Promise`) and you need `PassableCap`,
 * typically to serve as a key in a `Map`, `WeakMap`, `Store`, or `WeakStore`.
 *
 * Relies on, and encapsulates, the current "V0" representation of a vow
 * as containing a unique remotable shortener.
 *
 * Note: if `k` is not a `Vow`, `toPassableCap` does no enforcement that `k`
 * is already a `PassableCap`. Rather, it just acts as an identity function
 * returning `k` without further checking. The types only describe the
 * intended use. (If warranted, we may later add such enforcement, so please
 * do not rely on either the presence or absence of such enforcement.)
 *
 * @param {PassableCap | Vow} k
 * @returns {PassableCap}
 */
export const toPassableCap = k => {
  const payload = getVowPayload(k);
  if (payload === undefined) {
    return k;
  }
  const { vowV0 } = payload;
  // vowMap.set(vowV0, h);
  return vowV0;
};
harden(toPassableCap);
