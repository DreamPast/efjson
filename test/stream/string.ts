import { jsonStreamParse, JsonToken } from "efjson";
import {
  assertElementSubset,
  checkError,
  combineCall,
  makeRejectedTestcases,
  runTestCases,
} from "../util";

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

/// JSON5
{
  const testcases: (string | [string])[] = [["'s'"], "'s"];
  runTestCases(testcases, { acceptSingleQuote: true });
  runTestCases(makeRejectedTestcases(testcases));
}

{
  const testcases: (string | [string])[] = [
    ['"\\v"'],
    ['"\\0"'],
    ['"\\\'"'],
    '"\\x"',
    '"\\x1"',
    '"\\xF"',
    ['"\\x1F"'],
    ['"\\xF1"'],
  ];
  runTestCases(testcases, {
    accpetJson5StringEscape: true,
  });
  runTestCases(makeRejectedTestcases(testcases));
}

{
  const testcases: (string | [string])[] = [
    ['"\\\n1"'],
    ['"\\\r1"'],
    ['"\\\r\n1"'],
  ];
  runTestCases(testcases, {
    acceptMultilineString: true,
  });
  runTestCases(makeRejectedTestcases(testcases));
}

assertElementSubset(jsonStreamParse('"\\u1234\\na"'), [
  { type: "string", subtype: "start" },
  { type: "string", subtype: "escape_start" },
  { type: "string", subtype: "escape_unicode_start" },
  { type: "string", subtype: "escape_unicode", escaped_value: undefined },
  { type: "string", subtype: "escape_unicode", escaped_value: undefined },
  { type: "string", subtype: "escape_unicode", escaped_value: undefined },
  { type: "string", subtype: "escape_unicode", escaped_value: "\u1234" },
  { type: "string", subtype: "escape_start" },
  { type: "string", subtype: "escape", escaped_value: "\n" },
  { type: "string", subtype: "normal" },
  { type: "string", subtype: "end" },
  { type: "eof", subtype: undefined },
] as JsonToken[]);
