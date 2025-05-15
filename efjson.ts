/**
 * @file efjson.ts
 * @description a streaming JSON parser
 * @author Jin Cai
 * @license MIT
 */
/*
The MIT License (MIT)

Copyright (C) 2025-2025 Jin Cai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const EOF = "\u0000";
const EXTRA_WHITESPACE =
  /* <VT>, <FF>, <NBSP>, <BOM>, <USP> */
  "\u000B\u000C\u00A0\uFEFF\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000";
const isWhitespace = (c: string, fitJson5?: boolean) => {
  /* <SP>, <TAB>, <LF>, <CR> */
  if (" \t\n\r".includes(c)) return true;
  return fitJson5 && EXTRA_WHITESPACE.includes(c);
};
const isNextLine = (c: string) => "\n\u2028\u2029\r".includes(c);
const isNumberSeparator = (c: string, fitJson5?: boolean) =>
  isWhitespace(c, fitJson5) || "\0,]}/".includes(c);
const isControl = (c: string) => c >= "\x00" && c <= "\x1F";
const isHex = (c: string) =>
  (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isIdentifierStart = (c: string) =>
  /[$_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}]/u.test(c);
const isIdentifierNext = (c: string) =>
  isIdentifierStart(c) || /\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D/u.test(c);

const ESCAPE_TABLE: { [k: string]: string | undefined } = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const ESCAPE_TABLE2: { [k: string]: string | undefined } = {
  "'": "'",
  v: "\v",
  0: EOF,
};

const formatChar = (c: string) => {
  const code = c.codePointAt(0)!;
  if (code === 0) return "EOF";
  if (/\P{C}/u.test(c)) return `'${c}'`;
  return `U+${code.toString(16).toUpperCase()}`;
};

const enum ValueState {
  EMPTY,
  NULL,
  TRUE,
  FALSE,
  STRING,
  STRING_ESCAPE,
  STRING_UNICODE,
  NUMBER,
  NUMBER_FRACTION,
  NUMBER_EXPONENT,
  /* JSON5 */
  STRING_MULTILINE_CR, // used to check \r\n
  STRING_ESCAPE_HEX, // used to check \xNN
  NUMBER_INFINITY, // used to check "Infinity"
  NUMBER_NAN, // used to check "NaN"
  NUMBER_HEX, // used to check hexadecimal number
  NUMBER_OCT, // used to check octal number
  NUMBER_BIN, // used to check binary number

  COMMENT_MAY_START, // used to check comment
  SINGLE_LINE_COMMENT, // used to check single line comment
  MULTI_LINE_COMMENT, // used to check multi-line comment
  MULTI_LINE_COMMENT_MAY_END, // used to check multi-line comment

  IDENTIFIER, // used to check identifier key
  IDENTIFIER_ESCAPE, // used to check identifier key
}

const enum LocateState {
  ROOT_START,
  KEY_FIRST_START, // used to check trailling comma
  KEY_START,
  VALUE_START,
  ELEMENT_FIRST_START, // used to check trailling comma
  ELEMENT_START,

  ROOT_END,
  KEY_END,
  VALUE_END,
  ELEMENT_END,
  EOF,

  /* JSON5 */
  EMPTY_OBJECT,
  EMPTY_ARRAY,
}

export type JsonOption = {
  // << white space >>
  /**
   * whether to accept whitespace in JSON5
   */
  acceptJson5Whitespace?: boolean;

  // << array >>
  /**
   * whether to accept a single trailing comma in array
   * @example '[1,]', '[,]'
   */
  acceptTrailingCommaInArray?: boolean;

  // << object >>
  /**
   * whether to accept a single trailing comma in object
   * @example '{"a":1,}', '{,}'
   */
  acceptTrailingCommaInObject?: boolean;
  /**
   * whether to accept identifier key in object
   * @example '{a:1}'
   */
  acceptIdentifierKey?: boolean;

  // << string >>
  /**
   * whether to accept single quote in string
   * @example "'a'"
   */
  acceptSingleQuote?: boolean;
  /**
   * whether to accept multi-line string
   * @example '"a\\\nb"'
   */
  acceptMultilineString?: boolean;
  /**
   * whether to accept JSON5 string escape
   * @example '"\\x01"', '\\v', '\\0'
   */
  accpetJson5StringEscape?: boolean;

  // << number >>
  /**
   * whether to accept positive sign in number
   * @example '+1', '+0'
   */
  acceptPositiveSign?: boolean;
  /**
   * whether to accept empty fraction in number
   * @example '1.', '0.'
   */
  acceptEmptyFraction?: boolean;
  /**
   * whether to accept empty integer in number
   * @example '.1', '.0'
   */
  acceptEmptyInteger?: boolean;
  /**
   * whether to accept NaN
   */
  acceptNan?: boolean;
  /**
   * whether to accept Infinity
   */
  acceptInfinity?: boolean;
  /**
   * whether to accept hexadecimal integer
   * @example '0x1', '0x0'
   */
  acceptHexadecimalInteger?: boolean;
  /**
   * whether to accept octal integer
   * @example '0o1', '0o0'
   */
  acceptOctalInteger?: boolean;
  /**
   * whether to accept binary integer
   * @example '0b1', '0b0'
   */
  acceptBinaryInteger?: boolean;

  // << comment >>
  /**
   * whether to accept single line comment
   * @example '// a comment'
   */
  acceptSingleLineComment?: boolean;
  /**
   * whether to accept multi-line comment
   */
  accpetMultiLineComment?: boolean;
};
export const JSON5_OPTION = Object.freeze({
  // << white space >>
  acceptJson5Whitespace: true,

  // << array >>
  acceptTrailingCommaInArray: true,

  // << object >>
  acceptTrailingCommaInObject: true,
  acceptIdentifierKey: true,

  // << string >>
  acceptSingleQuote: true,
  acceptMultilineString: true,
  accpetJson5StringEscape: true,

  // << number >>
  acceptPositiveSign: true,
  acceptEmptyFraction: true,
  acceptEmptyInteger: true,
  acceptNan: true,
  acceptInfinity: true,
  acceptHexadecimalInteger: true,

  // << comment >>
  acceptSingleLineComment: true,
  accpetMultiLineComment: true,
});
export const JSONC_OPTION = Object.freeze({
  acceptSingleLineComment: true,
  accpetMultiLineComment: true,
});

namespace TokenInfo {
  type _Whitespace = { type: "whitespace"; subtype?: undefined };
  type _Null = { type: "null"; subtype?: undefined } & (
    | { index: 0 | 1 | 2; done?: undefined }
    | { index: 3; done: true }
  );
  type _True = { type: "true"; subtype?: undefined } & (
    | { index: 0 | 1 | 2; done?: undefined }
    | { index: 3; done: true }
  );
  type _False = { type: "false"; subtype?: undefined } & (
    | { index: 0 | 1 | 2 | 3; done?: undefined }
    | { index: 4; done: true }
  );

  type _StringStartEnd = { subtype: "start" | "end" };
  type _StringNormal = { subtype: "normal" };
  type _StringEscape2Start = {
    subtype: "escape_start" | "unicode_start";
  };
  type _StringEscape = { subtype: "escape" } & {
    escaped_value: '"' | "\\" | "/" | "\b" | "\f" | "\n" | "\r" | "\t";
  };
  type _StringUnicode = { subtype: "unicode" } & (
    | { index: 0 | 1 | 2; escaped_value?: undefined }
    | { index: 3; escaped_value: string }
  );
  type _String = { type: "string" } & (
    | _StringStartEnd
    | _StringNormal
    | _StringEscape2Start
    | _StringEscape
    | _StringUnicode
  );

  type _NumberSign = {
    subtype: "integer_sign" | "exponent_sign";
  };
  type _NumberDigit = {
    subtype: "integer_digit" | "fraction_digit" | "exponent_digit";
  };
  type _NumberStart = {
    subtype: "fraction_start" | "exponent_start";
  };
  type _Number = { type: "number" } & (
    | _NumberSign
    | _NumberDigit
    | _NumberStart
  );

  type _NotKeyLocation = "root" | "value" | "object" | "array" | "element";
  type _NotKey =
    | _String
    | _Null
    | _True
    | _False
    | _Number
    | { type: "object"; subtype: "start" | "end" }
    | { type: "array"; subtype: "start" | "end" };
  export type StdJsonTokenInfo =
    | ({ location: _NotKeyLocation | "key" } & _Whitespace)
    | { location: "root"; type: "eof"; subtype?: undefined }
    | ({ location: _NotKeyLocation } & _NotKey)
    | ({ location: "key" } & _String)
    | {
        location: "object";
        type: "object";
        subtype: "value_start" | "next";
      }
    | { location: "array"; type: "array"; subtype: "next" };

  // << array >>
  type _Extra_TraillingCommaInArray = {
    location: "array";
    type: "array";
    subtype: "empty_next";
  };

  // << object >>
  type _Extra_TraillingCommaInObject = {
    location: "object";
    type: "object";
    subtype: "empty_next";
  };
  type _Extra_IdentifierKey = { location: "key"; type: "identifier" } & (
    | {
        subtype: "escape_start";
        index: 0 | 1;
      }
    | {
        subtype: "escape";
        index: 0 | 1 | 2;
        escaped_value?: undefined;
      }
    | {
        subtype: "escape";
        index: 3;
        escaped_value: string;
      }
    | { subtype: "normal" }
  );

  // << string >>
  type _Extra_MultilineString = {
    location: _NotKeyLocation | "key";
    type: "string";
    subtype: "next_line";
  };
  type _Extra_Json5StringEscape = {
    location: _NotKeyLocation | "key";
    type: "string";
  } & (
    | { subtype: "escape_hex_start" }
    | { subtype: "escape"; escaped_value: "\v" | "\0" | "'" }
    | { subtype: "escape_hex"; index: 0; escaped_value?: undefined }
    | { subtype: "escape_hex"; index: 1; escaped_value: string }
  );

  // << number >>
  type _Extra_Nan = {
    location: _NotKeyLocation;
    type: "number";
    subtype: "nan";
  } & ({ index: 0 | 1; done?: undefined } | { index: 2; done: true });
  type _Extra_Infinity = {
    location: _NotKeyLocation;
    type: "number";
    subtype: "infinity";
  } & (
    | {
        index: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        done?: undefined;
      }
    | { index: 7; done: true }
  );
  type _Extra_HexadecimalInteger = {
    location: _NotKeyLocation;
    type: "number";
    subtype: "hex_start" | "hex";
  };
  type _Extra_OctalInteger = {
    location: _NotKeyLocation;
    type: "number";
    subtype: "oct_start" | "oct";
  };
  type _Extra_BinaryInteger = {
    location: _NotKeyLocation;
    type: "number";
    subtype: "bin_start" | "bin";
  };

  // << comment >>
  type _Extra_SingleLineComment = {
    location: _NotKeyLocation | "key";
    type: "comment";
    subtype: "may_start" | "single_line";
  };
  type _Extra_MultiLineComment = {
    location: _NotKeyLocation | "key";
    type: "comment";
    subtype: "may_start" | "multi_line" | "multi_line_end";
  };

  type _Select<Opt, Key, True, False = never> = Key extends keyof Opt
    ? Opt[Key] extends false
      ? False
      : True
    : False;
  export type JsonTokenInfo<Opt extends JsonOption> =
    | StdJsonTokenInfo
    // << array >>
    | _Select<Opt, "acceptTrailingCommaInArray", _Extra_TraillingCommaInArray>
    // << object >>
    | _Select<Opt, "acceptTrailingCommaInObject", _Extra_TraillingCommaInObject>
    | _Select<Opt, "acceptIdentifierKey", _Extra_IdentifierKey>
    // << string >>
    | _Select<Opt, "acceptMultilineString", _Extra_MultilineString>
    | _Select<Opt, "accpetJson5StringEscape", _Extra_Json5StringEscape>
    // << number >>
    | _Select<Opt, "acceptNan", _Extra_Nan>
    | _Select<Opt, "acceptInfinity", _Extra_Infinity>
    | _Select<Opt, "acceptHexadecimalInteger", _Extra_HexadecimalInteger>
    | _Select<Opt, "acceptOctalInteger", _Extra_OctalInteger>
    | _Select<Opt, "acceptBinaryInteger", _Extra_BinaryInteger>
    // << comment >>
    | _Select<Opt, "acceptSingleLineComment", _Extra_SingleLineComment>
    | _Select<Opt, "accpetMultiLineComment", _Extra_MultiLineComment>;
}
type JsonToken<Opt extends JsonOption> = TokenInfo.JsonTokenInfo<Opt> & {
  character: string;
};
type AllJsonToken = JsonToken<JsonOption>;

const LOCATION_TABLE: ("root" | "key" | "value" | "element")[] = [];
LOCATION_TABLE[LocateState.ROOT_START] = LOCATION_TABLE[LocateState.ROOT_END] =
  "root";
LOCATION_TABLE[LocateState.KEY_FIRST_START] =
  LOCATION_TABLE[LocateState.KEY_START] =
  LOCATION_TABLE[LocateState.KEY_END] =
    "key";
LOCATION_TABLE[LocateState.VALUE_START] = LOCATION_TABLE[
  LocateState.VALUE_END
] = "value";
LOCATION_TABLE[LocateState.ELEMENT_FIRST_START] =
  LOCATION_TABLE[LocateState.ELEMENT_START] =
  LOCATION_TABLE[LocateState.ELEMENT_END] =
    "element";

const NEXT_STATE_TABLE: LocateState[] = [
  LocateState.ROOT_END,
  LocateState.KEY_END,
  LocateState.KEY_END,
  LocateState.VALUE_END,
  LocateState.ELEMENT_END,
  LocateState.ELEMENT_END,
];

//

export class JsonParserError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonParserError";
  }
}

//

export class JsonStreamParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "StreamJsonParserError";
  }
}

function createJsonStreamParserInternal(option?: JsonOption, init?: any[]) {
  option = option || {};
  const acceptJson5Whitespace = option.acceptJson5Whitespace;
  const acceptTrailingCommaInArray = option.acceptTrailingCommaInArray;
  const acceptTrailingCommaInObject = option.acceptTrailingCommaInObject;
  const acceptIdentifierKey = option.acceptIdentifierKey;
  const acceptSingleQuote = option.acceptSingleQuote;
  const acceptMultilineString = option.acceptMultilineString;
  const accpetJson5StringEscape = option.accpetJson5StringEscape;
  const acceptPositiveSign = option.acceptPositiveSign;
  const acceptEmptyFraction = option.acceptEmptyFraction;
  const acceptEmptyInteger = option.acceptEmptyInteger;
  const acceptNan = option.acceptNan;
  const acceptInfinity = option.acceptInfinity;
  const acceptHexadecimalInteger = option.acceptHexadecimalInteger;
  const acceptOctalInteger = option.acceptOctalInteger;
  const acceptBinaryInteger = option.acceptBinaryInteger;
  const acceptSingleLineComment = option.acceptSingleLineComment;
  const accpetMultiLineComment = option.accpetMultiLineComment;

  let _position = 0;
  let _line = 1;
  let _column = 1;
  let _meetCr = false;

  /**
   * The state of the location
   * - at the start/end of the root node
   * - at the start/end of an object's key or value
   * - at the start/end of an array's element
   */
  let _location = LocateState.ROOT_START;
  /**
   * The state of the value
   * - parse empty
   * - parse null
   * - parse boolean
   * - parse string
   */
  let _state = ValueState.EMPTY;
  /**
   * primary value substate (see following)
   *
   * possible values:
   *   `STRING_UNICODE`: [string] Unicode sequence
   *
   *   `NUMBER`: [-1] accept sign, not yet accept number
   *             [0]  already accept +0/-0
   *             [1]  already accept non-leading 0 number
   *
   *   `NUMBER_EXPONENT`: [boolean] whether already accept digits
   *
   *   `NUMBER_FRACTION`: [0] not yet accept any
   *                      [1] already accept sign, not accept digits
   *                      [2] already accept digits
   *
   *   `NULL`/`TRUE`/`FALSE`: [number] current index of string
   *
   *   `STRING_ESCAPE_HEX`: [string] current hex string
   *
   *   `NUMBER_NAN`|`NUMBER_INFINITY`: [number] current index of string
   *
   *   `NUMBER_HEX`|`NUMBER_OCT`|`NUMBER_BIN`: [boolean] whether already accept digits
   *
   *   `IDENTIFIER_ESCAPE`: [string] Unicode sequence (includes 'u' prefix)
   */
  let _substate: any;
  /**
   * Additional primary value substate (see following)
   *
   * possible_values:
   *  `STRING`|`STRING_ESCAPE`|`STRING_UNICODE`: [string] the character starting the string
   */
  let _substate2: string;

  let _stack: LocateState[] = [];

  if (init !== undefined) {
    [
      _position,
      _line,
      _column,
      _meetCr,
      _location,
      _state,
      _substate,
      _substate2,
      _stack,
    ] = init;
  }

  function _throw(msg?: string): never {
    throw new JsonStreamParserError(
      `JsonParser Error at (${_position})${_line}:${_column} - ${msg}`
    );
  }

  const _handleComma = (
    token: AllJsonToken &
      (
        | {
            location: "object";
            type: "object";
          }
        | { location: "array"; type: "array" }
      )
  ) => {
    if (_location === LocateState.VALUE_END) {
      _location = LocateState.KEY_START;
      token.location = token.type = "object";
      token.subtype = "next";
      return;
    } else if (_location === LocateState.ELEMENT_END) {
      _location = LocateState.ELEMENT_START;
      token.location = token.type = "array";
      token.subtype = "next";
      return;
    }
    if (_location === LocateState.KEY_FIRST_START)
      _throw("extra commas not allowed in object");
    if (_location === LocateState.ELEMENT_FIRST_START) {
      if (acceptTrailingCommaInArray) {
        _location = LocateState.EMPTY_ARRAY;
        token.location = token.type = "array";
        token.subtype = "empty_next";
        return;
      }
      _throw("extra commas not allowed in array");
    }
    if (_location === LocateState.VALUE_START) _throw("unpexted empty value");
    _throw("unexpected comma");
  };
  const _handleArrayEnd = (token: AllJsonToken & { type: "array" }) => {
    if (
      _location === LocateState.ELEMENT_FIRST_START ||
      _location === LocateState.ELEMENT_END ||
      (_location === LocateState.ELEMENT_START && acceptTrailingCommaInArray)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location] as any;
      token.type = "array";
      token.subtype = "end";
      return;
    }

    if (_location === LocateState.ELEMENT_START)
      _throw("extra commas not allowed in array");
    _throw("bad closing square bracket");
  };
  const _handleObjectEnd = (token: AllJsonToken & { type: "object" }): void => {
    if (
      _location === LocateState.KEY_FIRST_START ||
      _location === LocateState.VALUE_END ||
      (_location === LocateState.KEY_START && acceptTrailingCommaInObject)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location] as any;
      token.type = "object";
      token.subtype = "end";
      return;
    }

    if (_location === LocateState.KEY_START)
      _throw("extra commas not allowed in object");
    _throw("bad closing curly brace");
  };
  const _handleEOF = (token: AllJsonToken): void => {
    switch (_location) {
      case LocateState.ROOT_START:
      case LocateState.ROOT_END:
        token.type = "eof";
        token.subtype = undefined;
        _location = LocateState.EOF;
        return;
      case LocateState.KEY_FIRST_START:
      case LocateState.KEY_START:
      case LocateState.KEY_END:
      case LocateState.VALUE_START:
      case LocateState.VALUE_END:
      case LocateState.EMPTY_OBJECT:
        _throw("unexpected EOF while parsing object");

      case LocateState.ELEMENT_FIRST_START:
      case LocateState.ELEMENT_START:
      case LocateState.ELEMENT_END:
      case LocateState.EMPTY_ARRAY:
        _throw("unexpected EOF while parsing array");

      case LocateState.EOF:
        _throw("unexpected EOF after EOF");
    }
  };
  const _handleSlash = (token: AllJsonToken): void => {
    if (acceptSingleLineComment || accpetMultiLineComment) {
      _state = ValueState.COMMENT_MAY_START;
      token.location = LOCATION_TABLE[_location];
      token.type = "comment";
      token.subtype = "may_start";
      return;
    }
    _throw("comment not allowed");
  };
  const _handleNumberSeparator = (token: AllJsonToken, c: string): void => {
    if (_substate === -1)
      _throw("a number cannot consist of only a negative sign");
    _state = ValueState.EMPTY;
    _location = NEXT_STATE_TABLE[_location];
    if (c === EOF) return _handleEOF(token);
    if (c === "}") return _handleObjectEnd(token as any);
    if (c === "]") return _handleArrayEnd(token as any);
    if (c === ",") return _handleComma(token as any);
    if (c === "/") return _handleSlash(token);
    token.location = LOCATION_TABLE[_location];
    token.type = "whitespace";
    token.subtype = undefined;
    return;
  };
  const _handleLiteral = (
    token: AllJsonToken & { type: "null" | "true" | "false" },
    c: string,
    literal: string
  ) => {
    const dc = literal[_substate];
    if (c === dc) {
      token.type = literal as any;
      token.subtype = undefined;
      token.index = (_substate - 1) as any;
      if (++_substate === literal.length) {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_location];
        token.done = true;
      } else token.done = undefined;
      return;
    }
    _throw(
      `expected '${dc}' while parsing ${literal}, but got ${formatChar(c)}`
    );
  };
  const _handleNumberLiteral = (
    token: AllJsonToken & { type: "number"; subtype: "nan" | "infinity" },
    c: string,
    literal: string,
    subtype: string
  ) => {
    const dc = literal[_substate];
    if (c === dc) {
      token.type = "number";
      token.subtype = subtype as any;
      token.index = (_substate - 1) as any;
      if (++_substate === literal.length) {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_location];
        token.done = true;
      } else token.done = undefined;
      return;
    }
    _throw(
      `expected '${dc}' while parsing ${literal}, but got ${formatChar(c)}`
    );
  };

  const _stepEmpty = (token: any, c: string): void => {
    if (isWhitespace(c, acceptJson5Whitespace)) {
      token.type = "whitespace";
      token.subtype = undefined;
      return;
    }
    if (c === EOF) return _handleEOF(token);
    if (c === "/") return _handleSlash(token);
    if (_location === LocateState.ROOT_END) {
      _throw(`unexpected non-whitespace character ${formatChar(c)} after JSON`);
    }
    if (_location === LocateState.EMPTY_ARRAY) {
      if (c === "]") {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_stack.pop()!];
        token.location = "array";
        token.type = "array";
        token.subtype = "end";
        return;
      }
      _throw(
        "the first comma is treated as a trailing comma, more elements are not allowed"
      );
    }
    if (_location === LocateState.EMPTY_OBJECT) {
      if (c === "}") {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_stack.pop()!];
        token.location = "object";
        token.type = "object";
        token.subtype = "end";
        return;
      }
      _throw(
        "the first comma is treated as a trailing comma, more properties are not allowed"
      );
    }

    if (c === '"' || (c === "'" && acceptSingleQuote)) {
      _state = ValueState.STRING;
      _substate2 = c;
      token.type = "string";
      token.subtype = "start";
      return;
    }
    if (c === "'") _throw("single quote not allowed");
    if (
      _location === LocateState.KEY_FIRST_START ||
      _location === LocateState.KEY_START
    ) {
      if (acceptIdentifierKey)
        if (isIdentifierStart(c)) {
          _state = ValueState.IDENTIFIER;
          token.location = "key";
          token.type = "identifier";
          token.subtype = "normal";
          return;
        } else if (c === "\\") {
          _state = ValueState.IDENTIFIER_ESCAPE;
          _substate = "";
          token.location = "key";
          token.type = "identifier";
          token.subtype = "escape_start";
          token.index = 0;
          return;
        }
      if (
        _location === LocateState.KEY_FIRST_START &&
        c === "," &&
        acceptTrailingCommaInObject
      ) {
        _location = LocateState.EMPTY_OBJECT;
        token.location = "object";
        token.type = "object";
        token.subtype = "empty_next";
        return;
      }
      if (c !== "}") _throw("property name must be a string");
    }

    if (c === ":") {
      if (_location === LocateState.KEY_END) {
        _location = LocateState.VALUE_START;
        _state = ValueState.EMPTY;
        token.location = "object";
        token.type = "object";
        token.subtype = "value_start";
        return;
      }
      if (_location === LocateState.VALUE_START) {
        _throw("unexpected repeated colon");
      }
      if (_location === LocateState.ELEMENT_END) {
        _throw("unexpected colon in array");
      }
      _throw("unexpected colon");
    }
    if (_location === LocateState.KEY_END) {
      _throw("missing colon between key and value");
    }

    switch (c) {
      case "[": {
        _stack.push(_location);
        _location = LocateState.ELEMENT_FIRST_START;
        _state = ValueState.EMPTY;
        token.type = "array";
        token.subtype = "start";
        return;
      }
      case "]":
        return _handleArrayEnd(token);

      case "{": {
        _stack.push(_location);
        _location = LocateState.KEY_FIRST_START;
        _state = ValueState.EMPTY;
        token.type = "object";
        token.subtype = "start";
        return;
      }
      case "}":
        return _handleObjectEnd(token);

      case ",":
        return _handleComma(token);

      case "+":
        if (!acceptPositiveSign) _throw("unexpected '+' sign");
      // fallthrough
      case "-":
        _state = ValueState.NUMBER;
        _substate = -1;
        token.type = "number";
        token.subtype = "integer_sign";
        return;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        _state = ValueState.NUMBER;
        _substate = c === "0" ? 0 : 1;
        token.type = "number";
        token.subtype = "integer_digit";
        return;
      case ".":
        if (acceptEmptyInteger) {
          _state = ValueState.NUMBER_FRACTION;
          _substate = false;
          token.type = "number";
          token.subtype = "fraction_start";
          return;
        }
        _throw("unexpected '.' before number");
      case "N":
        if (acceptNan) {
          _state = ValueState.NUMBER_NAN;
          _substate = 1;
          token.type = "number";
          token.subtype = "nan";
          token.index = 0;
          token.done = undefined;
          return;
        }
        break;
      case "I":
        if (acceptInfinity) {
          _state = ValueState.NUMBER_INFINITY;
          _substate = 1;
          token.type = "number";
          token.subtype = "infinity";
          token.index = 0;
          token.done = undefined;
          return;
        }
        break;

      case "n":
        _state = ValueState.NULL;
        _substate = 1;
        token.type = "null";
        token.index = 0;
        token.done = undefined;
        return;
      case "t":
        _state = ValueState.TRUE;
        _substate = 1;
        token.type = "true";
        token.index = 0;
        token.done = undefined;
        return;
      case "f":
        _state = ValueState.FALSE;
        _substate = 1;
        token.type = "false";
        token.index = 0;
        token.done = undefined;
        return;
      case "u":
        _throw(`"undefined" is not a valid JSON value`);
    }
    _throw(`unexpected ${formatChar(c)}`);
  };
  const _step = (token: any, c: string): void => {
    token.location = LOCATION_TABLE[_location];
    token.character = c;
    switch (_state) {
      case ValueState.EMPTY:
        return _stepEmpty(token, c);
      case ValueState.NULL:
        return _handleLiteral(token, c, "null");
      case ValueState.TRUE:
        return _handleLiteral(token, c, "true");
      case ValueState.FALSE:
        return _handleLiteral(token, c, "false");
      case ValueState.NUMBER_INFINITY:
        return _handleNumberLiteral(token, c, "Infinity", "infinity");
      case ValueState.NUMBER_NAN:
        return _handleNumberLiteral(token, c, "NaN", "nan");

      case ValueState.STRING_MULTILINE_CR:
        if (c === "\n") {
          _state = ValueState.STRING;
          token.type = "string";
          token.subtype = "next_line";
          return;
        }
      // fallthrough
      case ValueState.STRING:
        if (c === _substate2) {
          _location = NEXT_STATE_TABLE[_location];
          _state = ValueState.EMPTY;
          token.type = "string";
          token.subtype = "end";
          return;
        }
        if (c === "\\") {
          _state = ValueState.STRING_ESCAPE;
          token.type = "string";
          token.subtype = "escape_start";
          return;
        }
        if (c === EOF) _throw("unexpected EOF while parsing string");
        if (isControl(c))
          _throw(`unexpected control character ${formatChar(c)}`);
        token.type = "string";
        token.subtype = "normal";
        return;
      case ValueState.STRING_ESCAPE:
        if (c === "u") {
          _state = ValueState.STRING_UNICODE;
          _substate = "";
          token.type = "string";
          token.subtype = "unicode_start";
          return;
        }
        {
          const dc = ESCAPE_TABLE[c];
          if (dc !== undefined) {
            _state = ValueState.STRING;
            token.type = "string";
            token.subtype = "escape";
            token.escaped_value = dc;
            return;
          }
        }
        if (acceptMultilineString && isNextLine(c)) {
          _state =
            c === "\r" ? ValueState.STRING_MULTILINE_CR : ValueState.STRING;
          token.type = "string";
          token.subtype = "next_line";
          return;
        }
        if (accpetJson5StringEscape) {
          const dc = ESCAPE_TABLE2[c];
          if (dc !== undefined) {
            _state = ValueState.STRING;
            token.type = "string";
            token.subtype = "escape";
            token.escaped_value = dc;
            return;
          } else if (c === "x") {
            _state = ValueState.STRING_ESCAPE_HEX;
            _substate = "";
            token.type = "string";
            token.subtype = "escape_hex_start";
            return;
          }
        }
        _throw(`bad escaped character ${formatChar(c)}`);
      case ValueState.STRING_UNICODE:
        if (isHex(c)) {
          _substate += c;
          token.type = "string";
          token.subtype = "unicode";
          token.index = _substate.length - 1;
          if (_substate.length === 4) {
            _state = ValueState.STRING;
            token.escaped_value = String.fromCharCode(parseInt(_substate, 16));
          } else token.escaped_value = undefined;
          return;
        }
        _throw(`bad Unicode escape character ${formatChar(c)}`);
      case ValueState.STRING_ESCAPE_HEX:
        if (isHex(c)) {
          _substate += c;
          token.type = "string";
          token.subtype = "escape_hex";
          token.index = _substate.length - 1;
          if (_substate.length === 2) {
            _state = ValueState.STRING;
            token.escaped_value = String.fromCharCode(parseInt(_substate, 16));
            return;
          } else token.escaped_value = undefined;
          return;
        }
        _throw(`bad Hex escape character ${formatChar(c)}`);

      case ValueState.NUMBER:
        if (c === "0") {
          if (_substate === 0) _throw("leading zero not allowed");
          if (_substate === -1) _substate = 0;
          token.type = "number";
          token.subtype = "integer_digit";
          return;
        }
        if (c >= "1" && c <= "9") {
          if (_substate === 0) _throw("leading zero not allowed");
          if (_substate === -1) _substate = 1;
          token.type = "number";
          token.subtype = "integer_digit";
          return;
        }
        if (c === ".") {
          if (_substate === -1 && !acceptEmptyInteger) {
            _throw("unexpected '.' before number");
          }
          _state = ValueState.NUMBER_FRACTION;
          _substate = false;
          token.type = "number";
          token.subtype = "fraction_start";
          return;
        }
        if (_substate === -1) {
          if (acceptInfinity && c === "I") {
            // "-Infinity"
            _state = ValueState.NUMBER_INFINITY;
            _substate = 1;
            token.type = "number";
            token.subtype = "infinity";
            token.index = 0;
            return;
          }
          _throw("the integer part cannnot be empty");
        }

        if (_substate === 0) {
          token.type = "number";
          if (acceptHexadecimalInteger && (c === "x" || c === "X")) {
            token.subtype = "hex_start";
            _state = ValueState.NUMBER_HEX;
            _substate = false;
            return;
          }
          if (acceptOctalInteger && (c === "o" || c === "O")) {
            token.subtype = "oct_start";
            _state = ValueState.NUMBER_OCT;
            _substate = false;
            return;
          }
          if (acceptBinaryInteger && (c === "b" || c === "B")) {
            token.subtype = "bin_start";
            _state = ValueState.NUMBER_BIN;
            _substate = false;
            return;
          }
        }

        if (c === "e" || c === "E") {
          _state = ValueState.NUMBER_EXPONENT;
          _substate = 0;
          token.type = "number";
          token.subtype = "exponent_start";
          return;
        }
        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the integer part of the number`
        );
      case ValueState.NUMBER_FRACTION:
        if (c >= "0" && c <= "9") {
          _substate = true;
          token.type = "number";
          token.subtype = "fraction_digit";
          return;
        }
        if (_substate === false && !acceptEmptyFraction) {
          _throw("the fraction part cannot be empty");
        }

        if (c === "e" || c === "E") {
          _state = ValueState.NUMBER_EXPONENT;
          _substate = 0;
          token.type = "number";
          token.subtype = "exponent_start";
          return;
        }
        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the fraction part of the number`
        );
      case ValueState.NUMBER_EXPONENT:
        if (c === "+" || c === "-") {
          if (_substate === 0) {
            _substate = 1;
            token.type = "number";
            token.subtype = "exponent_sign";
            return;
          } else if (_substate === 1) {
            _throw("unexpected repeated sign in exponent part");
          } else if (_substate === 2) {
            _throw(`unexpected sign ${c} in exponent part`);
          }
        }
        if (c >= "0" && c <= "9") {
          _substate = 2;
          token.type = "number";
          token.subtype = "exponent_digit";
          return;
        }
        if (_substate === 0 || _substate === 1) {
          _throw("the exponent part cannot be empty");
        }

        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the exponent part of the number`
        );
      case ValueState.NUMBER_HEX:
        if (isHex(c)) {
          _substate = true;
          token.type = "number";
          token.subtype = "hex";
          return;
        }
        if (c === "e" || c === "E")
          _throw("exponent not allowed in hexadecimal number");
        if (c === ".") _throw("fraction not allowed in hexadecimal number");
        if (_substate === false)
          _throw("the hexadecimal integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(
          `unexpected character ${formatChar} while parsing hexadecimal number`
        );

      case ValueState.NUMBER_OCT:
        if (c >= "0" && c <= "7") {
          _substate = true;
          token.type = "number";
          token.subtype = "oct";
          return;
        }
        if (c === "e" || c === "E")
          _throw("exponent not allowed in octal number");
        if (c === ".") _throw("fraction not allowed in octal number");
        if (_substate === false)
          _throw("the octal integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(`unexpected character ${formatChar} while parsing octal number`);

      case ValueState.NUMBER_BIN:
        if (c === "0" || c === "1") {
          _substate = true;
          token.type = "number";
          token.subtype = "bin";
          return;
        }
        if (c === "e" || c === "E")
          _throw("exponent not allowed in binary number");
        if (c === ".") _throw("fraction not allowed in binary number");
        if (_substate === false)
          _throw("the binary integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace))
          return _handleNumberSeparator(token, c);
        _throw(
          `unexpected character ${formatChar} while parsing binary number`
        );

      case ValueState.COMMENT_MAY_START:
        if (acceptSingleLineComment && c === "/") {
          _state = ValueState.SINGLE_LINE_COMMENT;
          token.type = "comment";
          token.subtype = "single_line";
          return;
        }
        if (accpetMultiLineComment && c === "*") {
          _state = ValueState.MULTI_LINE_COMMENT;
          token.type = "comment";
          token.subtype = "multi_line";
          return;
        }
        _throw("slash is not used for comment");
      case ValueState.SINGLE_LINE_COMMENT:
        if (isNextLine(c)) _state = ValueState.EMPTY;
        token.type = "comment";
        token.subtype = "single_line";
        return;
      case ValueState.MULTI_LINE_COMMENT:
        if (c === "*") {
          _state = ValueState.MULTI_LINE_COMMENT_MAY_END;
          token.type = "comment";
          token.subtype = "multi_line";
          return;
        }
        token.type = "comment";
        token.subtype = "multi_line";
        return;
      case ValueState.MULTI_LINE_COMMENT_MAY_END:
        if (c === "/") {
          _state = ValueState.EMPTY;
          token.type = "comment";
          token.subtype = "multi_line_end";
          return;
        }
        if (c !== "*") _state = ValueState.MULTI_LINE_COMMENT;
        token.type = "comment";
        token.subtype = "multi_line";
        return;
      case ValueState.IDENTIFIER:
        if (c === ":") {
          _location = LocateState.VALUE_START;
          _state = ValueState.EMPTY;
          token.location = "object";
          token.type = "object";
          token.subtype = "value_start";
          return;
        }
        if (isWhitespace(c, acceptJson5Whitespace)) {
          _state = ValueState.EMPTY;
          _location = LocateState.KEY_END;
          token.location = "key";
          token.type = "whitespace";
          token.subtype = undefined;
          return;
        }
        if (isIdentifierNext(c)) {
          token.location = "key";
          token.type = "identifier";
          token.subtype = "normal";
          return;
        }
        _throw(
          `unexpected character ${formatChar(c)} while parsing identifier`
        );

      case ValueState.IDENTIFIER_ESCAPE:
        if (_substate.length === 0) {
          if (c === "u") {
            _state = ValueState.IDENTIFIER_ESCAPE;
            _substate = "u";
            token.location = "key";
            token.type = "identifier";
            token.subtype = "escape_start";
            token.index = 1;
            return;
          }
          _throw(
            `expected 'u' after '\\' in identifier, but got ${formatChar(c)}`
          );
        }
        if (isHex(c)) {
          _substate += c;
          token.location = "key";
          token.type = "identifier";
          token.subtype = "escape";
          token.index = _substate.length - 2;
          if (_substate.length === 5) {
            _location = LocateState.KEY_END;
            _state = ValueState.EMPTY;
            token.escaped_value = String.fromCharCode(
              parseInt((_substate as string).slice(1), 16)
            );
          } else token.escaped_value = undefined;
          return;
        }
        _throw(
          `expected hexadecimal number after '\\u' in identifier, but got ${formatChar(
            c
          )}`
        );
    }
  };
  const _checkNextLine = (c: string) => {
    if (_meetCr) {
      if (c !== "\n") {
        ++_line;
        _column = 1;
      }
      _meetCr = false;
    }
  };
  const _feed = (token: AllJsonToken, c: string) => {
    _checkNextLine(c);
    _step(token, c);
    ++_position;
    if (isNextLine(c)) {
      if (c === "\r") {
        ++_column;
        _meetCr = true;
      } else {
        ++_line;
        _column = 1;
      }
    } else if (c !== EOF) ++_column;
    return token;
  };

  return {
    feedOneTo: _feed,

    feed(s: string) {
      const ret: AllJsonToken[] = [];
      for (const c of s) {
        const token: AllJsonToken = {} as any;
        ret.push(_feed(token, c));
      }
      return ret;
    },
    end(): AllJsonToken {
      const token: AllJsonToken = {} as any;
      return _feed(token, EOF);
    },

    get position() {
      return _position;
    },
    get line() {
      return _line;
    },
    get column() {
      return _column;
    },

    copy() {
      return createJsonStreamParserInternal(option, [
        _position,
        _line,
        _column,
        _meetCr,
        _location,
        _state,
        _substate,
        _substate2,
        [..._stack],
      ]);
    },
  };
}

export interface JsonStreamParser<Opt extends JsonOption = JsonOption> {
  feedOneTo: (destToken: object, c: string) => JsonToken<Opt>;

  feed(s: string): JsonToken<Opt>[];
  end(): JsonToken<Opt>;

  get position(): number;
  get line(): number;
  get column(): number;

  copy(): JsonStreamParser<Opt>;
}
export function createJsonStreamParser<Opt extends JsonOption = {}>(
  option?: Opt
): JsonStreamParser<Opt> {
  return createJsonStreamParserInternal(option) as any;
}

export function jsonStreamParse<Opt extends JsonOption = {}>(
  s: string,
  option?: Opt
): JsonToken<Opt>[] {
  const parser = createJsonStreamParser(option);
  const ret = parser.feed(s);
  ret.push(parser.end());
  return ret;
}

//

export class JsonEventParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonEventParserError";
  }
}

export type JsonArray = JsonValue[];
export type JsonObject = { [k: string]: JsonValue };
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type JsonEventAnyReceiver<Opt extends JsonOption> = {
  type: "any";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt>) => void;
  save?: (val: JsonValue) => void;

  /**
   * After obtaining a specific type, it can be transformed into other types of receivers.
   * If the sub-receiver lacks methods like `start`, `end`, `feed`, or `save`,
   * it will attempt to inherit them from the parent receiver.
   */
  dict?: {
    null?: JsonEventNullReceiver<Opt>;
    boolean?: JsonEventBooleanReceiver<Opt>;
    number?: JsonEventNumberReceiver<Opt>;
    string?: JsonEventStringReceiver<Opt>;
    object?: JsonEventObjectReceiver<Opt>;
    array?: JsonEventArrayReceiver<Opt>;
  };
};
export type JsonEventNullReceiver<Opt extends JsonOption> = {
  type: "null";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "null" }) => void;
  save?: (val: null) => void;
};
export type JsonEventBooleanReceiver<Opt extends JsonOption> = {
  type: "boolean";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "true" | "false" }) => void;
  save?: (val: boolean) => void;
};
export type JsonEventNumberReceiver<Opt extends JsonOption> = {
  type: "number";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "number" }) => void;
  save?: (num: number) => void;
};
export type JsonEventStringReceiver<Opt extends JsonOption> = {
  type: "string";
  append?: (chunk: string) => void;

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "string" }) => void;
  save?: (str: string) => void;
};
export type JsonEventObjectReceiver<Opt extends JsonOption> = {
  type: "object";

  set?: (key: string, value: JsonValue) => void;
  next?: () => void;

  keyReceiver?: JsonEventStringReceiver<Opt>;
  subscribeList?: ((key: string) => JsonEventReceiver<Opt> | undefined)[];

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "object" }) => void;
  save?: (obj: JsonObject) => void;
};
export type JsonEventArrayReceiver<Opt extends JsonOption> = {
  type: "array";

  set?: (index: number, value: JsonValue) => void;
  next?: (new_index: number) => void;

  subscribeList?: ((index: number) => JsonEventReceiver<Opt> | undefined)[];

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "array" }) => void;
  save?: (obj: JsonArray) => void;
};
export type JsonEventReceiver<Opt extends JsonOption = JsonOption> =
  | JsonEventAnyReceiver<Opt>
  | JsonEventNullReceiver<Opt>
  | JsonEventBooleanReceiver<Opt>
  | JsonEventNumberReceiver<Opt>
  | JsonEventStringReceiver<Opt>
  | JsonEventObjectReceiver<Opt>
  | JsonEventArrayReceiver<Opt>;

namespace EventState {
  export type _Unknown<Opt extends JsonOption> = {
    _type?: undefined;
    _receiver: JsonEventReceiver<Opt>;
    _save?: undefined;
  };
  export type _StateLess<Opt extends JsonOption> = {
    _type: "null" | "true" | "false";
    _receiver: JsonEventReceiver<Opt>;
    _save?: undefined;
  };
  export type _Number<Opt extends JsonOption> = {
    _type: "number";
    _receiver: JsonEventNumberReceiver<Opt>;

    _save?: boolean;
    _list: string[];
  };
  export type _String<Opt extends JsonOption> = {
    _type: "string";
    _receiver: JsonEventStringReceiver<Opt>;

    _save?: boolean;
    _list: string[];
    _isIdentifier?: boolean;
  };

  export type _Object<Opt extends JsonOption> = {
    _type: "object";
    _receiver: JsonEventObjectReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _key?: string;

    _save: boolean;
    _saveKey: boolean;
    _saveValue: boolean;
    _object: JsonObject;
  };
  export type _Array<Opt extends JsonOption> = {
    _type: "array";
    _receiver: JsonEventArrayReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _index: number;

    _save: boolean;
    _array: JsonArray;
  };
  export type _Struct<Opt extends JsonOption> = _Object<Opt> | _Array<Opt>;

  export type _State<Opt extends JsonOption> =
    | _Unknown<Opt>
    | _StateLess<Opt>
    | _Number<Opt>
    | _String<Opt>
    | _Struct<Opt>;
}

/**
 * Input tokens and emit events
 */
export interface JsonEventEmitter<Opt extends JsonOption = JsonOption> {
  feed: (token: JsonToken<Opt>) => void;
}
export const createJsonEventEmitter = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>
): JsonEventEmitter<Opt> => {
  const _state: EventState._State<JsonOption>[] = [
    { _receiver: receiver as JsonEventReceiver<JsonOption> },
  ];

  function _throw(msg: string): never {
    throw new JsonEventParserError(`JsonEventParser Error - ${msg}`);
  }

  const _endValue = (value: JsonValue): void => {
    _state.pop()!._receiver.end?.();
    if (_state.length !== 0) {
      (_state[_state.length - 1] as EventState._Struct<JsonOption>)._child =
        value;
    }
  };
  const _needSave = () => {
    return (
      _state.length >= 2 &&
      (_state[_state.length - 2] as EventState._Struct<JsonOption>)._saveChild
    );
  };

  const _feedStateless = (
    token: AllJsonToken & { type: "true" | "false" | "null" }
  ) => {
    const state = _state[
      _state.length - 1
    ] as EventState._StateLess<JsonOption>;
    if (state._type === undefined) {
      state._type = token.type;
      state._receiver.start?.();
    }
    (state._receiver as any).feed?.(token);
    if (token.done) {
      if (token.type === "null") {
        (state._receiver as any).save?.(null);
        return _endValue(null);
      } else if (token.type === "true") {
        (state._receiver as any).save?.(true);
        return _endValue(true);
      } else if (token.type === "false") {
        (state._receiver as any).save?.(false);
        return _endValue(false);
      }
    }
  };
  const _feedNumber = (token: AllJsonToken & { type: "number" }) => {
    const state = _state[_state.length - 1] as EventState._Number<JsonOption>;
    if (state._type === undefined) {
      state._type = "number";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    state._list.push(token.character);
  };
  const _feedString = (token: AllJsonToken & { type: "string" }) => {
    const state = _state[_state.length - 1] as EventState._String<JsonOption>;
    if (state._type === undefined) {
      state._type = "string";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.subtype === "normal") {
      state._receiver.append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (
      token.subtype === "escape" ||
      token.subtype === "unicode" ||
      token.subtype === "escape_hex"
    ) {
      if (token.escaped_value !== undefined) {
        state._receiver.append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    } else if (token.subtype === "end") {
      state._receiver.end?.();
      const str = state._list.join("");
      state._receiver.save?.(str);
      _endValue(str);
    }
  };
  const _feedIdentifier = (token: AllJsonToken & { type: "identifier" }) => {
    const state = _state[_state.length - 1] as EventState._String<JsonOption>;
    if (state._type === undefined) {
      state._type = "string";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
      state._isIdentifier = true;

      state._receiver.feed?.({
        location: "key",
        type: "string",
        subtype: "start",
        character: '"',
      });
    }
    if (token.subtype === "normal") {
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: "normal",
          character: token.character,
        });
      state._receiver.append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (token.subtype === "escape_start") {
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: token.index === 0 ? "escape_start" : "unicode_start",
          character: token.character,
        });
    } else {
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: "unicode",
          index: token.index as any,
          escaped_value: token.escaped_value as any,
          character: token.character,
        });
      if (token.escaped_value !== undefined) {
        state._receiver.append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    }
  };
  const _feedObject = (token: AllJsonToken & { type: "object" }) => {
    let state = _state[_state.length - 1] as EventState._Object<JsonOption>;
    if (token.subtype === "empty_next") {
      _state.pop();
      return;
    }

    if (state._type === undefined) {
      if (token.subtype === "end") {
        _state.pop();
        state = _state[_state.length - 1] as EventState._Object<JsonOption>;
      } else {
        state._type = "object";
        state._save = _needSave() || state._receiver.save !== undefined;
        state._saveValue = state._save || state._receiver.set !== undefined;
        state._saveKey =
          state._saveValue || state._receiver.subscribeList !== undefined;

        state._object = {};
        state._saveChild = state._saveKey;

        state._receiver.start?.();
        state._receiver.feed?.(token);
        _state.push({
          _type: undefined,
          _receiver: state._receiver.keyReceiver ?? { type: "any" },
        });
        return;
      }
    }
    state._receiver.feed?.(token);
    if (token.subtype === "start") return;
    if (token.subtype === "end") {
      if (state._key !== undefined) {
        // trailing comma
        if (state._save) state._object[state._key] = state._child!;
        state._receiver.set?.(state._key, state._child!);
      }
      state._receiver.save?.(state._object);
      return _endValue(state._object);
    }
    if (token.subtype === "next") {
      if (state._save) state._object[state._key!] = state._child!;
      state._receiver.set?.(state._key!, state._child!);

      state._saveChild = state._saveKey;
      state._key = state._child = undefined;
      _state.push({
        _type: undefined,
        _receiver: state._receiver.keyReceiver ?? { type: "any" },
      });
      return;
    }
    /* if (token.subtype === "value_start") */ {
      state._saveChild = state._saveValue;
      state._key = state._child as string | undefined;
      let receiver: JsonEventReceiver<JsonOption> | undefined = undefined;
      if (state._receiver.subscribeList !== undefined) {
        for (const func of state._receiver.subscribeList) {
          receiver = func(state._key!);
          if (receiver !== undefined) break;
        }
      }
      _state.push({
        _type: undefined,
        _receiver: receiver ?? { type: "any" },
      });
    }
  };
  const _feedArray = (token: AllJsonToken & { type: "array" }): void => {
    let state = _state[_state.length - 1] as EventState._Array<JsonOption>;
    if (token.subtype === "empty_next") {
      _state.pop();
      state = _state[_state.length - 1] as EventState._Array<JsonOption>;
      state._receiver.next?.(state._index + 1);
      return;
    }

    if (state._type === undefined) {
      if (token.subtype === "end") {
        // trailing comma
        _state.pop();
        state = _state[_state.length - 1] as EventState._Array<JsonOption>;
      } else {
        state._type = "array";
        state._save = _needSave() || state._receiver.save !== undefined;
        state._saveChild = state._save || state._receiver.set !== undefined;
        state._index = 0;
        state._array = [];

        state._receiver.start?.();
        state._receiver.feed?.(token);

        let receiver: JsonEventReceiver<JsonOption> | undefined;
        if (state._receiver.subscribeList !== undefined)
          for (const func of state._receiver.subscribeList) {
            receiver = func(state._index);
            if (receiver === undefined) break;
          }
        _state.push({
          _type: undefined,
          _receiver: receiver ?? { type: "any" },
        });
        return;
      }
    }
    state._receiver.feed?.(token);
    if (token.subtype === "start") return;
    if (token.subtype === "end") {
      if (state._child !== undefined) {
        if (state._save) state._array[state._index] = state._child!; // trailing comma
        state._receiver.set?.(state._index, state._child!);
      }
      state._receiver.save?.(state._array);
      return _endValue(state._array);
    }

    /* if(token.subtype === 'next') */ {
      state._receiver.next?.(state._index + 1);
      if (state._save) state._array[state._index] = state._child!;
      state._receiver.set?.(state._index, state._child!);
      state._child = undefined;
      ++state._index;

      let receiver: JsonEventReceiver<JsonOption> | undefined = undefined;
      if (state._receiver.subscribeList !== undefined)
        for (const func of state._receiver.subscribeList) {
          receiver = func(state._index);
          if (receiver !== undefined) break;
        }
      _state.push({
        _type: undefined,
        _receiver: receiver ?? { type: "any" },
      });
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = _state[_state.length - 1];
      if (state === undefined) return;
      if (state._type === "number" && token.type !== "number") {
        const str = (state as EventState._Number<JsonOption>)._list.join("");
        let radix: number | undefined = undefined;
        if (str[0] === "0")
          /* compatible with JSON5 */
          switch (str[1]) {
            case "x":
            case "X":
              radix = 16;
              break;
            case "o":
            case "O":
              radix = 8;
              break;
            case "b":
            case "B":
              radix = 2;
              break;
          }
        const val = radix ? parseInt(str.slice(2), radix) : parseFloat(str);
        (state as EventState._Number<JsonOption>)._receiver.save?.(val);
        _endValue(val);
        state = _state[_state.length - 1];
      } else if (
        state._type === "string" &&
        (state as EventState._String<JsonOption>)._isIdentifier &&
        token.type !== "identifier"
      ) {
        (state._receiver as any).feed?.({
          location: "key",
          type: "string",
          subtype: "end",
          character: '"',
        });
        state._receiver.end?.();
        const str = (state as EventState._String<JsonOption>)._list.join("");
        (state as EventState._String<JsonOption>)._receiver.save?.(str);
        _endValue(str);
        state = _state[_state.length - 1];
      } else if (state._type === undefined)
        if ((token as any).subtype === "end") {
          // trailing comma
          if (token.type === "array") {
            _state.pop();
            state = _state[_state.length - 1];
          } else if (token.type === "object") {
            _state.pop();
            state = _state[_state.length - 1];
          }
        }
      if (
        token.type === "whitespace" ||
        token.type === "comment" ||
        token.type === "eof"
      )
        return;

      const tokenCastType =
        token.type === "true" || token.type === "false"
          ? "boolean"
          : token.type === "identifier"
          ? "string"
          : token.type;
      if (state._type === undefined && state._receiver.type === "any") {
        const anyReceiver = state._receiver;
        const subReceiver: JsonEventReceiver<JsonOption> | undefined =
          anyReceiver.dict?.[tokenCastType];
        if (subReceiver === undefined) {
          state._receiver = { ...anyReceiver, type: tokenCastType };
        } else {
          const newReceiver = { ...subReceiver };
          if (newReceiver.start === undefined)
            newReceiver.start = anyReceiver.start;
          if (newReceiver.feed === undefined)
            newReceiver.feed = anyReceiver.feed;
          if (newReceiver.end === undefined) newReceiver.end = anyReceiver.end;
          if (newReceiver.save === undefined)
            newReceiver.save = anyReceiver.save;
          state._receiver = newReceiver;
        }
      }
      if (tokenCastType !== state._receiver.type)
        _throw(`expected ${state._receiver.type} but got ${token.type}`);

      switch (token.type) {
        case "null":
        case "true":
        case "false":
          return _feedStateless(token);

        case "number":
          return _feedNumber(token);
        case "string":
          return _feedString(token);
        case "identifier":
          return _feedIdentifier(token);

        case "object":
          return _feedObject(token);
        case "array":
          return _feedArray(token);
      }
    },
  };
};

export const jsonEventEmit = <Opt extends JsonOption = JsonOption>(
  tokens: Iterable<JsonToken<Opt>>,
  receiver: JsonEventReceiver<Opt>
) => {
  const emitter = createJsonEventEmitter(receiver);
  for (const token of tokens) emitter.feed(token);
};

/**
 * Input JSON string and emit events (equivalent to combine `JsonStreamParser` and `JsonEventEmiiter`)
 */
export interface JsonEventParser {
  feed: (s: string) => void;
  end: () => void;

  get position(): number;
  get line(): number;
  get column(): number;
}
export const createJsonEventParser = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>,
  option?: Opt
): JsonEventParser => {
  const _parser = createJsonStreamParser(option);
  const _emitter = createJsonEventEmitter(receiver);
  const _token = {};
  return {
    feed(s: string) {
      for (const c of s) _emitter.feed(_parser.feedOneTo(_token, c));
    },
    end() {
      _emitter.feed(_parser.end());
    },
    get position() {
      return _parser.position;
    },
    get line() {
      return _parser.line;
    },
    get column() {
      return _parser.column;
    },
  };
};

export const jsonEventParse = <Opt extends JsonOption = JsonOption>(
  str: Iterable<string>,
  receiver: JsonEventReceiver<Opt>,
  option?: Opt
) => {
  const parser = createJsonEventParser(receiver, option);
  if (typeof str === "string") parser.feed(str);
  else for (const s of str) parser.feed(s);
  parser.end();
};
