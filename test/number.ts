import { checkError, combineCall, runTestCases } from "./util";

const testcases: (string | [string])[] = [
  ["1"],
  "+1",
  ["-1"],

  ["10"],
  "+10",
  ["-10"],

  ["0"],
  "+0",
  ["-0"],

  "00",
  "+00",
  "-00",

  "-01",
  "01",

  ["0.0"],
  "+0.0",
  ["-0.0"],

  ["0.1"],
  "+0.1",
  ["-0.1"],

  ["1.0"],
  "+1.0",
  ["-1.0"],

  ["1.00"],
  "+1.00",
  ["-1.00"],

  "0x1",
  "0x0",
  "0o1",
  "0o0",
  "0b1",
  "0b0",
];
runTestCases(testcases);

combineCall(
  [
    ["-", ""],
    ["0", "1", ""],
    ["0", "1", "00", "01", "1"],
    ["e", "e+", "e-", "E", "E+", "E-"],
    ["1", "01", "10", "0", "00", "a", "z", ""],
  ],
  (choice) => {
    const s = `${choice.slice(0, 2).join("")}.${choice.slice(2, 5).join("")}`;
    checkError(
      s,
      !(
        choice[1] &&
        choice[2] &&
        choice[4] &&
        choice[4] != "a" &&
        choice[4] != "z"
      )
    );
  }
);
