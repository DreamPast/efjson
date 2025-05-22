import { JsonOption, JsonStreamParserError, jsonStreamParse } from "efjson";

const makePrefix = (prefix?: any) => (prefix ? prefix + ": " : "");

export const assertEq = (got: any, expect: any, prefix?: any) => {
  if (got !== expect)
    throw new Error(`${makePrefix(prefix)}expected ${expect} but got ${got}`);
};
export const assertSubset = (
  got: Record<string, any>,
  expect: Record<string, any>,
  prefix?: any
) => {
  for (const key in expect) {
    if (key in got) {
      if (got[key] !== expect[key])
        throw new Error(
          `${makePrefix(prefix)}expected ${key} to be ${expect[key]} but got ${
            got[key]
          }`
        );
    } else {
      throw new Error(`${makePrefix(prefix)}expected ${key} to be present`);
    }
  }
};
export const assertElementSubset = (got: object[], expect: object[]) => {
  if (got.length !== expect.length)
    throw new Error(`expected ${expect.length} elements but got ${got.length}`);
  const n = got.length;
  for (let i = 0; i < n; i++) assertSubset(got[i], expect[i], `[${i}]`);
};

export const checkError = (
  s: string,
  expected_error = true,
  option?: JsonOption
) => {
  try {
    try {
      jsonStreamParse(s, option);
    } catch (e) {
      if (!(e instanceof JsonStreamParserError)) throw "wrong error";
      if (expected_error) {
        return e.message;
      } else throw "expeted no error, but got: " + e.message;
    }
    if (expected_error) throw "expected error, but got nothing";
    else return undefined;
  } catch (e) {
    console.log(s);
    console.log(option);
    throw e;
  }
};
export const runTestCases = (
  testcases: (string | [string])[],
  option?: JsonOption
) => {
  for (const test of testcases)
    if (typeof test == "string") checkError(test, true, option);
    else checkError(test[0], false, option);
};
export const makeRejectedTestcases = (testcases: (string | [string])[]) => {
  return testcases.map((x) => (Array.isArray(x) ? x[0] : x));
};

export const combine = <T>(choices: T[][]) => {
  const choice = new Array<T>(choices.length);
  const ret: T[][] = [];

  const recursive = (idx = 0) => {
    if (idx >= choices.length) {
      ret.push(choice.slice());
      return;
    }
    for (const value of choices[idx]) {
      choice[idx] = value;
      recursive(idx + 1);
    }
  };
  recursive(0);
  return ret;
};
export const combineCall = <T>(choices: T[][], func: (arg: T[]) => unknown) => {
  const choice = new Array<T>(choices.length);
  const recursive = (idx = 0) => {
    if (idx >= choices.length) {
      func(choice.slice());
      return;
    }
    for (const value of choices[idx]) {
      choice[idx] = value;
      recursive(idx + 1);
    }
  };
  recursive(0);
};
