import { createJsonStreamParser, JSON5_OPTION, jsonStreamParse, JsonToken } from "../src/index";
import { assertElementSubset, assertEq } from "./_util";

describe("stream", () => {
  test("number", () => {
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
  });

  test("object", () => {
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
  });

  test("array", () => {
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

    assertElementSubset(jsonStreamParse("[1,]", JSON5_OPTION), [
      { location: "root", type: "array", subtype: "start" },
      { location: "element", type: "number", subtype: "integer_digit" },
      { location: "array", type: "array", subtype: "next" },
      { location: "root", type: "array", subtype: "end" },
      { location: "root", type: "eof", subtype: undefined },
    ] as JsonToken[]);
  });

  test("literal", () => {
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
  });

  test("string", () => {
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
  });

  test("position", () => {
    const getPosInfo = (s: string) => {
      const parser = createJsonStreamParser();
      parser.feed(s);
      parser.end();
      return {
        line: parser.line,
        column: parser.column,
        position: parser.position,
      };
    };

    assertEq(getPosInfo("\r\n1"), { line: 1, column: 1, position: 3 });
    assertEq(getPosInfo("\r\r1"), { line: 2, column: 1, position: 3 });
    assertEq(getPosInfo("\n\n1"), { line: 2, column: 1, position: 3 });
    assertEq(getPosInfo("\r1"), { line: 1, column: 1, position: 2 });
    assertEq(getPosInfo("\n1"), { line: 1, column: 1, position: 2 });
  });

  test("copy", () => {
    const s = '"\\u1234\\na"';
    const tokens = [
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
    ];
    const parser = createJsonStreamParser();
    for (let i = 0; i < s.length; ++i) {
      parser.feed(s[i]);
      const parser2 = parser.copy();
      assertElementSubset([...parser2.feed(s.slice(i + 1)), parser2.end()], tokens.slice(i + 1));
    }
    parser.end();
  });
});
