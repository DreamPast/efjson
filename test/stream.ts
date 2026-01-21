import {
  Category,
  createJsonStreamParser,
  JSON5_OPTION,
  jsonStreamParse,
  JsonToken,
  Location,
  Type,
} from "../src/index";
import { assertElementSubset, assertEq } from "./_util";

describe("stream", () => {
  test("number", () => {
    assertElementSubset(jsonStreamParse("-1.0e+3"), [
      { category: Category.NUMBER, type: Type.NUMBER_INTEGER_SIGN },
      { category: Category.NUMBER, type: Type.NUMBER_INTEGER_DIGIT },
      { category: Category.NUMBER, type: Type.NUMBER_FRACTION_START },
      { category: Category.NUMBER, type: Type.NUMBER_FRACTION_DIGIT },
      { category: Category.NUMBER, type: Type.NUMBER_EXPONENT_START },
      { category: Category.NUMBER, type: Type.NUMBER_EXPONENT_SIGN },
      { category: Category.NUMBER, type: Type.NUMBER_EXPONENT_DIGIT },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
  });

  test("object", () => {
    assertElementSubset(jsonStreamParse('{"a":{},"b":1}'), [
      { category: Category.OBJECT, type: Type.OBJECT_START },
      { category: Category.STRING, type: Type.STRING_START },
      { category: Category.STRING, type: Type.STRING_NORMAL },
      { category: Category.STRING, type: Type.STRING_END },
      { category: Category.OBJECT, type: Type.OBJECT_VALUE_START },
      { category: Category.OBJECT, type: Type.OBJECT_START },
      { category: Category.OBJECT, type: Type.OBJECT_END },
      { category: Category.OBJECT, type: Type.OBJECT_NEXT },

      { category: Category.STRING, type: Type.STRING_START },
      { category: Category.STRING, type: Type.STRING_NORMAL },
      { category: Category.STRING, type: Type.STRING_END },
      { category: Category.OBJECT, type: Type.OBJECT_VALUE_START },
      { category: Category.NUMBER, type: Type.NUMBER_INTEGER_DIGIT },
      { category: Category.OBJECT, type: Type.OBJECT_END },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);

    assertElementSubset(jsonStreamParse('{"a":{},}', JSON5_OPTION), [
      { category: Category.OBJECT, type: Type.OBJECT_START },
      { category: Category.STRING, type: Type.STRING_START },
      { category: Category.STRING, type: Type.STRING_NORMAL },
      { category: Category.STRING, type: Type.STRING_END },
      { category: Category.OBJECT, type: Type.OBJECT_VALUE_START },
      { category: Category.OBJECT, type: Type.OBJECT_START },
      { category: Category.OBJECT, type: Type.OBJECT_END },
      { category: Category.OBJECT, type: Type.OBJECT_NEXT },
      { category: Category.OBJECT, type: Type.OBJECT_END },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
  });

  test("array", () => {
    assertElementSubset(jsonStreamParse("[[],[1]]"), [
      { category: Category.ARRAY, type: Type.ARRAY_START },
      { category: Category.ARRAY, type: Type.ARRAY_START },
      { category: Category.ARRAY, type: Type.ARRAY_END },
      { category: Category.ARRAY, type: Type.ARRAY_NEXT },
      { category: Category.ARRAY, type: Type.ARRAY_START },
      { category: Category.NUMBER, type: Type.NUMBER_INTEGER_DIGIT },
      { category: Category.ARRAY, type: Type.ARRAY_END },
      { category: Category.ARRAY, type: Type.ARRAY_END },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);

    assertElementSubset(jsonStreamParse("[1,]", JSON5_OPTION), [
      { category: Category.ARRAY, type: Type.ARRAY_START },
      { category: Category.NUMBER, type: Type.NUMBER_INTEGER_DIGIT },
      { category: Category.ARRAY, type: Type.ARRAY_NEXT },
      { category: Category.ARRAY, type: Type.ARRAY_END },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
  });

  test("literal", () => {
    assertElementSubset(jsonStreamParse("null"), [
      { category: Category.NULL, type: Type.NULL, index: 0, done: false },
      { category: Category.NULL, type: Type.NULL, index: 1, done: false },
      { category: Category.NULL, type: Type.NULL, index: 2, done: false },
      { category: Category.NULL, type: Type.NULL, index: 3, done: true },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
    assertElementSubset(jsonStreamParse("true"), [
      { category: Category.BOOLEAN, type: Type.TRUE, index: 0, done: false },
      { category: Category.BOOLEAN, type: Type.TRUE, index: 1, done: false },
      { category: Category.BOOLEAN, type: Type.TRUE, index: 2, done: false },
      { category: Category.BOOLEAN, type: Type.TRUE, index: 3, done: true },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
    assertElementSubset(jsonStreamParse("false"), [
      { category: Category.BOOLEAN, type: Type.FALSE, index: 0, done: false },
      { category: Category.BOOLEAN, type: Type.FALSE, index: 1, done: false },
      { category: Category.BOOLEAN, type: Type.FALSE, index: 2, done: false },
      { category: Category.BOOLEAN, type: Type.FALSE, index: 3, done: false },
      { category: Category.BOOLEAN, type: Type.FALSE, index: 4, done: true },
      { category: Category.EOF, type: Type.EOF },
    ] as JsonToken[]);
  });

  test("string", () => {
    assertElementSubset(jsonStreamParse('"\\u1234\\na"'), [
      { category: Category.STRING, type: Type.STRING_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: "\u1234" },
      { category: Category.STRING, type: Type.STRING_ESCAPE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE, escaped: "\n" },
      { category: Category.STRING, type: Type.STRING_NORMAL },
      { category: Category.STRING, type: Type.STRING_END },
      { category: Category.EOF, type: Type.EOF },
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

  test("location", () => {
    const parser = createJsonStreamParser();
    assertEq(parser.location, Location.ROOT);
    parser.feed('{"a');
    assertEq(parser.location, Location.KEY);
    parser.feed('":1');
    assertEq(parser.location, Location.VALUE);
    parser.feed("}");
    assertEq(parser.location, Location.ROOT);
  });

  test("copy", () => {
    const s = '"\\u1234\\na"';
    const tokens = [
      { category: Category.STRING, type: Type.STRING_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: undefined },
      { category: Category.STRING, type: Type.STRING_ESCAPE_UNICODE, escaped: "\u1234" },
      { category: Category.STRING, type: Type.STRING_ESCAPE_START },
      { category: Category.STRING, type: Type.STRING_ESCAPE, escaped: "\n" },
      { category: Category.STRING, type: Type.STRING_NORMAL },
      { category: Category.STRING, type: Type.STRING_END },
      { category: Category.EOF, type: Type.EOF },
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
