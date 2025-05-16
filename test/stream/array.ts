import { JSON5_OPTION, jsonStreamParse, JsonToken } from "../../efjson";
import { assertElementSubset } from "../util";

assertElementSubset(jsonStreamParse("[[],[1]]"), [
  { location: "root", type: "array", subtype: "start" },
  { location: "element", type: "array", subtype: "start" },
  { location: "element", type: "array", subtype: "end" },
  { location: "array", type: "array", subtype: "next" },
  { location: "element", type: "array", subtype: "start" },
  { location: "element", type: "number", subtype: "integer_digit" },
  { location: "element", type: "array", subtype: "end" },
  { location: "root", type: "array", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);

assertElementSubset(jsonStreamParse("[,]", JSON5_OPTION), [
  { location: "root", type: "array", subtype: "start" },
  { location: "array", type: "array", subtype: "empty_next" },
  { location: "root", type: "array", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);

assertElementSubset(jsonStreamParse("[1,]", JSON5_OPTION), [
  { location: "root", type: "array", subtype: "start" },
  { location: "element", type: "number", subtype: "integer_digit" },
  { location: "array", type: "array", subtype: "next" },
  { location: "root", type: "array", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);
