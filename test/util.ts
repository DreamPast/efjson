import { JsonStreamParserError, jsonStreamParse } from "../efjson";

export const checkError = (s: string, expected_error = true) => {
  try {
    try {
      jsonStreamParse(s);
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
    throw e;
  }
};
export const runTestCases = (testcases: (string | [string])[]) => {
  for (const test of testcases)
    if (typeof test == "string") checkError(test);
    else checkError(test[0], false);
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
