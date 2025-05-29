import { JsonEventReceiver, JsonOption, JsonValue, jsonEventParse, jsonNormalParse, jsonPointer } from "../src/index";

const makePrefix = (prefix?: any) => (prefix != undefined ? `[${prefix}]` : "");
const compareJson = (lhs: any, rhs: any, prefix: string) => {
  if (typeof lhs !== typeof rhs) throw new Error(`${prefix}type mismatch, ${typeof lhs} != ${typeof rhs}`);
  if (Object.is(lhs, rhs)) return;
  if (Array.isArray(lhs) && Array.isArray(rhs)) {
    if (lhs.length !== rhs.length) throw new Error(`${prefix}array length mismatch, ${lhs.length} != ${rhs.length}`);
    for (let i = 0; i < lhs.length; i++) {
      try {
        compareJson(lhs[i], rhs[i], prefix);
      } catch (e) {
        throw new Error(`${prefix}array element mismatch, ${i}: ${lhs[i]} != ${rhs[i]}\n${e}`);
      }
    }
    return;
  }
  if (typeof lhs === "object") {
    for (const key in lhs) {
      if (!(key in rhs)) throw new Error(`${prefix}object key mismatch, ${key} not in rhs`);
      try {
        compareJson(lhs[key], rhs[key], prefix);
      } catch (e) {
        throw new Error(`${prefix}object key mismatch, ${key}: ${lhs[key]} != ${rhs[key]}\n${e}`);
      }
    }
    for (const key in rhs) if (!(key in lhs)) throw new Error(`${prefix}object key mismatch, ${key} not in lhs`);
    return;
  }
  throw new Error(`${prefix}value mismatch, ${lhs} != ${rhs}`);
};

export const assertUnreachable = (msg?: string) => {
  throw new Error(`unreachable code${msg ? " - " + msg : ""}`);
};
export const assertEq = (got: any, expect: any, prefix?: any) => {
  compareJson(got, expect, makePrefix(prefix));
};
export const assertSubset = (got: Record<string, any>, expect: Record<string, any>, prefix?: any) => {
  for (const key in expect) {
    if (key in got) {
      if (!Object.is(got[key], expect[key]))
        throw new Error(`${makePrefix(prefix)}expected ${key} to be ${expect[key]} but got ${got[key]}`);
    } else {
      throw new Error(`${makePrefix(prefix)}expected ${key} to be present`);
    }
  }
};
export const assertElementSubset = (got: object[], expect: object[]) => {
  if (got.length !== expect.length) throw new Error(`expected ${expect.length} elements but got ${got.length}`);
  const n = got.length;
  for (let i = 0; i < n; i++) assertSubset(got[i], expect[i], `[${i}]`);
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

export const checkNormal = <Opt extends JsonOption = JsonOption>(s: string, expect: any, option?: Opt) => {
  let ret: any;
  try {
    ret = jsonNormalParse(s, option);
  } catch (e) {
    if (expect === undefined) return;
    console.log(s);
    console.log(option);
    throw new Error("expected no error, but got: " + e);
  }
  if (expect === undefined) {
    console.log(s);
    console.log(option);
    throw new Error("expected error, but got nothing");
  }
  assertEq(ret, expect, s);
};
export const checkEvent = <Opt extends JsonOption = JsonOption>(
  s: string,
  receiver: JsonEventReceiver<Opt>,
  expect_error = false,
  option?: Opt,
) => {
  try {
    jsonEventParse(s, receiver, option);
  } catch (e) {
    if (expect_error) return;
    console.log(s);
    console.log(option);
    throw new Error("expected no error, but got: " + e);
  }
  if (expect_error) {
    console.log(s);
    console.log(option);
    throw new Error("expected error, but got nothing");
  }
};
export const checkPointerGet = (
  expect: JsonValue | undefined,
  obj: JsonValue,
  path: string | string[],
  start?: string | string[],
) => {
  let ret: any;
  try {
    ret = jsonPointer(obj, path, undefined, start);
  } catch (e) {
    if (expect === undefined) return;
    console.log(obj);
    console.log(path);
    console.log(start);
    throw new Error("expected no error, but got: " + e);
  }
  if (expect === undefined) {
    console.log(obj);
    console.log(path);
    console.log(start);
    throw new Error("expected error, but got nothing");
  }
  assertEq(ret, expect, obj);
};
export const checkPointerSet = (
  getter: undefined | (() => JsonValue),
  obj: JsonValue,
  path: string | string[],
  value: JsonValue,
  start?: string | string[],
) => {
  try {
    jsonPointer(obj, path, value, start);
  } catch (e) {
    if (getter === undefined) return;
    console.log(obj);
    console.log(path);
    console.log(start);
    throw new Error("expected no error, but got: " + e);
  }
  if (getter === undefined) {
    console.log(obj);
    console.log(path);
    console.log(start);
    throw new Error("expected error, but got nothing");
  }
  assertEq(getter(), value, obj);
};
