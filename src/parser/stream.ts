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
const isControl = (c: string) => (c >= "\x00" && c <= "\x1F") || c == "\x7F";
const isHex = (c: string) => (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isIdentifierStart = (c: string) => /[$_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}]/u.test(c);
const isIdentifierNext = (c: string) => isIdentifierStart(c) || /[\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u.test(c);

const ESCAPE_TABLE: Record<string, string | undefined> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const ESCAPE_TABLE2: Record<string, string | undefined> = { "'": "'", v: "\v", 0: EOF };

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

const enum LocationState {
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
  type _StringEscape2Start = { subtype: "escape_start" | "escape_unicode_start" };
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

  type _NumberSign = { subtype: "integer_sign" | "exponent_sign" };
  type _NumberDigit = { subtype: "integer_digit" | "fraction_digit" | "exponent_digit" };
  type _NumberStart = { subtype: "fraction_start" | "exponent_start" };
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
    | { location: "object"; type: "object"; subtype: "value_start" | "next" }
    | { location: "array"; type: "array"; subtype: "next" };

  // << object >>
  type _Extra_IdentifierKey = { location: "key"; type: "identifier" } & (
    | { subtype: "escape_start"; index: 0; done?: undefined }
    | { subtype: "escape_start"; index: 1; done?: true }
    | { subtype: "escape"; index: 0 | 1 | 2; escaped_value?: undefined }
    | { subtype: "escape"; index: 3; escaped_value: string }
    | { subtype: "normal" }
  );

  // << string >>
  type _Extra_MultilineString = { location: _NotKeyLocation | "key"; type: "string"; subtype: "next_line" };
  type _Extra_Json5StringEscape = { location: _NotKeyLocation | "key"; type: "string" } & (
    | { subtype: "escape_hex_start" }
    | { subtype: "escape"; escaped_value: "\v" | "\0" | "'" }
    | { subtype: "escape_hex"; index: 0; escaped_value?: undefined }
    | { subtype: "escape_hex"; index: 1; escaped_value: string }
  );

  // << number >>
  type _Extra_Nan = { location: _NotKeyLocation; type: "number"; subtype: "nan" } & (
    | { index: 0 | 1; done?: undefined }
    | { index: 2; done: true }
  );
  type _Extra_Infinity = { location: _NotKeyLocation; type: "number"; subtype: "infinity" } & (
    | { index: 0 | 1 | 2 | 3 | 4 | 5 | 6; done?: undefined }
    | { index: 7; done: true }
  );
  type _Extra_HexadecimalInteger = { location: _NotKeyLocation; type: "number"; subtype: "hex_start" | "hex" };
  type _Extra_OctalInteger = { location: _NotKeyLocation; type: "number"; subtype: "oct_start" | "oct" };
  type _Extra_BinaryInteger = { location: _NotKeyLocation; type: "number"; subtype: "bin_start" | "bin" };

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
    | _Select<Opt, "acceptJson5StringEscape", _Extra_Json5StringEscape>
    // << number >>
    | _Select<Opt, "acceptNan", _Extra_Nan>
    | _Select<Opt, "acceptInfinity", _Extra_Infinity>
    | _Select<Opt, "acceptHexadecimalInteger", _Extra_HexadecimalInteger>
    | _Select<Opt, "acceptOctalInteger", _Extra_OctalInteger>
    | _Select<Opt, "acceptBinaryInteger", _Extra_BinaryInteger>
    // << comment >>
    | _Select<Opt, "acceptSingleLineComment", _Extra_SingleLineComment>
    | _Select<Opt, "acceptMultiLineComment", _Extra_MultiLineComment>;
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
LOCATION_TABLE[LocationState.ROOT_START] = LOCATION_TABLE[LocationState.ROOT_END] = "root";
LOCATION_TABLE[LocationState.KEY_FIRST_START] =
  LOCATION_TABLE[LocationState.KEY_START] =
  LOCATION_TABLE[LocationState.KEY_END] =
    "key";
LOCATION_TABLE[LocationState.VALUE_START] = LOCATION_TABLE[LocationState.VALUE_END] = "value";
LOCATION_TABLE[LocationState.ELEMENT_FIRST_START] =
  LOCATION_TABLE[LocationState.ELEMENT_START] =
  LOCATION_TABLE[LocationState.ELEMENT_END] =
    "element";

const NEXT_STATE_TABLE: LocationState[] = [
  LocationState.ROOT_END,
  LocationState.KEY_END,
  LocationState.KEY_END,
  LocationState.VALUE_END,
  LocationState.ELEMENT_END,
  LocationState.ELEMENT_END,
];

export class JsonStreamParserError extends JsonParserError {
  character: string;
  position: number;
  line: number;
  column: number;

  constructor(baseMsg: string, character: string, position: number, line: number, column: number) {
    super(baseMsg, `At ${line}:${column}(${position}), Character ${formatChar(character)} - ${baseMsg}`);
    this.name = "StreamJsonParserError";
    this.character = character;
    this.position = position;
    this.line = line;
    this.column = column;
  }
}

// << other >>
const Err_CommentForbidden = "comment not allowed";
const Err_Eof = "structure broken because of EOF";
const Err_NonwhitespaceAfterEnd = "unexpected non-whitespace character after end of JSON";
const Err_ContentAfterEOF = "content after EOF";
const Err_TrailingCommaForbidden = "trailing comma not allowed";
const Err_Unexpected = "unexpected character";
const Err_WrongBracket = "wrong bracket";
const Err_WrongColon = "colon only allowed between property name and value";
// << array >>
const Err_CommaInEmptyArray = "empty array with trailing comma not allowed";
// << object >>
const Err_BadIdentifierEscape = 'the escape sequence for an identifier must start with "/u"';
const Err_BadPropertyNameInObject = "property name must be a string";
const Err_CommaInEmptyObject = "empty object with trailing comma not allowed";
const Err_EmptyValueInObject = "unexpected empty value in object";
const Err_ExpectedColon = "colon expected between property name and value";
const Err_InvalidIdentifier = "invalid identifier in JSON string";
const Err_InvalidIdentifierEscape = "invalid identifier escape sequence in JSON5 identifier";
const Err_RepeatedColon = "repeated colon not allowed";
// << string >>
const Err_BadEscapeInString = "bad escape sequence in JSON string";
const Err_BadHexEscapeInString = "bad hex escape sequence in JSON string";
const Err_BadUnicodeEscapeInString = "bad Unicode escape sequence in JSON string";
const Err_ControlCharacterForbiddenInString = "control character not allowed in JSON string";
const Err_SingleQuoteForbidden = "single quote not allowed";
// << number >>
const Err_EmptyExponentPart = "the exponent part of a number cannot be empty";
const Err_EmptyFractionPart = "the fraction part of a number cannot be empty";
const Err_EmptyIntegerPart = "the integer part of a number cannot be empty";
const Err_ExponentNotAllowed = "exponent part not allowed in non-decimal number";
const Err_FractionNotAllowed = "fraction part not allowed in non-decimal number";
const Err_LeadingZeroForbidden = "leading zero not allowed";
const Err_PositiveSignForbidden = "positive sign not allowed";
const Err_UnexpectedInNumber = "unexpected character in number";

const createJsonStreamParserInternal = (option?: JsonOption, init?: any[]) => {
  option = option || {};
  // << whitespace >>
  const acceptJson5Whitespace = option.acceptJson5Whitespace;
  // << array >>
  const acceptTrailingCommaInArray = option.acceptTrailingCommaInArray;
  // << object >>
  const acceptTrailingCommaInObject = option.acceptTrailingCommaInObject;
  const acceptIdentifierKey = option.acceptIdentifierKey;
  // << string >>
  const acceptSingleQuote = option.acceptSingleQuote;
  const acceptMultilineString = option.acceptMultilineString;
  const acceptJson5StringEscape = option.acceptJson5StringEscape;
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
  const acceptMultiLineComment = option.acceptMultiLineComment;
  //

  let _position = 0;
  let _line = 0;
  let _column = 0;
  let _meetCr = false;

  /**
   * The state of the location
   * - at the start/end of the root node
   * - at the start/end of an object's key or value
   * - at the start/end of an array's element
   */
  let _location = LocationState.ROOT_START;
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
   *   `NUMBER_FRACTION`: [boolean] whether already accept digits
   *
   *   `NUMBER_EXPONENT`: [0] not yet accept any
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
  let _substate: string | number | boolean;
  /**
   * Additional primary value substate (see following)
   *
   * possible_values:
   *  `STRING`|`STRING_ESCAPE`|`STRING_UNICODE`: [string] the character starting the string
   */
  let _substate2: string;

  let _stack: LocationState[] = [];

  if (init !== undefined) [_position, _line, _column, _meetCr, _location, _state, _substate, _substate2, _stack] = init;

  function _throw(c: string, msg: string): never {
    throw new JsonStreamParserError(msg, c, _position, _line, _column);
  }

  const _handleComma = (token: MergedJsonToken) => {
    if (_location === LocationState.VALUE_END) {
      _location = LocationState.KEY_START;
      token.location = token.type = "object";
      token.subtype = "next";
      return;
    } else if (_location === LocationState.ELEMENT_END) {
      _location = LocationState.ELEMENT_START;
      token.location = token.type = "array";
      token.subtype = "next";
      return;
    }
    if (_location === LocationState.ELEMENT_FIRST_START) _throw(",", Err_CommaInEmptyArray);
    if (_location === LocationState.ELEMENT_START) _throw(",", Err_TrailingCommaForbidden);
    if (_location === LocationState.VALUE_START) _throw(",", Err_EmptyValueInObject);
    _throw(",", Err_Unexpected);
  };
  const _handleArrayEnd = (token: MergedJsonToken) => {
    if (
      _location === LocationState.ELEMENT_FIRST_START ||
      _location === LocationState.ELEMENT_END ||
      (_location === LocationState.ELEMENT_START && acceptTrailingCommaInArray)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location];
      token.type = "array";
      token.subtype = "end";
      return;
    }

    if (_location === LocationState.ELEMENT_START) _throw("]", Err_CommaInEmptyArray);
    _throw("]", Err_WrongBracket);
  };
  const _handleObjectEnd = (token: MergedJsonToken): void => {
    if (
      _location === LocationState.KEY_FIRST_START ||
      _location === LocationState.VALUE_END ||
      (_location === LocationState.KEY_START && acceptTrailingCommaInObject)
    ) {
      _state = ValueState.EMPTY;
      _location = NEXT_STATE_TABLE[_stack.pop()!];
      token.location = LOCATION_TABLE[_location];
      token.type = "object";
      token.subtype = "end";
      return;
    }

    if (_location === LocationState.KEY_START) _throw("]", Err_CommaInEmptyObject);
    _throw("}", Err_WrongBracket);
  };
  const _handleEOF = (token: MergedJsonToken) => {
    if (_location === LocationState.ROOT_START || _location === LocationState.ROOT_END) {
      token.type = "eof";
      token.subtype = undefined;
      _location = LocationState.EOF;
      return;
    }
    _throw(EOF, Err_Eof);
  };
  const _handleSlash = (token: MergedJsonToken) => {
    if (acceptSingleLineComment || acceptMultiLineComment) {
      _state = ValueState.COMMENT_MAY_START;
      token.type = "comment";
      token.subtype = "may_start";
      return;
    }
    _throw("/", Err_CommentForbidden);
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
  const _handleLiteral = (token: MergedJsonToken, c: string, type: "null" | "true" | "false") => {
    const dc = type[_substate as number];
    if (c === dc) {
      token.type = type;
      token.subtype = undefined;
      token.index = _substate as number;
      if (++(_substate as number) === type.length) {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_location];
        token.done = true;
      } else token.done = undefined;
      return;
    }
    _throw(c, Err_Unexpected);
  };
  const _handleNumberLiteral = (
    token: MergedJsonToken,
    c: string,
    literal: "Infinity" | "NaN",
    subtype: "infinity" | "nan",
  ) => {
    const dc = literal[_substate as number];
    if (c === dc) {
      token.type = "number";
      token.subtype = subtype;
      token.index = _substate as number;
      if (++(_substate as number) === literal.length) {
        _state = ValueState.EMPTY;
        _location = NEXT_STATE_TABLE[_location];
        token.done = true;
      } else token.done = undefined;
      return;
    }
    _throw(c, Err_UnexpectedInNumber);
  };

  const _stepEmpty = (token: MergedJsonToken, c: string): void => {
    if (_location == LocationState.EOF) _throw(c, Err_ContentAfterEOF);

    if (isWhitespace(c, acceptJson5Whitespace)) {
      token.type = "whitespace";
      token.subtype = undefined;
      return;
    }
    if (c === EOF) return _handleEOF(token);
    if (c === "/") return _handleSlash(token);
    if (_location === LocationState.ROOT_END) _throw(c, Err_NonwhitespaceAfterEnd);

    if (c === '"' || (c === "'" && acceptSingleQuote)) {
      _state = ValueState.STRING;
      _substate2 = c;
      token.type = "string";
      token.subtype = "start";
      return;
    }
    if (c === "'") _throw(c, Err_SingleQuoteForbidden);
    if (_location === LocationState.KEY_FIRST_START || _location === LocationState.KEY_START) {
      if (acceptIdentifierKey)
        if (isIdentifierStart(c)) {
          _state = ValueState.IDENTIFIER;
          token.type = "identifier";
          token.subtype = "normal";
          return;
        } else if (c === "\\") {
          _state = ValueState.IDENTIFIER_ESCAPE;
          _substate = "";
          token.type = "identifier";
          token.subtype = "escape_start";
          token.index = 0;
          token.done = undefined;
          return;
        }
      if (c !== "}") _throw(c, Err_BadPropertyNameInObject);
    }

    if (c === ":") {
      if (_location === LocationState.KEY_END) {
        _location = LocationState.VALUE_START;
        token.location = "object";
        token.type = "object";
        token.subtype = "value_start";
        return;
      }
      _throw(c, _location === LocationState.VALUE_START ? Err_RepeatedColon : Err_WrongColon);
    }
    if (_location === LocationState.KEY_END) _throw(c, Err_ExpectedColon);

    if (c === "]") return _handleArrayEnd(token);
    if (c === "}") return _handleObjectEnd(token);
    if (c === ",") return _handleComma(token);
    if (_location === LocationState.ELEMENT_END || _location === LocationState.VALUE_END) _throw(c, Err_Unexpected);

    switch (c) {
      case "[": {
        _stack.push(_location);
        _location = LocationState.ELEMENT_FIRST_START;
        token.type = "array";
        token.subtype = "start";
        return;
      }
      case "{": {
        _stack.push(_location);
        _location = LocationState.KEY_FIRST_START;
        token.type = "object";
        token.subtype = "start";
        return;
      }

      case "+":
        if (!acceptPositiveSign) _throw(c, Err_PositiveSignForbidden);
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
        _throw(c, Err_EmptyIntegerPart);
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
        _throw(c, Err_UnexpectedInNumber);
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
        _throw(c, Err_UnexpectedInNumber);

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
    }
    _throw(c, Err_Unexpected);
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
        if (c === EOF) _throw(c, Err_Eof);
        if (isControl(c)) _throw(c, Err_ControlCharacterForbiddenInString);
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
        if (acceptJson5StringEscape) {
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
        _throw(c, Err_BadEscapeInString);
      case ValueState.STRING_UNICODE:
        if (isHex(c)) {
          _substate += c;
          token.type = "string";
          token.subtype = "escape_unicode";
          token.index = (_substate as string).length - 1;
          if ((_substate as string).length === 4) {
            _state = ValueState.STRING;
            token.escaped_value = String.fromCharCode(parseInt(_substate as string, 16));
          } else token.escaped_value = undefined;
          return;
        }
        _throw(c, Err_BadUnicodeEscapeInString);
      case ValueState.STRING_ESCAPE_HEX:
        if (isHex(c)) {
          _substate += c;
          token.type = "string";
          token.subtype = "escape_hex";
          token.index = (_substate as string).length - 1;
          if ((_substate as string).length === 2) {
            _state = ValueState.STRING;
            token.escaped_value = String.fromCharCode(parseInt(_substate as string, 16));
          } else token.escaped_value = undefined;
          return;
        }
        _throw(c, Err_BadHexEscapeInString);

      case ValueState.NUMBER:
        token.type = "number";
        if (c === "0") {
          if (_substate === 0) _throw(c, Err_LeadingZeroForbidden);
          if (_substate === -1) _substate = 0;
          token.subtype = "integer_digit";
          return;
        }
        if (c >= "1" && c <= "9") {
          if (_substate === 0) _throw(c, Err_LeadingZeroForbidden);
          if (_substate === -1) _substate = 1;
          token.subtype = "integer_digit";
          return;
        }
        if (c === ".") {
          if (_substate === -1 && !acceptEmptyInteger) _throw(c, Err_EmptyIntegerPart);
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
          _throw(c, Err_EmptyIntegerPart);
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
        _throw(c, Err_UnexpectedInNumber);
      case ValueState.NUMBER_FRACTION:
        token.type = "number";
        if (c >= "0" && c <= "9") {
          _substate = true;
          token.subtype = "fraction_digit";
          return;
        }
        if (!_substate && !acceptEmptyFraction) _throw(c, Err_EmptyFractionPart);

        if (c === "e" || c === "E") {
          _state = ValueState.NUMBER_EXPONENT;
          _substate = 0;
          token.subtype = "exponent_start";
          return;
        }
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throw(c, Err_UnexpectedInNumber);
      case ValueState.NUMBER_EXPONENT:
        token.type = "number";
        if (c === "+" || c === "-") {
          if (_substate === 0) {
            _substate = 1;
            token.subtype = "exponent_sign";
            return;
          }
          _throw(c, Err_UnexpectedInNumber);
        }
        if (c >= "0" && c <= "9") {
          _substate = 2;
          token.subtype = "exponent_digit";
          return;
        }
        if (_substate === 0 || _substate === 1) _throw(c, Err_EmptyExponentPart);

        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throw(c, Err_UnexpectedInNumber);

      case ValueState.NUMBER_HEX:
        if (isHex(c)) {
          _substate = true;
          token.type = "number";
          token.subtype = "hex";
          return;
        }
        if (c === ".") _throw(c, Err_FractionNotAllowed);
        if (!_substate) _throw(c, Err_EmptyIntegerPart);
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throw(c, Err_UnexpectedInNumber);
      case ValueState.NUMBER_OCT:
        if (c >= "0" && c <= "7") {
          _substate = true;
          token.type = "number";
          token.subtype = "oct";
          return;
        }
        if (c === "e" || c === "E") _throw(c, Err_ExponentNotAllowed);
        if (c === ".") _throw(c, Err_FractionNotAllowed);
        if (!_substate) _throw(c, Err_EmptyIntegerPart);
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throw(c, Err_UnexpectedInNumber);
      case ValueState.NUMBER_BIN:
        if (c === "0" || c === "1") {
          _substate = true;
          token.type = "number";
          token.subtype = "bin";
          return;
        }
        if (c === "e" || c === "E") _throw(c, Err_ExponentNotAllowed);
        if (c === ".") _throw(c, Err_FractionNotAllowed);
        if (!_substate) _throw(c, Err_EmptyIntegerPart);
        if (isNumberSeparator(c, acceptJson5Whitespace)) return _handleNumberSeparator(token, c);
        _throw(c, Err_UnexpectedInNumber);

      case ValueState.COMMENT_MAY_START:
        token.type = "comment";
        if (acceptSingleLineComment && c === "/") {
          _state = ValueState.SINGLE_LINE_COMMENT;
          token.subtype = "single_line";
          return;
        }
        if (acceptMultiLineComment && c === "*") {
          _state = ValueState.MULTI_LINE_COMMENT;
          token.subtype = "multi_line";
          return;
        }
        _throw(c, Err_CommentForbidden);
      case ValueState.SINGLE_LINE_COMMENT:
        if (isNextLine(c)) _state = ValueState.EMPTY;
        token.type = "comment";
        token.subtype = "single_line";
        return;
      case ValueState.MULTI_LINE_COMMENT:
        if (c === "*") _state = ValueState.MULTI_LINE_COMMENT_MAY_END;
        token.type = "comment";
        token.subtype = "multi_line";
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
          _location = LocationState.VALUE_START;
          _state = ValueState.EMPTY;
          token.location = "object";
          token.type = "object";
          token.subtype = "value_start";
          return;
        }
        if (isWhitespace(c, acceptJson5Whitespace)) {
          _location = LocationState.KEY_END;
          _state = ValueState.EMPTY;
          token.type = "whitespace";
          token.subtype = undefined;
          return;
        }
        if (isIdentifierNext(c)) {
          token.type = "identifier";
          token.subtype = "normal";
          return;
        }
        _throw(c, Err_InvalidIdentifier);
      case ValueState.IDENTIFIER_ESCAPE:
        token.type = "identifier";
        if ((_substate as string).length === 0) {
          if (c === "u") {
            _state = ValueState.IDENTIFIER_ESCAPE;
            _substate = "u";
            token.subtype = "escape_start";
            token.index = 1;
            token.done = true;
            return;
          }
          _throw(c, Err_BadIdentifierEscape);
        }
        if (isHex(c)) {
          _substate += c;
          token.subtype = "escape";
          token.index = (_substate as string).length - 2;
          if ((_substate as string).length === 5) {
            _location = LocationState.KEY_END;
            _state = ValueState.EMPTY;
            token.escaped_value = String.fromCharCode(parseInt((_substate as string).slice(1), 16));
          } else token.escaped_value = undefined;
          return;
        }
        _throw(c, Err_InvalidIdentifierEscape);
    }
  };
  const _feed = (token: AllJsonToken, c: string) => {
    _step(token as MergedJsonToken, c);
    if (_meetCr) {
      if (c !== "\n") {
        ++_line;
        _column = 0;
      }
      _meetCr = false;
    }
    ++_position;
    if (isNextLine(c)) {
      if (c === "\r") {
        ++_column;
        _meetCr = true;
      } else {
        ++_line;
        _column = 0;
      }
    } else {
      if (c !== EOF) ++_column;
      else --_position;
    }
    return token;
  };

  return {
    feedOneTo: _feed,

    feed(s: string) {
      const ret: AllJsonToken[] = [];
      for (const c of s) ret.push(_feed({} as AllJsonToken, c));
      return ret;
    },
    end(): AllJsonToken {
      return _feed({} as AllJsonToken, EOF);
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

    getStage(): JsonStreamParserStage {
      if (_state !== ValueState.EMPTY) return JsonStreamParserStage.PARSING;
      if (_location === LocationState.ROOT_START) return JsonStreamParserStage.NOT_STARTED;
      if (_location === LocationState.ROOT_END || _location === LocationState.EOF) return JsonStreamParserStage.ENDED;
      return JsonStreamParserStage.PARSING;
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

export interface JsonStreamParserBase {
  get position(): number;
  /** Line number (starting from 0) */
  get line(): number;
  /** Column number (starting from 0) */
  get column(): number;

  getStage(): JsonStreamParserStage;
}
export const enum JsonStreamParserStage {
  NOT_STARTED = -1,
  PARSING = 0,
  ENDED = 1,
}
export interface JsonStreamParser<Opt extends JsonOption = JsonOption> extends JsonStreamParserBase {
  feedOneTo: (destToken: object, c: string) => JsonToken<Opt>;
  feed(s: string): JsonToken<Opt>[];
  end(): JsonToken<Opt>;

  copy(): JsonStreamParser<Opt>;
}
export const createJsonStreamParser = <Opt extends JsonOption = {}>(option?: Opt) => {
  return createJsonStreamParserInternal(option) as JsonStreamParser<Opt>;
};

const patchObject = <Dest extends object, Src extends object, Keys extends KeyT[], KeyT extends keyof Src>(
  dest: Dest,
  src: Src,
  keys: Keys,
): Dest & { [K in KeyT]: Src[K] } => {
  for (const key of keys) Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key)!);
  return dest as any;
};
export const patchJsonStreamParserBase = <T extends object, Opt extends JsonOption = JsonOption>(
  target: T,
  parser: JsonStreamParser<Opt>,
): JsonStreamParserBase & Omit<T, "line"> => {
  return patchObject(target, parser, ["getStage", "position", "line", "column"]);
};

export const jsonStreamParse = <Opt extends JsonOption = {}>(s: string, option?: Opt): JsonToken<Opt>[] => {
  const parser = createJsonStreamParser(option);
  const ret = parser.feed(s);
  ret.push(parser.end());
  return ret;
};
