import type { Controls, Exits, RunReturnType, Spec } from "./types";

/**
 * Container used to identify exceptions throw by us
 */
class Carrier {
  constructor(public key: PropertyKey, public args: unknown[]) {}
}

/**
 * Run a function with controls for throwing errors in a typesafe manner.
 *
 * @param operation
 * The function to invoke. Receives an object as its first parameter containing
 * two functions that should be used for flow control: exit and trap.
 *
 * exit is invoked with an exit function name and parameters
 *
 * trap is invoked with an exit function name, parameters (except the last one
 * which must be unknown), and a function to try
 *
 * @param exits
 * An object containing functions that handle different exit conditions.
 * Specified function parameters become required arguments for exit and trap.
 * If the final parameter of an exit has type unknown, the exit is eligible
 * to use with trap. In that case, the final argument will be the value thrown
 * by the trapped function.
 *
 * @returns
 */
export function run<E extends Exits, Return>(
  operation: (controls: Controls<Spec<E>>) => Return,
  exits: E
): RunReturnType<E, Return> {
  // called when op throws or rejects
  function onCatch(e: unknown) {
    if (e instanceof Carrier) {
      return exits[e.key](...e.args);
    }
    throw e;
  }
  function exit(key: PropertyKey, ...args: unknown[]): never {
    throw new Carrier(key, args);
  }
  function trap<P>(key: PropertyKey, ...args: [...unknown[], () => P]): P {
    const exitArgs = args.slice(0, -1);
    const [tryFn] = args.slice(-1) as [() => P];
    function onCatch(e: unknown): never {
      throw new Carrier(key, [...exitArgs, e]);
    }
    try {
      const result = tryFn();
      if (result instanceof Promise) {
        return result.catch(onCatch) as P;
      }
      return result;
    } catch (e) {
      onCatch(e);
    }
  }
  try {
    const result = operation({ exit, trap });
    if (result instanceof Promise) {
      return result.catch(onCatch) as RunReturnType<E, Return>;
    } else {
      return result as RunReturnType<E, Return>;
    }
  } catch (e) {
    return onCatch(e) as RunReturnType<E, Return>;
  }
}
