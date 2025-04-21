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
        for (let i = -1; ++i < src.length && src[i] == dst[0]; ) {
          let j = 0;
          while (j < dst.length && src[i + j] === dst[j]) ++j;
          if (j === dst.length) return true;
        }
        return false;
      };
*/
const repeatString = (s: string, n: number) => s.repeat(n);
const stringIncludes = (src: string, dst: string) => src.includes(dst);

const EXTRA_WHITESPACE =
  /* <VT>, <FF>, <NBSP>, <BOM>, <USP> */
  "\u000B\u000C\u00A0\uFEFF\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000";
const isWhitespace = (c: string, fitJson5?: boolean) => {
  /* <SP>, <TAB>, <LF>, <CR> */
  if (stringIncludes(" \t\n\r", c)) return true;
  return fitJson5 && stringIncludes(EXTRA_WHITESPACE, c);
};

const isNumberSeparator = (c: string, fitJson5?: boolean) =>
  c === EOF || isWhitespace(c, fitJson5) || c === "," || c === "]" || c === "}";
const isControl = (c: string) => {
  const code = c.charCodeAt(0);
  return code >= 0 && code <= 0x1f;
};

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
const EOF = "\u0000";

const formatChar = (c: string) => {
  const code = c.charCodeAt(0);
  if (code === 0) return "EOF";
  if (code < 0x7f && code > 0x20) return `'${c}'`;
  const str = code.toString(16);
  return `\\u${repeatString("0", 4 - str.length)}${str}`;
};

const enum VALUE_STATE {
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
}

const enum LOCATE_STATE {
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
  ACCEPT_JSON5_WHITESPACE?: boolean;

  // << array >>
  /**
   * whether to accept a single trailing comma in array
   * @example '[1,]', '[,]'
   */
  ACCEPT_TRAILING_COMMA_IN_ARRAY?: boolean;

  // << object >>
  /**
   * whether to accept a single trailing comma in object
   * @example '{"a":1,}', '{,}'
   */
  ACCEPT_TRAILING_COMMA_IN_OBJECT?: boolean;
  /**
   * whether to accept identifier key in object
   * @example '{a:1}'
   */
  // ACCEPT_IDENTIFIER_KEY_IN_OBJECT?: boolean;

  // << string >>
  /**
   * whether to accept single quote in string
   * @example "'a'"
   */
  // ACCEPT_SINGLE_QUOTE?: boolean;
  /**
   * whether to accept multi-line string
   * @example '"a\\\nb"'
   */
  // ACCEPT_MULTILINE_STRING?: boolean;
  /**
   * whether to accept JSON5 string escape
   * @example '"\\x01"'
   */
  // ACCEPT_JSON5_STRING_ESCAPE?: boolean;

  // << number >>
  /**
   * whether to accept positive sign in number
   * @example '+1', '+0'
   */
  ACCEPT_POSITIVE_SIGN?: boolean;
  /**
   * whether to accept empty fraction in number
   * @example '1.', '0.'
   */
  ACCEPT_EMPTY_FRACTION?: boolean;
  /**
   * whether to accept empty integer in number
   * @example '.1', '.0'
   */
  ACCEPT_EMPTY_INTEGER?: boolean;
  /**
   * whether to accept NaN
   */
  // ACCEPT_NAN?: boolean;
  /**
   * whether to accept Infinity
   */
  // ACCEPT_INFINITY?: boolean;
  /**
   * whether to accept hexadecimal integer
   * @example '0x1', '0x0'
   */
  // ACCEPT_HEXADECIMAL_INTEGER?: boolean;
  /**
   * whether to accept octal integer
   * @example '0o1', '0o0'
   */
  // ACCEPT_OCTAL_INTEGER?: boolean;
  /**
   * whether to accept binary integer
   * @example '0b1', '0b0'
   */
  // ACCEPT_BINARY_INTEGER?: boolean;
};

//

type WhitespaceToken = { type: "whitespace" };
type NullToken = { type: "null" } & (
  | { index: 0 | 1 | 2 }
  | { index: 3; done: true }
);
type TrueToken = { type: "true" } & (
  | { index: 0 | 1 | 2 }
  | { index: 3; done: true }
);
type FalseToken = { type: "false" } & (
  | { index: 0 | 1 | 2 | 3 }
  | { index: 4; done: true }
);

type StringStartEndSubtoken = { subtype: "start" | "end" };
type StringNormalSubtoken = { subtype: "normal" };
type StringEscape2StartSubtoken = {
  subtype: "escape_start" | "unicode_start";
};
type StringEscapeSubtoken = { subtype: "escape" } & {
  escaped_value: '"' | "\\" | "/" | "\b" | "\f" | "\n" | "\r" | "\t";
};
type StringUnicodeSubtoken = { subtype: "unicode" } & (
  | { index: 0 | 1 | 2 }
  | { index: 3; escaped_value: string }
);
type StringToken = { type: "string" } & (
  | StringStartEndSubtoken
  | StringNormalSubtoken
  | StringEscape2StartSubtoken
  | StringEscapeSubtoken
  | StringUnicodeSubtoken
);

type NumberSignSubtoken = {
  subtype: "integer_sign" | "exponent_sign";
};
type NumberDigitSubtoken = {
  subtype: "integer_digit" | "fraction_digit" | "exponent_digit";
};
type NumberStartSubtoken = {
  subtype: "fraction_start" | "exponent_start";
};
type NumberToken = { type: "number" } & (
  | NumberSignSubtoken
  | NumberDigitSubtoken
  | NumberStartSubtoken
);

type NotKey = "root" | "value" | "object" | "array" | "element";
type NotKeyToken =
  | StringToken
  | NullToken
  | TrueToken
  | FalseToken
  | NumberToken
  | { type: "object"; subtype: "start" | "end" }
  | { type: "array"; subtype: "start" | "end" };

export type JsonToken =
  | ({ location: NotKey | "key" } & WhitespaceToken)
  | { location: "root"; type: "eof" }
  | ({ location: NotKey } & NotKeyToken)
  | ({ location: "key" } & StringToken)
  | { location: "object"; type: "object"; subtype: "value_start" | "next" }
  | { location: "array"; type: "array"; subtype: "next" };

function wrapLocation(state: LOCATE_STATE) {
  switch (state) {
    case LOCATE_STATE.ROOT_START:
    case LOCATE_STATE.ROOT_END:
      return "root";
    case LOCATE_STATE.KEY_FIRST_START:
    case LOCATE_STATE.KEY_START:
    case LOCATE_STATE.KEY_END:
      return "key";
    case LOCATE_STATE.VALUE_START:
    case LOCATE_STATE.VALUE_END:
      return "value";
    case LOCATE_STATE.ELEMENT_FIRST_START:
    case LOCATE_STATE.ELEMENT_START:
    case LOCATE_STATE.ELEMENT_END:
      return "element";
  }
}
function wrapLocationNotKey(state: LOCATE_STATE) {
  switch (state) {
    case LOCATE_STATE.ROOT_START:
    case LOCATE_STATE.ROOT_END:
      return "root";
    case LOCATE_STATE.KEY_FIRST_START:
    case LOCATE_STATE.KEY_START:
    case LOCATE_STATE.KEY_END:
      throw TypeError("internal error: unexpected key state");
    case LOCATE_STATE.VALUE_START:
    case LOCATE_STATE.VALUE_END:
      return "value";
    case LOCATE_STATE.ELEMENT_FIRST_START:
    case LOCATE_STATE.ELEMENT_START:
    case LOCATE_STATE.ELEMENT_END:
      return "element";
  }
}

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
  private _position = 0;
  private _line = 1;
  private _column = 1;
  private _meetCr = false;

  option: JsonOption;

  /**
   * The state of the location
   * - at the start/end of the root node
   * - at the start/end of an object's key or value
   * - at the start/end of an array's element
   */
  private _location = LOCATE_STATE.ROOT_START;
  /**
   * The state of the value
   * - parse empty
   * - parse null
   * - parse boolean
   * - parse string
   */
  private _state = VALUE_STATE.EMPTY;
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
   */
  private _substate: any;

  private _stack: LOCATE_STATE[] = [];

  private _throw(msg?: string): never {
    throw new JsonStreamParserError(
      `JsonParser Error at (${this._position})${this._line}:${this._column} - ${msg}`
    );
  }

  private _nextState(stat: LOCATE_STATE) {
    switch (stat) {
      case LOCATE_STATE.ROOT_START:
        return LOCATE_STATE.ROOT_END;

      case LOCATE_STATE.KEY_START:
      case LOCATE_STATE.KEY_FIRST_START:
        return LOCATE_STATE.KEY_END;
      case LOCATE_STATE.VALUE_START:
        return LOCATE_STATE.VALUE_END;

      case LOCATE_STATE.ELEMENT_FIRST_START:
      case LOCATE_STATE.ELEMENT_START:
        return LOCATE_STATE.ELEMENT_END;

      default:
        this._throw("unexpected end");
    }
  }
  private _handleComma(): JsonToken {
    if (this._location === LOCATE_STATE.VALUE_END) {
      this._location = LOCATE_STATE.KEY_START;
      return { location: "object", type: "object", subtype: "next" };
    } else if (this._location === LOCATE_STATE.ELEMENT_END) {
      this._location = LOCATE_STATE.ELEMENT_START;
      return { location: "array", type: "array", subtype: "next" };
    }
    if (this._location === LOCATE_STATE.KEY_FIRST_START)
      this._throw("extra commas not allowed in object");
    if (this._location === LOCATE_STATE.ELEMENT_FIRST_START)
      this._throw("extra commas not allowed in array");
    if (this._location === LOCATE_STATE.VALUE_START)
      this._throw("unpexted empty value");
    this._throw("unexpected comma");
  }
  private _handleArrayEnd(): JsonToken {
    if (
      this._location === LOCATE_STATE.ELEMENT_FIRST_START ||
      this._location === LOCATE_STATE.ELEMENT_END ||
      (this._location === LOCATE_STATE.ELEMENT_START &&
        this.option.ACCEPT_TRAILING_COMMA_IN_ARRAY)
    ) {
      this._state = VALUE_STATE.EMPTY;
      this._location = this._nextState(this._stack.pop()!);
      return {
        location: wrapLocationNotKey(this._location),
        type: "array",
        subtype: "end",
      };
    }

    if (this._location === LOCATE_STATE.ELEMENT_START) {
      this._throw("extra commas not allowed in array");
    }
    this._throw("bad closing bracket");
  }
  private _handleObjectEnd(): JsonToken {
    if (
      this._location === LOCATE_STATE.KEY_FIRST_START ||
      this._location === LOCATE_STATE.VALUE_END ||
      (this._location === LOCATE_STATE.KEY_START &&
        this.option.ACCEPT_TRAILING_COMMA_IN_OBJECT)
    ) {
      this._state = VALUE_STATE.EMPTY;
      this._location = this._nextState(this._stack.pop()!);
      return {
        location: wrapLocationNotKey(this._location),
        type: "object",
        subtype: "end",
      };
    }

    if (this._location === LOCATE_STATE.KEY_START) {
      this._throw("extra commas not allowed in object");
    }
    this._throw("bad closing curly brace");
  }
  private _handleEOF(): JsonToken {
    switch (this._location) {
      case LOCATE_STATE.ROOT_START:
      case LOCATE_STATE.ROOT_END:
        return { location: "root", type: "eof" };
      case LOCATE_STATE.KEY_FIRST_START:
      case LOCATE_STATE.KEY_START:
      case LOCATE_STATE.KEY_END:
      case LOCATE_STATE.VALUE_START:
      case LOCATE_STATE.VALUE_END:
        this._throw("unexpected EOF while parsing object");

      case LOCATE_STATE.ELEMENT_FIRST_START:
      case LOCATE_STATE.ELEMENT_START:
      case LOCATE_STATE.ELEMENT_END:
        this._throw("unexpected EOF while parsing array");
    }
    this._throw("unexpected EOF");
  }
  private _handleNumberSeparator(c: string): JsonToken {
    if (this._substate === -1)
      this._throw("a number cannot consist of only a negative sign");
    this._state = VALUE_STATE.EMPTY;
    this._location = this._nextState(this._location);
    if (c === EOF) return this._handleEOF();
    if (c === "}") return this._handleObjectEnd();
    if (c === "]") return this._handleArrayEnd();
    if (c === ",") return this._handleComma();
    return {
      location: wrapLocation(this._location),
      type: "whitespace",
    };
  }

  private _step(c: string): JsonToken {
    switch (this._state) {
      case VALUE_STATE.EMPTY:
        if (isWhitespace(c, this.option.ACCEPT_JSON5_WHITESPACE)) {
          return {
            location: wrapLocation(this._location),
            type: "whitespace",
          };
        }
        if (c === EOF) return this._handleEOF();
        if (this._location === LOCATE_STATE.ROOT_END) {
          this._throw(
            `unexpected non-whitespace character ${formatChar(c)} after JSON`
          );
        }

        // string
        if (c === '"') {
          this._state = VALUE_STATE.STRING;
          return {
            location: wrapLocation(this._location),
            type: "string",
            subtype: "start",
          };
        }
        if (c === "'") {
          this._throw("single quote not allowed");
        }
        if (
          c !== "}" &&
          (this._location === LOCATE_STATE.KEY_FIRST_START ||
            this._location === LOCATE_STATE.KEY_START)
        ) {
          this._throw("property name must be a string");
        }

        if (c === ":") {
          if (this._location === LOCATE_STATE.KEY_END) {
            this._location = LOCATE_STATE.VALUE_START;
            this._state = VALUE_STATE.EMPTY;
            return {
              location: "object",
              type: "object",
              subtype: "value_start",
            };
          }
          if (this._location === LOCATE_STATE.VALUE_START) {
            this._throw("unexpected repeated colon");
          }
          if (this._location === LOCATE_STATE.ELEMENT_END) {
            this._throw("unexpected colon in array");
          }
          this._throw("unexpected colon");
        }
        if (this._location === LOCATE_STATE.KEY_END) {
          this._throw("missing colon between key and value");
        }

        switch (c) {
          case "[": {
            const oldLocation = this._location;
            this._stack.push(oldLocation);
            this._location = LOCATE_STATE.ELEMENT_FIRST_START;
            this._state = VALUE_STATE.EMPTY;
            return {
              location: wrapLocationNotKey(oldLocation),
              type: "array",
              subtype: "start",
            };
          }
          case "]":
            return this._handleArrayEnd();

          case "{": {
            const oldLocation = this._location;
            this._stack.push(oldLocation);
            this._location = LOCATE_STATE.KEY_FIRST_START;
            this._state = VALUE_STATE.EMPTY;
            return {
              location: wrapLocationNotKey(oldLocation),
              type: "array",
              subtype: "start",
            };
          }
          case "}":
            return this._handleObjectEnd();

          case ",":
            return this._handleComma();

          case "+":
            if (!this.option.ACCEPT_POSITIVE_SIGN)
              this._throw("unexpected '+' sign");
          // fallthrough
          case "-":
            this._state = VALUE_STATE.NUMBER;
            this._substate = -1;
            return {
              location: wrapLocationNotKey(this._location),
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
            this._state = VALUE_STATE.NUMBER;
            this._substate = c === "0" ? 0 : 1;
            return {
              location: wrapLocationNotKey(this._location),
              type: "number",
              subtype: "integer_digit",
            };
          case ".":
            if (this.option.ACCEPT_EMPTY_INTEGER) {
              this._state = VALUE_STATE.NUMBER_FRACTION;
              this._substate = false;
              return {
                location: wrapLocationNotKey(this._location),
                type: "number",
                subtype: "fraction_start",
              };
            }
            this._throw("unexpected '.' before number");

          case "n":
            this._state = VALUE_STATE.NULL;
            this._substate = 1;
            return {
              location: wrapLocationNotKey(this._location),
              type: "null",
              index: 0,
            };
          case "t":
            this._state = VALUE_STATE.TRUE;
            this._substate = 1;
            return {
              location: wrapLocationNotKey(this._location),
              type: "true",
              index: 0,
            };
          case "f":
            this._state = VALUE_STATE.FALSE;
            this._substate = 1;
            return {
              location: wrapLocationNotKey(this._location),
              type: "null",
              index: 0,
            };
          case "u":
            this._throw(`"undefined" is not a valid JSON value`);
        }
        this._throw(`unexpected ${formatChar(c)}`);

      case VALUE_STATE.NULL: {
        const dc = "null"[this._substate];
        if (c === dc) {
          if (++this._substate === 4) {
            this._state = VALUE_STATE.EMPTY;
            this._location = this._nextState(this._location);
            return {
              location: wrapLocationNotKey(this._location),
              type: "null",
              index: 3,
              done: true,
            };
          }
          return {
            location: wrapLocationNotKey(this._location),
            type: "null",
            index: (this._substate - 1) as 1 | 2,
          };
        }
        this._throw(
          `expected '${dc}' while parsing "null", but got ${formatChar(c)}`
        );
      }
      case VALUE_STATE.TRUE: {
        const dc = "true"[this._substate];
        if (c === dc) {
          if (++this._substate === 4) {
            this._state = VALUE_STATE.EMPTY;
            this._location = this._nextState(this._location);
            return {
              location: wrapLocationNotKey(this._location),
              type: "true",
              index: 3,
              done: true,
            };
          }
          return {
            location: wrapLocationNotKey(this._location),
            type: "true",
            index: (this._substate - 1) as 0 | 1 | 2,
          };
        }
        this._throw(
          `expected '${dc}' while parsing "true", but got ${formatChar(c)}`
        );
      }
      case VALUE_STATE.FALSE: {
        const dc = "false"[this._substate];
        if (c === dc) {
          if (++this._substate === 5) {
            this._state = VALUE_STATE.EMPTY;
            this._location = this._nextState(this._location);
            return {
              location: wrapLocationNotKey(this._location),
              type: "false",
              index: 4,
              done: true,
            };
          }
          return {
            location: wrapLocationNotKey(this._location),
            type: "false",
            index: (this._substate - 1) as 0 | 1 | 2 | 3,
          };
        }
        this._throw(
          `expected '${dc}' while parsing "false", but got ${formatChar(c)}`
        );
      }

      case VALUE_STATE.STRING:
        if (c === '"') {
          const oldLocation = this._location;
          this._location = this._nextState(oldLocation);
          this._state = VALUE_STATE.EMPTY;
          return {
            location: wrapLocation(oldLocation),
            type: "string",
            subtype: "end",
          };
        }
        if (c === "\\") {
          this._state = VALUE_STATE.STRING_ESCAPE;
          return {
            location: wrapLocation(this._location),
            type: "string",
            subtype: "escape_start",
          };
        }
        if (c === EOF) {
          this._throw("unexpected EOF while parsing string");
        }
        if (isControl(c)) {
          this._throw(`unexpected control character ${formatChar(c)}`);
        }
        return {
          location: wrapLocation(this._location),
          type: "string",
          subtype: "normal",
        };
      case VALUE_STATE.STRING_ESCAPE:
        if (c === "u") {
          this._state = VALUE_STATE.STRING_UNICODE;
          this._substate = "";
          return {
            location: wrapLocation(this._location),
            type: "string",
            subtype: "unicode_start",
          };
        }
        const dc = ESCAPE_TABLE[c];
        if (dc !== undefined) {
          this._state = VALUE_STATE.STRING;
          return {
            location: wrapLocation(this._location),
            type: "string",
            subtype: "escape",
            escaped_value: dc as any,
          };
        }
        this._throw(`bad escaped character ${formatChar(c)}`);
      case VALUE_STATE.STRING_UNICODE:
        if (
          (c >= "0" && c <= "9") ||
          (c >= "a" && c <= "f") ||
          (c >= "A" && c <= "F")
        ) {
          this._substate += c;
          if (this._substate.length === 4) {
            this._state = VALUE_STATE.STRING;
            return {
              location: wrapLocation(this._location),
              type: "string",
              subtype: "unicode",
              index: 3,
              escaped_value: String.fromCharCode(parseInt(this._substate, 16)),
            };
          }
          return {
            location: wrapLocation(this._location),
            type: "string",
            subtype: "unicode",
            index: (this._substate.length - 1) as 1 | 2,
          };
        }
        this._throw(`bad Unicode escape character ${formatChar(c)}`);

      case VALUE_STATE.NUMBER:
        if (c === "0") {
          if (this._substate === 0) this._throw("leading zero not allowed");
          if (this._substate === -1) this._substate = 0;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "integer_digit",
          };
        }
        if (c >= "1" && c <= "9") {
          if (this._substate === 0) this._throw("leading zero not allowed");
          if (this._substate === -1) this._substate = 1;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "integer_digit",
          };
        }
        if (c === ".") {
          if (this._substate === -1) {
            this._throw("unexpected '.' before number");
          }
          this._state = VALUE_STATE.NUMBER_FRACTION;
          this._substate = false;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "fraction_start",
          };
        }
        if (c === "e" || c === "E") {
          this._state = VALUE_STATE.NUMBER_EXPONENT;
          this._substate = 0;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "exponent_start",
          };
        }
        if (isNumberSeparator(c, this.option.ACCEPT_JSON5_WHITESPACE))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the integer part of the number`
        );
      case VALUE_STATE.NUMBER_FRACTION:
        if (c >= "0" && c <= "9") {
          this._substate = true;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "fraction_digit",
          };
        }
        if (this._substate === false && !this.option.ACCEPT_EMPTY_FRACTION) {
          this._throw("the fraction part cannot be empty");
        }

        if (c === "e" || c === "E") {
          this._state = VALUE_STATE.NUMBER_EXPONENT;
          this._substate = 0;
          return {
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "exponent_start",
          };
        }
        if (isNumberSeparator(c, this.option.ACCEPT_JSON5_WHITESPACE))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the fraction part of the number`
        );
      case VALUE_STATE.NUMBER_EXPONENT:
        if (c === "+" || c === "-") {
          if (this._substate === 0) {
            this._substate = 1;
            return {
              location: wrapLocationNotKey(this._location),
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
            location: wrapLocationNotKey(this._location),
            type: "number",
            subtype: "exponent_digit",
          };
        }
        if (this._substate === 0 || this._substate === 1) {
          this._throw("the exponent part cannot be empty");
        }

        if (isNumberSeparator(c, this.option.ACCEPT_JSON5_WHITESPACE))
          return this._handleNumberSeparator(c);
        this._throw(
          `unexpected character ${formatChar(
            c
          )} while parsing the exponent part of the number`
        );
    }
  }
  private _switchLine(c: string) {
    if (this._meetCr) {
      if (c !== "\n") {
        ++this._line;
        this._column = 1;
      }
      this._meetCr = false;
    }
  }
  private _feed(c: string) {
    this._switchLine(c);
    const ret = this._step(c);
    ++this._position;
    if (c === "\r") {
      ++this._column;
      this._meetCr = true;
    } else if (c === "\n" || c === "\u2028" || c === "\u2029") {
      ++this._line;
      this._column = 1;
    } else if (c !== EOF) ++this._column;
    return ret;
  }

  constructor(option: JsonOption = {}) {
    this.option = option;
  }
  feed(s: string): JsonToken[] {
    const ret = [];
    for (const c of s) ret.push(this._feed(c));
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

export function jsonStreamParse(s: string) {
  const parser = new JsonStreamParser();
  const ret = parser.feed(s);
  parser.end();
  return ret;
}
export function* jsonStreamGenerator(s: Iterable<string>) {
  const parser = new JsonStreamParser();
  for (const chunk of s) yield* parser.feed(chunk);
  yield parser.end();
}
