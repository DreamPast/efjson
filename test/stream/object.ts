import { JSON5_OPTION, jsonStreamParse, JsonToken } from "efjson";
import { assertElementSubset } from "../util";

assertElementSubset(jsonStreamParse('{"a":{},"b":1}'), [
  { location: "root", type: "object", subtype: "start" },
  { location: "key", type: "string", subtype: "start" },
  { location: "key", type: "string", subtype: "normal" },
  { location: "key", type: "string", subtype: "end" },
  { location: "object", type: "object", subtype: "value_start" },
  { location: "value", type: "object", subtype: "start" },
  { location: "value", type: "object", subtype: "end" },
  { location: "object", type: "object", subtype: "next" },

  { location: "key", type: "string", subtype: "start" },
  { location: "key", type: "string", subtype: "normal" },
  { location: "key", type: "string", subtype: "end" },
  { location: "object", type: "object", subtype: "value_start" },
  { location: "value", type: "number", subtype: "integer_digit" },
  { location: "root", type: "object", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);

assertElementSubset(jsonStreamParse("{,}", JSON5_OPTION), [
  { location: "root", type: "object", subtype: "start" },
  { location: "object", type: "object", subtype: "empty_next" },
  { location: "root", type: "object", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);

assertElementSubset(jsonStreamParse('{"a":{},}', JSON5_OPTION), [
  { location: "root", type: "object", subtype: "start" },
  { location: "key", type: "string", subtype: "start" },
  { location: "key", type: "string", subtype: "normal" },
  { location: "key", type: "string", subtype: "end" },
  { location: "object", type: "object", subtype: "value_start" },
  { location: "value", type: "object", subtype: "start" },
  { location: "value", type: "object", subtype: "end" },
  { location: "object", type: "object", subtype: "next" },
  { location: "root", type: "object", subtype: "end" },
  { location: "root", type: "eof", subtype: undefined },
] as JsonToken[]);
