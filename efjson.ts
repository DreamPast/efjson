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

/* some polyfill for ES5 */
/*
const repeatString: (s: string, n: number) => string =
  typeof (String.prototype as any).repeat === "function"
    ? (s, n) => (s as any).repeat(n)
    : (s, n) => {
        let r: string = "";
        for (n = n | 0; n > 0; n >>= 1) {
          if (n & 1) r += s;
          if (n > 1) s += s;
        }
        return r;
      };
const stringIncludes: (src: string, dst: string) => boolean =
  typeof (String.prototype as any).includes === "function"
    ? (src, dst) => (src as any).includes(dst)
    : (src, dst) => {
        for (let i = -1; ++i < src.length && src[i] === dst[0]; ) {
          let j = 0;
          while (j < dst.length && src[i + j] === dst[j]) ++j;
          if (j === dst.length) return true;
        }
        return false;
      };
*/
const repeatString = (s: string, n: number) => s.repeat(n);
const stringIncludes = (src: string, dst: string) => src.includes(dst);

const EOF = "\u0000";
const EXTRA_WHITESPACE =
  /* <VT>, <FF>, <NBSP>, <BOM>, <USP> */
  "\u000B\u000C\u00A0\uFEFF\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000";
const isWhitespace = (c: string, fitJson5?: boolean) => {
  /* <SP>, <TAB>, <LF>, <CR> */
  if (stringIncludes(" \t\n\r", c)) return true;
  return fitJson5 && stringIncludes(EXTRA_WHITESPACE, c);
};
const isNextLine = (c: string) => stringIncludes("\n\u2028\u2029\r", c);
const isNumberSeparator = (c: string, fitJson5?: boolean) =>
  isWhitespace(c, fitJson5) || stringIncludes("\0,]}/", c);
const isControl = (c: string) => c >= "\x00" && c <= "\x1F";
const isHex = (c: string) =>
  (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

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
  const code = c.charCodeAt(0);
  if (code === 0) return "EOF";
  if (code >= 0x20 && code < 0x7f) return `'${c}'`;
  const str = code.toString(16);
  return `\\u${repeatString("0", 4 - str.length)}${str}`;
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
}

const enum LocateState {
  ROOT_START,
  ROOT_END,
  KEY_FIRST_START, // used to check trailling comma
  KEY_START,
  KEY_END,
  VALUE_START,
  VALUE_END,
  ELEMENT_FIRST_START, // used to check trailling comma
  ELEMENT_START,
  ELEMENT_END,
}

// TODO: compatible with JSON5
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
  // acceptIdentifierKey?: boolean;

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
export const JSON5_OPTION: JsonOption = {
  // << white space >>
  acceptJson5Whitespace: true,

  // << array >>
  acceptTrailingCommaInArray: true,

  // << object >>
  acceptTrailingCommaInObject: true,
  // acceptIdentifierKey: true,

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
};

namespace TokenInfo {
  type _Whitespace = { type: "whitespace" };
  type _Null = { type: "null" } & (
    | { index: 0 | 1 | 2; done?: undefined }
    | { index: 3; done: true }
  );
  type _True = { type: "true" } & (
    | { index: 0 | 1 | 2; done?: undefined }
    | { index: 3; done: true }
  );
  type _False = { type: "false" } & (
    | { index: 0 | 1 | 2 | 3; done?: undefined }
    | { index: 4; done: true }
  );

  /* JSON5 */
  type _Comment = { type: "comment" } & {
    subtype: "may_start" | "single_line" | "multi_line" | "multi_line_end";
  };

  type _StringStartEnd = { subtype: "start" | "end" };
  type _StringNormal = { subtype: "normal" };
  /* JSON5 */
  type _StringNextLine = { subtype: "next_line" };
  type _StringEscape2Start = {
    subtype: "escape_start" | "unicode_start";
  };
  /* JSON5 */
  type _StringEscapeHexStart = {
    subtype: "escape_hex_start";
  };
  type _StringEscape = { subtype: "escape" } & {
    escaped_value: '"' | "\\" | "/" | "\b" | "\f" | "\n" | "\r" | "\t";
  };
  /* JSON5 */
  type _StringJson5Escape = { subtype: "escape" } & {
    escaped_value: "\v" | "\0" | "'";
  };
  type _StringUnicode = { subtype: "unicode" } & (
    | { index: 0 | 1 | 2; escaped_value?: undefined }
    | { index: 3; escaped_value: string }
  );
  /* JSON5 */
  type _StringEscapeHex = { subtype: "escape_hex" } & (
    | { index: 0; escaped_value?: undefined }
    | { index: 1; escaped_value: string }
  );

  type _String = { type: "string" } & (
    | _StringStartEnd
    | _StringNextLine
    | _StringNormal
    | _StringEscape2Start
    | _StringEscapeHexStart
    | _StringEscape
    | _StringJson5Escape
    | _StringUnicode
    | _StringEscapeHex
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
  /* JSON5 */
  type _NumberInfinity = {
    subtype: "infinity";
  } & (
    | {
        index: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        done?: undefined;
      }
    | { index: 7; done: true }
  );
  /* JSON5 */
  type _NumberNan = {
    subtype: "nan";
  } & ({ index: 0 | 1; done?: undefined } | { index: 2; done: true });
  /* JSON5 */
  type _NumberNotDecimalStart = {
    subtype: "hex_start" | "oct_start" | "bin_start";
  };
  /* JSON5 */
  type _NumberNotDecimal = {
    subtype: "hex" | "oct" | "bin";
  };
  type _Number = { type: "number" } & (
    | _NumberSign
    | _NumberDigit
    | _NumberStart
    | _NumberInfinity
    | _NumberNan
    | _NumberNotDecimalStart
    | _NumberNotDecimal
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

  export type JsonTokenInfo =
    | ({ location: _NotKeyLocation | "key" } & (_Whitespace | _Comment))
    | { location: "root"; type: "eof" }
    | ({ location: _NotKeyLocation } & _NotKey)
    | ({ location: "key" } & _String)
    | { location: "object"; type: "object"; subtype: "value_start" | "next" }
    | { location: "array"; type: "array"; subtype: "next" };
}
export type JsonToken = TokenInfo.JsonTokenInfo & { character: string };

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
const LOCATION_NOT_KEY_TABLE = LOCATION_TABLE as (
  | "root"
  | "value"
  | "element"
)[];

const NEXT_STATE_TABLE: (LocateState | undefined)[] = [];
NEXT_STATE_TABLE[LocateState.ROOT_START] = LocateState.ROOT_END;
NEXT_STATE_TABLE[LocateState.KEY_START] = LocateState.KEY_END;
NEXT_STATE_TABLE[LocateState.KEY_FIRST_START] = LocateState.KEY_END;
NEXT_STATE_TABLE[LocateState.VALUE_START] = LocateState.VALUE_END;
NEXT_STATE_TABLE[LocateState.ELEMENT_FIRST_START] = LocateState.ELEMENT_END;
NEXT_STATE_TABLE[LocateState.ELEMENT_START] = LocateState.ELEMENT_END;

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

export class JsonStreamParser {
  private readonly _option: JsonOption;

  private _position = 0;
  private _line = 1;
  private _column = 1;
  private _meetCr = false;

  /**
   * The state of the location
   * - at the start/end of the root node
   * - at the start/end of an object's key or value
   * - at the start/end of an array's element
   */
  private _location = LocateState.ROOT_START;
  /**
   * The state of the value
   * - parse empty
   * - parse null
   * - parse boolean
   * - parse string
   */
  private _state = ValueState.EMPTY;
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
   */
  private _substate: any;
  /**
   * Additional primary value substate (see following)
   *
   * possible_values:
   *  `STRING`|`STRING_ESCAPE`|`STRING_UNICODE`: [string] the character starting the string
   */
  private _substate2: any;

  private _stack: LocateState[] = [];

  private _throw(msg?: string): never {
    throw new JsonStreamParserError(
      `JsonParser Error at (${this._position})${this._line}:${this._column} - ${msg}`
    );
  }

  private _nextState(stat: LocateState) {
    const next = NEXT_STATE_TABLE[stat];
    if (next === undefined) this._throw("unexpected end");
    return next;
  }
  private _handleComma(): TokenInfo.JsonTokenInfo {
    if (this._location === LocateState.VALUE_END) {
      this._location = LocateState.KEY_START;
      return { location: "object", type: "object", subtype: "next" };
    } else if (this._location === LocateState.ELEMENT_END) {
      this._location = LocateState.ELEMENT_START;
      return { location: "array", type: "array", subtype: "next" };
    }
    if (this._location === LocateState.KEY_FIRST_START)
      this._throw("extra commas not allowed in object");
    if (this._location === LocateState.ELEMENT_FIRST_START)
      this._throw("extra commas not allowed in array");
    if (this._location === LocateState.VALUE_START)
      this._throw("unpexted empty value");
    this._throw("unexpected comma");
  }
  private _handleArrayEnd(): TokenInfo.JsonTokenInfo {
    if (
      this._location === LocateState.ELEMENT_FIRST_START ||
      this._location === LocateState.ELEMENT_END ||
      (this._location === LocateState.ELEMENT_START &&
        this._option.acceptTrailingCommaInArray)
    ) {
      this._state = ValueState.EMPTY;
      this._location = this._nextState(this._stack.pop()!);
      return {
        location: LOCATION_NOT_KEY_TABLE[this._location],
        type: "array",
        subtype: "end",
      };
    }

    if (this._location === LocateState.ELEMENT_START) {
      this._throw("extra commas not allowed in array");
    }
    this._throw("bad closing bracket");
  }
  private _handleObjectEnd(): TokenInfo.JsonTokenInfo {
    if (
      this._location === LocateState.KEY_FIRST_START ||
      this._location === LocateState.VALUE_END ||
      (this._location === LocateState.KEY_START &&
        this._option.acceptTrailingCommaInObject)
    ) {
      this._state = ValueState.EMPTY;
      this._location = this._nextState(this._stack.pop()!);
      return {
        location: LOCATION_NOT_KEY_TABLE[this._location],
        type: "object",
        subtype: "end",
      };
    }

    if (this._location === LocateState.KEY_START) {
      this._throw("extra commas not allowed in object");
    }
    this._throw("bad closing curly brace");
  }
  private _handleEOF(): TokenInfo.JsonTokenInfo {
    switch (this._location) {
      case LocateState.ROOT_START:
      case LocateState.ROOT_END:
        return { location: "root", type: "eof" };
      case LocateState.KEY_FIRST_START:
      case LocateState.KEY_START:
      case LocateState.KEY_END:
      case LocateState.VALUE_START:
      case LocateState.VALUE_END:
        this._throw("unexpected EOF while parsing object");

      case LocateState.ELEMENT_FIRST_START:
      case LocateState.ELEMENT_START:
      case LocateState.ELEMENT_END:
        this._throw("unexpected EOF while parsing array");
    }
  }
  private _handleSlash(): TokenInfo.JsonTokenInfo {
    if (
      this._option.acceptSingleLineComment ||
      this._option.accpetMultiLineComment
    ) {
      this._state = ValueState.COMMENT_MAY_START;
      return {
        location: LOCATION_TABLE[this._location],
        type: "comment",
        subtype: "may_start",
      };
    }
    this._throw("comment not allowed");
  }
  private _handleNumberSeparator(c: string): TokenInfo.JsonTokenInfo {
    if (this._substate === -1)
      this._throw("a number cannot consist of only a negative sign");
    this._state = ValueState.EMPTY;
    this._location = this._nextState(this._location);
    if (c === EOF) return this._handleEOF();
    if (c === "}") return this._handleObjectEnd();
    if (c === "]") return this._handleArrayEnd();
    if (c === ",") return this._handleComma();
    if (c === "/") return this._handleSlash();
    return {
      location: LOCATION_TABLE[this._location],
      type: "whitespace",
    };
  }
  private _handleLiteral(
    c: string,
    literal: string,
    nextState: ValueState
  ): TokenInfo.JsonTokenInfo {
    const dc = literal[this._substate];
    if (c === dc) {
      if (++this._substate === literal.length) {
        this._state = nextState;
        this._location = this._nextState(this._location);
        return {
          location: LOCATION_NOT_KEY_TABLE[this._location],
          type: literal as any,
          index: (this._substate - 1) as any,
          done: true,
        };
      }
      return {
        location: LOCATION_NOT_KEY_TABLE[this._location],
        type: literal as any,
        index: (this._substate - 1) as any,
      };
    }
    this._throw(
      `expected '${dc}' while parsing ${literal}, but got ${formatChar(c)}`
    );
  }

  private _step(c: string): TokenInfo.JsonTokenInfo {
    switch (this._state) {
      case ValueState.EMPTY:
        if (isWhitespace(c, this._option.acceptJson5Whitespace)) {
          return {
            location: LOCATION_TABLE[this._location],
            type: "whitespace",
          };
        }
        if (c === EOF) return this._handleEOF();
        if (c === "/") return this._handleSlash();
        if (this._location === LocateState.ROOT_END) {
          this._throw(
            `unexpected non-whitespace character ${formatChar(c)} after JSON`
          );
        }

        // string
        if (c === '"' || (c === "'" && this._option.acceptSingleQuote)) {
          this._state = ValueState.STRING;
          this._substate2 = c;
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "start",
          };
        }
        if (c === "'") this._throw("single quote not allowed");
        if (
          c !== "}" &&
          (this._location === LocateState.KEY_FIRST_START ||
            this._location === LocateState.KEY_START)
        ) {
          this._throw("property name must be a string");
        }

        if (c === ":") {
          if (this._location === LocateState.KEY_END) {
            this._location = LocateState.VALUE_START;
            this._state = ValueState.EMPTY;
            return {
              location: "object",
              type: "object",
              subtype: "value_start",
            };
          }
          if (this._location === LocateState.VALUE_START) {
            this._throw("unexpected repeated colon");
          }
          if (this._location === LocateState.ELEMENT_END) {
            this._throw("unexpected colon in array");
          }
          this._throw("unexpected colon");
        }
        if (this._location === LocateState.KEY_END) {
          this._throw("missing colon between key and value");
        }

        switch (c) {
          case "[": {
            const oldLocation = this._location;
            this._stack.push(oldLocation);
            this._location = LocateState.ELEMENT_FIRST_START;
            this._state = ValueState.EMPTY;
            return {
              location: LOCATION_NOT_KEY_TABLE[oldLocation],
              type: "array",
              subtype: "start",
            };
          }
          case "]":
            return this._handleArrayEnd();

          case "{": {
            const oldLocation = this._location;
            this._stack.push(oldLocation);
            this._location = LocateState.KEY_FIRST_START;
            this._state = ValueState.EMPTY;
            return {
              location: LOCATION_NOT_KEY_TABLE[oldLocation],
              type: "array",
              subtype: "start",
            };
          }
          case "}":
            return this._handleObjectEnd();

          case ",":
            return this._handleComma();

          case "+":
            if (!this._option.acceptPositiveSign)
              this._throw("unexpected '+' sign");
          // fallthrough
          case "-":
            this._state = ValueState.NUMBER;
            this._substate = -1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "number",
              subtype: "integer_sign",
            };
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
            this._state = ValueState.NUMBER;
            this._substate = c === "0" ? 0 : 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "number",
              subtype: "integer_digit",
            };
          case ".":
            if (this._option.acceptEmptyInteger) {
              this._state = ValueState.NUMBER_FRACTION;
              this._substate = false;
              return {
                location: LOCATION_NOT_KEY_TABLE[this._location],
                type: "number",
                subtype: "fraction_start",
              };
            }
            this._throw("unexpected '.' before number");
          case "N":
            if (this._option.acceptNan) {
              this._state = ValueState.NUMBER_NAN;
              this._substate = 1;
              return {
                location: LOCATION_NOT_KEY_TABLE[this._location],
                type: "number",
                subtype: "nan",
                index: 0,
              };
            }
          case "I":
            if (this._option.acceptInfinity) {
              this._state = ValueState.NUMBER_INFINITY;
              this._substate = 1;
              return {
                location: LOCATION_NOT_KEY_TABLE[this._location],
                type: "number",
                subtype: "infinity",
                index: 0,
              };
            }

          case "n":
            this._state = ValueState.NULL;
            this._substate = 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "null",
              index: 0,
            };
          case "t":
            this._state = ValueState.TRUE;
            this._substate = 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "true",
              index: 0,
            };
          case "f":
            this._state = ValueState.FALSE;
            this._substate = 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "false",
              index: 0,
            };
          case "u":
            this._throw(`"undefined" is not a valid JSON value`);
        }
        this._throw(`unexpected ${formatChar(c)}`);

      case ValueState.NULL:
        return this._handleLiteral(c, "null", ValueState.EMPTY);
      case ValueState.TRUE:
        return this._handleLiteral(c, "true", ValueState.EMPTY);
      case ValueState.FALSE:
        return this._handleLiteral(c, "false", ValueState.EMPTY);
      case ValueState.NUMBER_INFINITY:
        return this._handleLiteral(c, "Infinity", ValueState.EMPTY);
      case ValueState.NUMBER_NAN:
        return this._handleLiteral(c, "NaN", ValueState.EMPTY);

      case ValueState.STRING_MULTILINE_CR:
        if (c === "\n") {
          this._state = ValueState.STRING;
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "next_line",
          };
        }
      // fallthrough
      case ValueState.STRING:
        if (c === this._substate2) {
          const oldLocation = this._location;
          this._location = this._nextState(oldLocation);
          this._state = ValueState.EMPTY;
          return {
            location: LOCATION_TABLE[oldLocation],
            type: "string",
            subtype: "end",
          };
        }
        if (c === "\\") {
          this._state = ValueState.STRING_ESCAPE;
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "escape_start",
          };
        }
        if (c === EOF) this._throw("unexpected EOF while parsing string");
        if (isControl(c))
          this._throw(`unexpected control character ${formatChar(c)}`);
        return {
          location: LOCATION_TABLE[this._location],
          type: "string",
          subtype: "normal",
        };
      case ValueState.STRING_ESCAPE:
        if (c === "u") {
          this._state = ValueState.STRING_UNICODE;
          this._substate = "";
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "unicode_start",
          };
        }
        const dc = ESCAPE_TABLE[c];
        if (dc !== undefined) {
          this._state = ValueState.STRING;
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "escape",
            escaped_value: dc as any,
          };
        }
        if (this._option.acceptMultilineString && isNextLine(c)) {
          this._state =
            c === "\r" ? ValueState.STRING_MULTILINE_CR : ValueState.STRING;
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "next_line",
          };
        }
        if (this._option.accpetJson5StringEscape) {
          const dc = ESCAPE_TABLE2[c];
          if (dc !== undefined) {
            this._state = ValueState.STRING;
            return {
              location: LOCATION_TABLE[this._location],
              type: "string",
              subtype: "escape",
              escaped_value: dc as any,
            };
          } else if (c === "x") {
            this._state = ValueState.STRING_ESCAPE_HEX;
            this._substate = "";
            return {
              location: LOCATION_TABLE[this._location],
              type: "string",
              subtype: "escape_hex_start",
            };
          }
        }
        this._throw(`bad escaped character ${formatChar(c)}`);
      case ValueState.STRING_UNICODE:
        if (isHex(c)) {
          this._substate += c;
          if (this._substate.length === 4) {
            this._state = ValueState.STRING;
            return {
              location: LOCATION_TABLE[this._location],
              type: "string",
              subtype: "unicode",
              index: 3,
              escaped_value: String.fromCharCode(parseInt(this._substate, 16)),
            };
          }
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "unicode",
            index: (this._substate.length - 1) as 1 | 2,
          };
        }
        this._throw(`bad Unicode escape character ${formatChar(c)}`);
      case ValueState.STRING_ESCAPE_HEX:
        if (isHex(c)) {
          this._substate += c;
          if (this._substate.length === 2) {
            this._state = ValueState.STRING;
            return {
              location: LOCATION_TABLE[this._location],
              type: "string",
              subtype: "escape_hex",
              index: 1,
              escaped_value: String.fromCharCode(parseInt(this._substate, 16)),
            };
          }
          return {
            location: LOCATION_TABLE[this._location],
            type: "string",
            subtype: "escape_hex",
            index: 0,
          };
        }
        this._throw(`bad Hex escape character ${formatChar(c)}`);

      case ValueState.NUMBER:
        if (c === "0") {
          if (this._substate === 0) this._throw("leading zero not allowed");
          if (this._substate === -1) this._substate = 0;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "integer_digit",
          };
        }
        if (c >= "1" && c <= "9") {
          if (this._substate === 0) this._throw("leading zero not allowed");
          if (this._substate === -1) this._substate = 1;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "integer_digit",
          };
        }
        if (c === ".") {
          if (this._substate === -1 && !this._option.acceptEmptyInteger) {
            this._throw("unexpected '.' before number");
          }
          this._state = ValueState.NUMBER_FRACTION;
          this._substate = false;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "fraction_start",
          };
        }
        if (this._substate === -1) {
          if (this._option.acceptInfinity && c === "I") {
            // "-Infinity"
            this._state = ValueState.NUMBER_INFINITY;
            this._substate = 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "number",
              subtype: "infinity",
              index: 0,
            };
          }
          this._throw("the integer part cannnot be empty");
        }

        if (this._substate === 0) {
          const obj: any = {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
          };
          if (
            this._option.acceptHexadecimalInteger &&
            (c === "x" || c === "X")
          ) {
            obj.subtype = "hex_start";
            this._state = ValueState.NUMBER_HEX;
            this._substate = false;
            return obj;
          } else if (
            this._option.acceptOctalInteger &&
            (c === "o" || c === "O")
          ) {
            obj.subtype = "oct_start";
            this._state = ValueState.NUMBER_OCT;
            this._substate = false;
            return obj;
          } else if (
            this._option.acceptBinaryInteger &&
            (c === "b" || c === "B")
          ) {
            obj.subtype = "bin_start";
            this._state = ValueState.NUMBER_BIN;
            this._substate = false;
            return obj;
          }
        }

        if (c === "e" || c === "E") {
          this._state = ValueState.NUMBER_EXPONENT;
          this._substate = 0;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "exponent_start",
          };
        }
        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the integer part of the number`
        );
      case ValueState.NUMBER_FRACTION:
        if (c >= "0" && c <= "9") {
          this._substate = true;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "fraction_digit",
          };
        }
        if (this._substate === false && !this._option.acceptEmptyFraction) {
          this._throw("the fraction part cannot be empty");
        }

        if (c === "e" || c === "E") {
          this._state = ValueState.NUMBER_EXPONENT;
          this._substate = 0;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "exponent_start",
          };
        }
        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the fraction part of the number`
        );
      case ValueState.NUMBER_EXPONENT:
        if (c === "+" || c === "-") {
          if (this._substate === 0) {
            this._substate = 1;
            return {
              location: LOCATION_NOT_KEY_TABLE[this._location],
              type: "number",
              subtype: "exponent_sign",
            };
          } else if (this._substate === 1) {
            this._throw("unexpected repeated sign in exponent part");
          } else if (this._substate === 2) {
            this._throw(`unexpected sign ${c} in exponent part`);
          }
        }
        if (c >= "0" && c <= "9") {
          this._substate = 2;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "exponent_digit",
          };
        }
        if (this._substate === 0 || this._substate === 1) {
          this._throw("the exponent part cannot be empty");
        }

        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the exponent part of the number`
        );
      case ValueState.NUMBER_HEX:
        if (isHex(c)) {
          this._substate = true;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "hex",
          };
        }
        if (c === "e" || c === "E")
          this._throw("exponent not allowed in hexadecimal number");
        if (c === ".")
          this._throw("fraction not allowed in hexadecimal number");
        if (this._substate === false)
          this._throw("the hexadecimal integer part cannot be empty");
        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar} while parsing hexadecimal number`
        );

      case ValueState.NUMBER_OCT:
        if (c >= "0" && c <= "7") {
          this._substate = true;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "oct",
          };
        }
        if (c === "e" || c === "E")
          this._throw("exponent not allowed in octal number");
        if (c === ".") this._throw("fraction not allowed in octal number");
        if (this._substate === false)
          this._throw("the octal integer part cannot be empty");
        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar} while parsing octal number`
        );

      case ValueState.NUMBER_BIN:
        if (c === "0" || c === "1") {
          this._substate = true;
          return {
            location: LOCATION_NOT_KEY_TABLE[this._location],
            type: "number",
            subtype: "bin",
          };
        }
        if (c === "e" || c === "E")
          this._throw("exponent not allowed in binary number");
        if (c === ".") this._throw("fraction not allowed in binary number");
        if (this._substate === false)
          this._throw("the binary integer part cannot be empty");
        if (isNumberSeparator(c, this._option.acceptJson5Whitespace))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar} while parsing binary number`
        );

      case ValueState.COMMENT_MAY_START:
        if (this._option.acceptSingleLineComment && c === "/") {
          this._state = ValueState.SINGLE_LINE_COMMENT;
          return {
            location: LOCATION_TABLE[this._location],
            type: "comment",
            subtype: "single_line",
          };
        }
        if (this._option.accpetMultiLineComment && c === "*") {
          this._state = ValueState.MULTI_LINE_COMMENT;
          return {
            location: LOCATION_TABLE[this._location],
            type: "comment",
            subtype: "multi_line",
          };
        }
        this._throw("slash is not used for comment");
      case ValueState.SINGLE_LINE_COMMENT:
        if (isNextLine(c)) this._state = ValueState.EMPTY;
        return {
          location: LOCATION_TABLE[this._location],
          type: "comment",
          subtype: "single_line",
        };
      case ValueState.MULTI_LINE_COMMENT:
        if (c === "*") {
          this._state = ValueState.MULTI_LINE_COMMENT_MAY_END;
          return {
            location: LOCATION_TABLE[this._location],
            type: "comment",
            subtype: "multi_line",
          };
        }
        return {
          location: LOCATION_TABLE[this._location],
          type: "comment",
          subtype: "multi_line",
        };
      case ValueState.MULTI_LINE_COMMENT_MAY_END:
        if (c === "/") {
          this._state = ValueState.EMPTY;
          return {
            location: LOCATION_TABLE[this._location],
            type: "comment",
            subtype: "multi_line_end",
          };
        }
        if (c !== "*") this._state = ValueState.MULTI_LINE_COMMENT;
        return {
          location: LOCATION_TABLE[this._location],
          type: "comment",
          subtype: "multi_line",
        };
    }
  }
  private _checkNextLine(c: string) {
    if (this._meetCr) {
      if (c !== "\n") {
        ++this._line;
        this._column = 1;
      }
      this._meetCr = false;
    }
  }
  private _feed(c: string) {
    this._checkNextLine(c);
    const ret = this._step(c);
    ++this._position;
    if (isNextLine(c)) {
      if (c === "\r") {
        ++this._column;
        this._meetCr = true;
      } else {
        ++this._line;
        this._column = 1;
      }
    } else if (c !== EOF) ++this._column;
    return ret;
  }

  constructor(option: JsonOption = {}) {
    this._option = option;
  }
  feed(s: string): JsonToken[] {
    const ret: JsonToken[] = [];
    for (const c of s) {
      const info: any = this._feed(c);
      info.character = c;
      ret.push(info);
    }
    return ret;
  }
  end() {
    return this._feed(EOF);
  }

  get position() {
    return this._position;
  }
  get line() {
    return this._line;
  }
  get column() {
    return this._column;
  }
}

export function jsonStreamParse(s: string, option?: JsonOption) {
  const parser = new JsonStreamParser(option);
  const ret = parser.feed(s);
  parser.end();
  return ret;
}
export function* jsonStreamGenerator(s: Iterable<string>, option?: JsonOption) {
  const parser = new JsonStreamParser(option);
  for (const chunk of s) yield* parser.feed(chunk);
  yield parser.end();
}
