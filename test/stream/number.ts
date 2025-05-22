import { JsonOption, jsonStreamParse, JsonToken } from "efjson";
import {
  assertElementSubset,
  checkError,
  combineCall,
  makeRejectedTestcases,
  runTestCases,
} from "../util";

const testcases: (string | [string])[] = [
  ["1"],
  ["-1"],

  ["10"],
  ["-10"],

  ["0"],
  ["-0"],

  "00",
  "-00",

  "-01",
  "01",

  "0x1",
  "0x0",
  "0o1",
  "0o0",
  "0b1",
  "0b0",
];
runTestCases(testcases);

{
  const testcases: (string | [string])[] = [["+10"], ["+0"], "+00"];
  runTestCases(testcases, { acceptPositiveSign: true });
  runTestCases(makeRejectedTestcases(testcases));
}

combineCall(
  [
    ["-", "+", ""],
    ["0", "1", ""],
    ["0", "1", "00", "01", "1", ""],
    ["e", "e+", "e-", "E", "E+", "E-"],
    ["1", "01", "10", "0", "00", "a", "z", ""],
  ],
  (choice) => {
    const s = `${choice.slice(0, 2).join("")}.${choice.slice(2, 5).join("")}`;
    for (const acceptPositiveSign of [true, false])
      for (const acceptEmptyInteger of [true, false])
        for (const acceptEmptyFraction of [true, false]) {
          let right = !(
            choice[4] === "a" ||
            choice[4] === "z" ||
            choice[4] === ""
          );
          if (!acceptPositiveSign && choice[0] == "+") right &&= false;
          if (!acceptEmptyInteger && choice[1] == "") right &&= false;
          if (!acceptEmptyFraction && choice[2] == "") right &&= false;
          checkError(s, !right, {
            acceptPositiveSign,
            acceptEmptyFraction,
            acceptEmptyInteger,
          });
        }
  }
);
{
  const str = "Infinity";
  for (let i = 1; i <= 8; ++i) {
    checkError(str.slice(0, i), true);
    checkError("-" + str.slice(0, i), true);
    checkError("+" + str.slice(0, i), true);

    checkError("1" + str.slice(0, i), true);
    checkError("-1" + str.slice(0, i), true);
    checkError("+1" + str.slice(0, i), true);
    checkError("0" + str.slice(0, i), true);
    checkError("-0" + str.slice(0, i), true);
    checkError("+0" + str.slice(0, i), true);

    checkError(str.slice(0, i), i !== 8, { acceptInfinity: true });
    checkError("-" + str.slice(0, i), i !== 8, { acceptInfinity: true });
    checkError("+" + str.slice(0, i), true, { acceptInfinity: true });

    checkError("+" + str.slice(0, i), i !== 8, {
      acceptInfinity: true,
      acceptPositiveSign: true,
    });
  }
}
{
  const str = "NaN";
  for (let i = 1; i <= 3; ++i) {
    checkError(str.slice(0, i), true);
    checkError("-" + str.slice(0, i), true);
    checkError("+" + str.slice(0, i), true);

    checkError("1" + str.slice(0, i), true);
    checkError("-1" + str.slice(0, i), true);
    checkError("+1" + str.slice(0, i), true);
    checkError("0" + str.slice(0, i), true);
    checkError("-0" + str.slice(0, i), true);
    checkError("+0" + str.slice(0, i), true);

    checkError(str.slice(0, i), i !== 3, { acceptNan: true });
    checkError("-" + str.slice(0, i), true, { acceptNan: true });
    checkError("+" + str.slice(0, i), true, { acceptNan: true });

    checkError("+" + str.slice(0, i), true, {
      acceptNan: true,
      acceptPositiveSign: true,
    });
  }
}
{
  for (const sign of ["", "+", "-"]) {
    const testcases: (string | [string])[] = [
      `${sign}0x`,
      [`${sign}0x1`],
      [`${sign}0xF`],
      `${sign}0x1g`,
      `${sign}0X`,
      [`${sign}0X1`],
      [`${sign}0XF`],
      `${sign}0X1g`,
    ];
    runTestCases(makeRejectedTestcases(testcases));
    runTestCases(sign === "+" ? makeRejectedTestcases(testcases) : testcases, {
      acceptHexadecimalInteger: true,
    });
    runTestCases(testcases, {
      acceptHexadecimalInteger: true,
      acceptPositiveSign: true,
    });
  }
}
{
  for (const sign of ["", "+", "-"]) {
    const testcases: (string | [string])[] = [
      `${sign}0o`,
      [`${sign}0o1`],
      `${sign}0oF`,
      `${sign}0o1g`,
      `${sign}0O`,
      [`${sign}0O1`],
      `${sign}0OF`,
      `${sign}0O1g`,
    ];
    runTestCases(makeRejectedTestcases(testcases));
    runTestCases(sign === "+" ? makeRejectedTestcases(testcases) : testcases, {
      acceptOctalInteger: true,
    });
    runTestCases(testcases, {
      acceptOctalInteger: true,
      acceptPositiveSign: true,
    });
  }
}
{
  for (const sign of ["", "+", "-"]) {
    const testcases: (string | [string])[] = [
      `${sign}0b`,
      [`${sign}0b1`],
      `${sign}0bF`,
      `${sign}0b1g`,
      `${sign}0B`,
      [`${sign}0B1`],
      `${sign}0BF`,
      `${sign}0B1g`,
    ];
    runTestCases(makeRejectedTestcases(testcases));
    runTestCases(sign === "+" ? makeRejectedTestcases(testcases) : testcases, {
      acceptBinaryInteger: true,
    });
    runTestCases(testcases, {
      acceptBinaryInteger: true,
      acceptPositiveSign: true,
    });
  }
}

assertElementSubset(jsonStreamParse("-1.0e+3"), [
  { type: "number", subtype: "integer_sign" },
  { type: "number", subtype: "integer_digit" },
  { type: "number", subtype: "fraction_start" },
  { type: "number", subtype: "fraction_digit" },
  { type: "number", subtype: "exponent_start" },
  { type: "number", subtype: "exponent_sign" },
  { type: "number", subtype: "exponent_digit" },
  { type: "eof", subtype: undefined },
] as JsonToken[]);
