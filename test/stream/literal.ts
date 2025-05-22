import { jsonStreamParse, JsonToken } from "efjson";
import { assertElementSubset, runTestCases } from "../util";

runTestCases([["null"], ["true"], ["false"], "Null", "True", "False"]);

assertElementSubset(jsonStreamParse("null"), [
  { type: "null", subtype: undefined, index: 0, done: undefined },
  { type: "null", subtype: undefined, index: 1, done: undefined },
  { type: "null", subtype: undefined, index: 2, done: undefined },
  { type: "null", subtype: undefined, index: 3, done: true },
  { type: "eof", subtype: undefined },
] as JsonToken[]);
assertElementSubset(jsonStreamParse("true"), [
  { type: "true", subtype: undefined, index: 0, done: undefined },
  { type: "true", subtype: undefined, index: 1, done: undefined },
  { type: "true", subtype: undefined, index: 2, done: undefined },
  { type: "true", subtype: undefined, index: 3, done: true },
  { type: "eof", subtype: undefined },
] as JsonToken[]);
assertElementSubset(jsonStreamParse("false"), [
  { type: "false", subtype: undefined, index: 0, done: undefined },
  { type: "false", subtype: undefined, index: 1, done: undefined },
  { type: "false", subtype: undefined, index: 2, done: undefined },
  { type: "false", subtype: undefined, index: 3, done: undefined },
  { type: "false", subtype: undefined, index: 4, done: true },
  { type: "eof", subtype: undefined },
] as JsonToken[]);
