import { JsonOption, JsonParserError } from "./base";

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
const isNumberSeparator = (c: string, fitJson5?: boolean) => isWhitespace(c, fitJson5) || "\0,]}/".includes(c);
const isControl = (c: string) => c >= "\x00" && c <= "\x1F";
const isHex = (c: string) => (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isIdentifierStart = (c: string) => /[$_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}]/u.test(c);
const isIdentifierNext = (c: string) => isIdentifierStart(c) || /[\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u.test(c);

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
  if (!code) return "EOF";
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
  KEY_FIRST_START, // used to check trailing comma
  KEY_START,
  VALUE_START,
  ELEMENT_FIRST_START, // used to check trailing comma
  ELEMENT_START,

  ROOT_END,
  KEY_END,
  VALUE_END,
  ELEMENT_END,
  EOF,
}

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
    subtype: "escape_start" | "escape_unicode_start";
  };
  type _StringEscape = { subtype: "escape" } & {
    escaped_value: '"' | "\\" | "/" | "\b" | "\f" | "\n" | "\r" | "\t";
  };
  type _StringEscapeUnicode = { subtype: "escape_unicode" } & (
    | { index: 0 | 1 | 2; escaped_value?: undefined }
    | { index: 3; escaped_value: string }
  );
  type _String = { type: "string" } & (
    | _StringStartEnd
    | _StringNormal
    | _StringEscape2Start
    | _StringEscape
    | _StringEscapeUnicode
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
  type _Number = { type: "number" } & (_NumberSign | _NumberDigit | _NumberStart);

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

  // << object >>
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

  type _Select<Opt, Key, True, False = never> = Key extends keyof Opt ? (Opt[Key] extends false ? False : True) : False;
  export type JsonTokenInfo<Opt extends JsonOption> =
    | StdJsonTokenInfo
    // << object >>
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
export type JsonToken<Opt extends JsonOption = JsonOption> = TokenInfo.JsonTokenInfo<Opt> & {
  character: string;
};
type AllJsonToken = JsonToken<JsonOption>;
type MergedJsonToken = {
  [K in keyof AllJsonToken]: AllJsonToken[K];
} & {
  escaped_value?: string;
  index: number;
  done?: boolean;
};

const LOCATION_TABLE: ("root" | "key" | "value" | "element")[] = [];
LOCATION_TABLE[LocateState.ROOT_START] = LOCATION_TABLE[LocateState.ROOT_END] = "root";
LOCATION_TABLE[LocateState.KEY_FIRST_START] =
  LOCATION_TABLE[LocateState.KEY_START] =
  LOCATION_TABLE[LocateState.KEY_END] =
    "key";
LOCATION_TABLE[LocateState.VALUE_START] = LOCATION_TABLE[LocateState.VALUE_END] = "value";
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

export class JsonStreamParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "StreamJsonParserError";
  }
}

const createJsonStreamParserInternal = (option?: JsonOption, init?: any[]) => {
  option = option || {};
  // << white space >>
  const acceptJson5Whitespace = option.acceptJson5Whitespace;
  // << array >>
  const acceptTrailingCommaInArray = option.acceptTrailingCommaInArray;
  // << object >>
  const acceptTrailingCommaInObject = option.acceptTrailingCommaInObject;
  const acceptIdentifierKey = option.acceptIdentifierKey;
  // << string >>
  const acceptSingleQuote = option.acceptSingleQuote;
  const acceptMultilineString = option.acceptMultilineString;
  const accpetJson5StringEscape = option.accpetJson5StringEscape;
  // << number >>
  const acceptPositiveSign = option.acceptPositiveSign;
  const acceptEmptyFraction = option.acceptEmptyFraction;
  const acceptEmptyInteger = option.acceptEmptyInteger;
  const acceptNan = option.acceptNan;
  const acceptInfinity = option.acceptInfinity;
  const acceptHexadecimalInteger = option.acceptHexadecimalInteger;
  const acceptOctalInteger = option.acceptOctalInteger;
  const acceptBinaryInteger = option.acceptBinaryInteger;
  // << comment >>
  const acceptSingleLineComment = option.acceptSingleLineComment;
  const accpetMultiLineComment = option.accpetMultiLineComment;
  //

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
    [_position, _line, _column, _meetCr, _location, _state, _substate, _substate2, _stack] = init;
  }

  function _throw(msg?: string): never {
    throw new JsonStreamParserError(`JsonParser Error at (${_position})${_line}:${_column} - ${msg}`);
  }
  function _throwUnexpected(s: string, stage?: string): never {
    throw new JsonStreamParserError(
      `JsonParser Error at (${_position})${_line}:${_column} - unexpected ${s}${
        stage ? " while parsing " + stage : ""
      }`,
    );
  }

  const _handleComma = (token: MergedJsonToken) => {
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
    if (_location === LocateState.ELEMENT_FIRST_START) _throw("extra commas not allowed in empty array");
    if (_location === LocateState.VALUE_START) _throw("unpexted empty value");
    _throwUnexpected("comma");
  };
  const _handleArrayEnd = (token: MergedJsonToken) => {
    if (
      _location === LocateState.ELEMENT_FIRST_START ||
      _location === LocateState.ELEMENT_END ||
      (_location === LocateState.ELEMENT_START && acceptTrailingCommaInArray)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location];
      token.type = "array";
      token.subtype = "end";
      return;
    }

    if (_location === LocateState.ELEMENT_START) _throw("extra commas not allowed in array");
    _throw("bad closing square bracket");
  };
  const _handleObjectEnd = (token: MergedJsonToken): void => {
    if (
      _location === LocateState.KEY_FIRST_START ||
      _location === LocateState.VALUE_END ||
      (_location === LocateState.KEY_START && acceptTrailingCommaInObject)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location];
      token.type = "object";
      token.subtype = "end";
      return;
    }

    if (_location === LocateState.KEY_START) _throw("extra commas not allowed in object");
    _throw("bad closing curly brace");
  };
  const _handleEOF = (token: MergedJsonToken) => {
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
        _throwUnexpected("EOF", "object");

      case LocateState.ELEMENT_FIRST_START:
      case LocateState.ELEMENT_START:
      case LocateState.ELEMENT_END:
        _throwUnexpected("EOF", "array");

      case LocateState.EOF:
        _throw("unexpected EOF after EOF");
    }
  };
  const _handleSlash = (token: MergedJsonToken) => {
    if (acceptSingleLineComment || accpetMultiLineComment) {
      _state = ValueState.COMMENT_MAY_START;
      token.location = LOCATION_TABLE[_location];
      token.type = "comment";
      token.subtype = "may_start";
      return;
    }
    _throw("comment not allowed");
  };
  const _handleNumberSeparator = (token: MergedJsonToken, c: string): void => {
    _state = ValueState.EMPTY;
    _location = NEXT_STATE_TABLE[_location];
    if (c === EOF) return _handleEOF(token);
    if (c === "}") return _handleObjectEnd(token);
    if (c === "]") return _handleArrayEnd(token);
    if (c === ",") return _handleComma(token);
    if (c === "/") return _handleSlash(token);
    token.location = LOCATION_TABLE[_location];
    token.type = "whitespace";
    token.subtype = undefined;
    return;
  };
  const _handleLiteral = (
    token: MergedJsonToken,
    c: string,
    literal: string,
    subtype: "infinity" | "nan" | undefined = undefined,
    type: "number" | "true" | "false" | "null" = literal as any,
  ) => {
    const dc = literal[_substate];
    if (c === dc) {
      token.type = type;
      token.subtype = subtype;
      token.index = _substate;
      if (++_substate === literal.length) {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_location];
        token.done = true;
      } else token.done = undefined;
      return;
    }
    _throw(`expected '${dc}' while parsing ${literal}, but got ${formatChar(c)}`);
  };

  const _stepEmpty = (token: MergedJsonToken, c: string): void => {
    if (isWhitespace(c, acceptJson5Whitespace)) {
      token.type = "whitespace";
      token.subtype = undefined;
      return;
    }
    if (c === EOF) return _handleEOF(token);
    if (c === "/") return _handleSlash(token);
    if (_location === LocateState.ROOT_END) {
      _throw(`non-whitespace character ${formatChar(c)} after JSON`);
    }

    if (c === '"' || (c === "'" && acceptSingleQuote)) {
      _state = ValueState.STRING;
      _substate2 = c;
      token.type = "string";
      token.subtype = "start";
      return;
    }
    if (c === "'") _throw("single quote not allowed");
    if (_location === LocateState.KEY_FIRST_START || _location === LocateState.KEY_START) {
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
      if (_location === LocateState.KEY_FIRST_START && c === ",") _throw("extra commas not allowed in empty object");
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
        _throwUnexpected("repeated colon");
      }
      if (_location === LocateState.ELEMENT_END) {
        _throwUnexpected("colon", "array");
      }
      _throwUnexpected("colon");
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
        if (!acceptPositiveSign) _throwUnexpected("sign '+'");
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
        token.subtype = undefined;
        token.index = 0;
        token.done = undefined;
        return;
      case "t":
        _state = ValueState.TRUE;
        _substate = 1;
        token.type = "true";
        token.subtype = undefined;
        token.index = 0;
        token.done = undefined;
        return;
      case "f":
        _state = ValueState.FALSE;
        _substate = 1;
        token.type = "false";
        token.subtype = undefined;
        token.index = 0;
        token.done = undefined;
        return;
      case "u":
        _throw(`"undefined" is not a valid JSON value`);
    }
    _throwUnexpected(formatChar(c));
  };
  const _step = (token: MergedJsonToken, c: string): void => {
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
        return _handleLiteral(token, c, "Infinity", "infinity", "number");
      case ValueState.NUMBER_NAN:
        return _handleLiteral(token, c, "NaN", "nan", "number");

      case ValueState.STRING_MULTILINE_CR:
        if (c === "\n") {
          _state = ValueState.STRING;
          token.type = "string";
          token.subtype = "next_line";
          return;
        }
      // fallthrough
      case ValueState.STRING:
        token.type = "string";
        if (c === _substate2) {
          _location = NEXT_STATE_TABLE[_location];
          _state = ValueState.EMPTY;
          token.subtype = "end";
          return;
        }
        if (c === "\\") {
          _state = ValueState.STRING_ESCAPE;
          token.subtype = "escape_start";
          return;
        }
        if (c === EOF) _throwUnexpected("EOF", "string");
        if (isControl(c)) _throwUnexpected(`control character ${formatChar(c)}`, "string");
        token.subtype = "normal";
        return;
      case ValueState.STRING_ESCAPE:
        token.type = "string";
        if (c === "u") {
          _state = ValueState.STRING_UNICODE;
          _substate = "";
          token.subtype = "escape_unicode_start";
          return;
        }
        {
          const dc = ESCAPE_TABLE[c];
          if (dc !== undefined) {
            _state = ValueState.STRING;
            token.subtype = "escape";
            token.escaped_value = dc;
            return;
          }
        }
        if (acceptMultilineString && isNextLine(c)) {
          _state = c === "\r" ? ValueState.STRING_MULTILINE_CR : ValueState.STRING;
          token.subtype = "next_line";
          return;
        }
        if (accpetJson5StringEscape) {
          const dc = ESCAPE_TABLE2[c];
          if (dc !== undefined) {
            _state = ValueState.STRING;
            token.subtype = "escape";
            token.escaped_value = dc;
            return;
          } else if (c === "x") {
            _state = ValueState.STRING_ESCAPE_HEX;
            _substate = "";
            token.subtype = "escape_hex_start";
            return;
          }
        }
        _throw(`bad escaped character ${formatChar(c)}`);
      case ValueState.STRING_UNICODE:
        if (isHex(c)) {
          _substate += c;
          token.type = "string";
          token.subtype = "escape_unicode";
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
          } else token.escaped_value = undefined;
          return;
        }
        _throw(`bad Hex escape character ${formatChar(c)}`);

      case ValueState.NUMBER:
        token.type = "number";
        if (c === "0") {
          if (_substate === 0) _throw("leading zero not allowed");
          if (_substate === -1) _substate = 0;
          token.subtype = "integer_digit";
          return;
        }
        if (c >= "1" && c <= "9") {
          if (_substate === 0) _throw("leading zero not allowed");
          if (_substate === -1) _substate = 1;
          token.subtype = "integer_digit";
          return;
        }
        if (c === ".") {
          if (_substate === -1 && !acceptEmptyInteger) {
            _throw("unexpected '.' before number");
          }
          _state = ValueState.NUMBER_FRACTION;
          _substate = false;
          token.subtype = "fraction_start";
          return;
        }
        if (_substate === -1) {
          if (acceptInfinity && c === "I") {
            // "-Infinity", "+Infinity"
            _state = ValueState.NUMBER_INFINITY;
            _substate = 1;
            token.subtype = "infinity";
            token.index = 0;
            return;
          }
          if (acceptNan && c === "N") {
            // "-NaN", "+NaN"
            _state = ValueState.NUMBER_NAN;
            _substate = 1;
            token.subtype = "nan";
            token.index = 0;
            return;
          }
          _throw("the integer part cannnot be empty");
        }

        if (_substate === 0) {
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
          token.subtype = "exponent_start";
          return;
        }
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "the integer part of the number");
      case ValueState.NUMBER_FRACTION:
        token.type = "number";
        if (c >= "0" && c <= "9") {
          _substate = true;
          token.subtype = "fraction_digit";
          return;
        }
        if (_substate === false && !acceptEmptyFraction) {
          _throw("the fraction part cannot be empty");
        }

        if (c === "e" || c === "E") {
          _state = ValueState.NUMBER_EXPONENT;
          _substate = 0;
          token.subtype = "exponent_start";
          return;
        }
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "the fraction part of the number");
      case ValueState.NUMBER_EXPONENT:
        token.type = "number";
        if (c === "+" || c === "-") {
          if (_substate === 0) {
            _substate = 1;
            token.subtype = "exponent_sign";
            return;
          } else if (_substate === 1) {
            _throwUnexpected(`repeated sign ${c}`, "exponent part");
          } else if (_substate === 2) {
            _throwUnexpected(`sign ${c}`, "exponent part");
          }
        }
        if (c >= "0" && c <= "9") {
          _substate = 2;
          token.subtype = "exponent_digit";
          return;
        }
        if (_substate === 0 || _substate === 1) {
          _throw("the exponent part cannot be empty");
        }

        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "the exponent part of the number");
      case ValueState.NUMBER_HEX:
        if (isHex(c)) {
          _substate = true;
          token.type = "number";
          token.subtype = "hex";
          return;
        }
        if (c === ".") _throw("fraction not allowed in hexadecimal number");
        if (_substate === false) _throw("the hexadecimal integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "hexadecimal number");

      case ValueState.NUMBER_OCT:
        if (c >= "0" && c <= "7") {
          _substate = true;
          token.type = "number";
          token.subtype = "oct";
          return;
        }
        if (c === "e" || c === "E") _throw("exponent not allowed in octal number");
        if (c === ".") _throw("fraction not allowed in octal number");
        if (_substate === false) _throw("the octal integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "octal number");

      case ValueState.NUMBER_BIN:
        if (c === "0" || c === "1") {
          _substate = true;
          token.type = "number";
          token.subtype = "bin";
          return;
        }
        if (c === "e" || c === "E") _throw("exponent not allowed in binary number");
        if (c === ".") _throw("fraction not allowed in binary number");
        if (_substate === false) _throw("the binary integer part cannot be empty");
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throwUnexpected(formatChar(c), "binary number");

      case ValueState.COMMENT_MAY_START:
        token.type = "comment";
        if (acceptSingleLineComment && c === "/") {
          _state = ValueState.SINGLE_LINE_COMMENT;
          token.subtype = "single_line";
          return;
        }
        if (accpetMultiLineComment && c === "*") {
          _state = ValueState.MULTI_LINE_COMMENT;
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
        token.type = "comment";
        token.subtype = "multi_line";
        if (c === "*") _state = ValueState.MULTI_LINE_COMMENT_MAY_END;
        return;
      case ValueState.MULTI_LINE_COMMENT_MAY_END:
        token.type = "comment";
        if (c === "/") {
          _state = ValueState.EMPTY;
          token.subtype = "multi_line_end";
          return;
        }
        if (c !== "*") _state = ValueState.MULTI_LINE_COMMENT;
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
        _throwUnexpected(formatChar(c), "identifier");

      case ValueState.IDENTIFIER_ESCAPE:
        token.type = "identifier";
        if (_substate.length === 0) {
          if (c === "u") {
            _state = ValueState.IDENTIFIER_ESCAPE;
            _substate = "u";
            token.location = "key";
            token.subtype = "escape_start";
            token.index = 1;
            return;
          }
          _throw(`expected 'u' after '\\' in identifier, but got ${formatChar(c)}`);
        }
        if (isHex(c)) {
          _substate += c;
          token.location = "key";
          token.subtype = "escape";
          token.index = _substate.length - 2;
          if (_substate.length === 5) {
            _location = LocateState.KEY_END;
            _state = ValueState.EMPTY;
            token.escaped_value = String.fromCharCode(parseInt((_substate as string).slice(1), 16));
          } else token.escaped_value = undefined;
          return;
        }
        _throw(`expected hexadecimal number after '\\u' in identifier, but got ${formatChar(c)}`);
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
    _step(token as MergedJsonToken, c);
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
      for (const c of s) ret.push(_feed({} as any, c));
      return ret;
    },
    end(): AllJsonToken {
      return _feed({} as any, EOF);
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
};

export interface JsonStreamParser<Opt extends JsonOption = JsonOption> {
  feedOneTo: (destToken: object, c: string) => JsonToken<Opt>;

  feed(s: string): JsonToken<Opt>[];
  end(): JsonToken<Opt>;

  get position(): number;
  get line(): number;
  get column(): number;

  copy(): JsonStreamParser<Opt>;
}
export const createJsonStreamParser = <Opt extends JsonOption = {}>(option?: Opt): JsonStreamParser<Opt> => {
  return createJsonStreamParserInternal(option) as any;
};

export const jsonStreamParse = <Opt extends JsonOption = {}>(s: string, option?: Opt): JsonToken<Opt>[] => {
  const parser = createJsonStreamParser(option);

  const ret = parser.feed(s);
  ret.push(parser.end());
  return ret;
};
