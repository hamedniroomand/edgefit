import type { Node } from 'oxc-parser';

import type { ModuleShape } from './builder.ts';
import { isModuleExports } from './cjs-forms.ts';
import type { ObjectLiteral } from './cjs-forms.ts';
import { isTruthy, isTruthyDescriptor } from './cjs-values.ts';

/** The `__esModule` mark, which counts only on the object that `module.exports` holds at the end. */
export class EsModuleMark {
  readonly #shape: ModuleShape;
  /** Set by `Object.defineProperty` of `__esModule`, unless its `writable` is known to be true. Then a later `=` can only clear the flag. A later `defineProperty` sets the flag again. */
  #fixed = false;
  /** Set by `module.exports = value`. After it, `exports` still names the object that was replaced. */
  #replaced = false;

  public constructor(shape: ModuleShape) {
    this.#shape = shape;
  }

  /** `Object.defineProperty(target, '__esModule', descriptor)`. */
  public define(target: Node, descriptor: ObjectLiteral): void {
    if (this.#isCurrent(target)) {
      this.#shape.esModule = isTruthyDescriptor(descriptor, 'value');
      this.#fixed = !isTruthyDescriptor(descriptor, 'writable');
    }
  }

  /** `target.__esModule = value`. */
  public assign(target: Node, value: Node): void {
    if (this.#isCurrent(target)) {
      this.#shape.esModule = isTruthy(value) && (this.#shape.esModule || !this.#fixed);
    }
  }

  /** `module.exports = value`: edgefit does not read a mark inside the new value, so it counts none. */
  public replace(): void {
    this.#replaced = true;
    this.#shape.esModule = false;
    this.#fixed = false;
  }

  /**
   * ponytail: in `module.exports = exports = value`, `exports` names the new value, but edgefit
   * ignores a mark set through it. More of the module counts, which is the safe side. Upgrade by
   * noting the chain in `replace`.
   */
  #isCurrent(target: Node): boolean {
    return !this.#replaced || isModuleExports(target);
  }
}
