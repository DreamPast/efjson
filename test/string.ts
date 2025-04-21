import { checkError, combineCall, runTestCases } from "./util";

const testcases: (string | [string])[] = [
  ['""'],
  '"',

  ['"\\""'],
  ['"\\\\"'],
  ['"\\/"'],
  '"\\a"',
  ['"\\b"'],
  ['"\\f"'],
  ['"\\n"'],
  ['"\\t"'],

  '"\\"',
  '"\\\\',
  '"\\/',
  '"\\a',
  '"\\b',
  '"\\f',
  '"\\n',
  '"\\t',

  "\"\\'",
  '"\\\'"',

  '"\\0',
  '"\\1',
  '"\\11',
  '"\\111',

  '"\\0"',
  '"\\1"',
  '"\\11"',
  '"\\111"',
];

runTestCases(testcases);

// hex Unicode
combineCall(
  [["1", "a", "A", "f", "F"]],
  (x) => checkError(`"\\u${x.join("")}`) && checkError(`"\\u${x.join("")}"`)
);
combineCall(
  [
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
  ],
  (x) => checkError(`"\\u${x.join("")}`) && checkError(`"\\u${x.join("")}"`)
);
combineCall(
  [
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
  ],
  (x) => checkError(`"\\u${x.join("")}`) && checkError(`"\\u${x.join("")}"`)
);
combineCall(
  [
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
    ["1", "a", "A", "f", "F"],
  ],
  (x) =>
    checkError(`"\\u${x.join("")}`) && checkError(`"\\u${x.join("")}"`, false)
);

// control characters
for (let i = 0; i < 0x20; ++i) {
  checkError(`"${String.fromCharCode(i)}`);
  checkError(`"${String.fromCharCode(i)}"`);
}
