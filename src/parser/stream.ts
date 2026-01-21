import { JsonOption, JsonParserError } from "./base";

const EXTRA_WHITESPACE =
  /* <VT>, <FF>, <NBSP>, <BOM>, <USP> */
  "\u000B\u000C\u00A0\uFEFF\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000";
const isWhitespace = (c: string, fitJson5?: boolean) => {
  /* <SP>, <TAB>, <LF>, <CR> */
  return " \t\n\r".includes(c) || (fitJson5 && EXTRA_WHITESPACE.includes(c));
};
const isNextLine = (c: string) => "\n\u2028\u2029\r".includes(c);
const isNumberSeparator = (c: string, fitJson5?: boolean) => isWhitespace(c, fitJson5) || "\x00,]}/".includes(c);
const isControl = (c: string) => (c >= "\x00" && c <= "\x1F") || c === "\x7F";
const isHexDigit = (c: string) => (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
const isIdentifierStart = (c: string) => /[$_\p{Lu}\p{Ll}\p{Lt}\p{Lm}\p{Lo}\p{Nl}]/u.test(c);
const isIdentifierNext = (c: string) => isIdentifierStart(c) || /[\p{Mn}\p{Mc}\p{Nd}\p{Pc}\u200C\u200D]/u.test(c);

const formatChar = (c: string) => {
  if (c === "\x00") return "U+0000 (EOF)";
  const code_str = c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
  if (/\P{C}/u.test(c)) return `U+${code_str} ('${c}')`;
  return `U+${code_str}`;
};
const hexDigit = (u: string) => {
  const code = u.charCodeAt(0);
  return code <= 0x39 ? code - 0x30 : (code & 0xf) + 9;
};

// ===

const enum TYPE_SHIFT {
  v = 4,
}
export enum Category {
  WHITESPACE,
  EOF,
  NULL,
  BOOLEAN,
  STRING,
  NUMBER,
  OBJECT,
  ARRAY,
  IDENTIFIER,
  COMMENT,
}
export enum Type {
  WHITESPACE = (Category.WHITESPACE << TYPE_SHIFT.v) | 0x0,
  EOF = (Category.EOF << TYPE_SHIFT.v) | 0x0,
  NULL = (Category.NULL << TYPE_SHIFT.v) | 0x0,

  FALSE = (Category.BOOLEAN << TYPE_SHIFT.v) | 0x0,
  TRUE = (Category.BOOLEAN << TYPE_SHIFT.v) | 0x1,

  STRING_START = (Category.STRING << TYPE_SHIFT.v) | 0x0,
  STRING_END = (Category.STRING << TYPE_SHIFT.v) | 0x1,
  STRING_NORMAL = (Category.STRING << TYPE_SHIFT.v) | 0x2,
  STRING_ESCAPE_START = (Category.STRING << TYPE_SHIFT.v) | 0x3,
  STRING_ESCAPE = (Category.STRING << TYPE_SHIFT.v) | 0x4,
  STRING_ESCAPE_UNICODE_START = (Category.STRING << TYPE_SHIFT.v) | 0x5,
  STRING_ESCAPE_UNICODE = (Category.STRING << TYPE_SHIFT.v) | 0x6,

  STRING_NEXT_LINE = (Category.STRING << TYPE_SHIFT.v) | 0x7,
  STRING_ESCAPE_HEX_START = (Category.STRING << TYPE_SHIFT.v) | 0x8,
  STRING_ESCAPE_HEX = (Category.STRING << TYPE_SHIFT.v) | 0x9,

  NUMBER_INTEGER_DIGIT = (Category.NUMBER << TYPE_SHIFT.v) | 0x0,
  NUMBER_FRACTION_DIGIT = (Category.NUMBER << TYPE_SHIFT.v) | 0x1,
  NUMBER_EXPONENT_DIGIT = (Category.NUMBER << TYPE_SHIFT.v) | 0x2,
  NUMBER_INTEGER_SIGN = (Category.NUMBER << TYPE_SHIFT.v) | 0x3,
  NUMBER_EXPONENT_SIGN = (Category.NUMBER << TYPE_SHIFT.v) | 0x4,
  NUMBER_FRACTION_START = (Category.NUMBER << TYPE_SHIFT.v) | 0x5,
  NUMBER_EXPONENT_START = (Category.NUMBER << TYPE_SHIFT.v) | 0x6,
  NUMBER_NAN = (Category.NUMBER << TYPE_SHIFT.v) | 0x7,
  NUMBER_INFINITY = (Category.NUMBER << TYPE_SHIFT.v) | 0x8,
  NUMBER_HEX_START = (Category.NUMBER << TYPE_SHIFT.v) | 0x9,
  NUMBER_HEX = (Category.NUMBER << TYPE_SHIFT.v) | 0xa,
  NUMBER_OCT_START = (Category.NUMBER << TYPE_SHIFT.v) | 0xb,
  NUMBER_OCT = (Category.NUMBER << TYPE_SHIFT.v) | 0xc,
  NUMBER_BIN_START = (Category.NUMBER << TYPE_SHIFT.v) | 0xd,
  NUMBER_BIN = (Category.NUMBER << TYPE_SHIFT.v) | 0xe,

  OBJECT_START = (Category.OBJECT << TYPE_SHIFT.v) | 0x0,
  OBJECT_NEXT = (Category.OBJECT << TYPE_SHIFT.v) | 0x1,
  OBJECT_VALUE_START = (Category.OBJECT << TYPE_SHIFT.v) | 0x2,
  OBJECT_END = (Category.OBJECT << TYPE_SHIFT.v) | 0x3,

  ARRAY_START = (Category.ARRAY << TYPE_SHIFT.v) | 0x0,
  ARRAY_NEXT = (Category.ARRAY << TYPE_SHIFT.v) | 0x1,
  ARRAY_END = (Category.ARRAY << TYPE_SHIFT.v) | 0x2,

  IDENTIFIER_NORMAL = (Category.IDENTIFIER << TYPE_SHIFT.v) | 0x0,
  IDENTIFIER_ESCAPE_START = (Category.IDENTIFIER << TYPE_SHIFT.v) | 0x1,
  IDENTIFIER_ESCAPE = (Category.IDENTIFIER << TYPE_SHIFT.v) | 0x2,

  COMMENT_MAY_START = (Category.COMMENT << TYPE_SHIFT.v) | 0x0,
  COMMENT_SINGLE_LINE = (Category.COMMENT << TYPE_SHIFT.v) | 0x1,
  COMMENT_MULTI_LINE = (Category.COMMENT << TYPE_SHIFT.v) | 0x3,
  COMMENT_MULTI_LINE_END = (Category.COMMENT << TYPE_SHIFT.v) | 0x4,
}
export enum Location {
  ROOT,
  KEY,
  VALUE,
  ELEMENT,
  ARRAY,
  OBJECT,
}
export enum Stage {
  NOT_STARTED = -1,
  PARSING = 0,
  ENDED = 1,
}

// ===

namespace TokenInfo {
  type _Select<Opt, Key, True, False = never> = Key extends keyof Opt ? (Opt[Key] extends false ? False : True) : False;
  type _DispatchNoEscape<FalseT, TrueT> = { escaped?: undefined } & (
    | { index: FalseT; done: false }
    | { index: TrueT; done: true }
  );
  type _Dispatch<FalseT, TrueT, Escape> =
    | { index: FalseT; done: false; escaped?: undefined }
    | { index: TrueT; done: true; escaped: Escape };
  type _Base = { index: 0; done?: undefined; escaped?: undefined };

  type Whitespace = { category: Category.WHITESPACE; type: Type.WHITESPACE } & _Base;
  type Null = { category: Category.NULL; type: Type.NULL } & _DispatchNoEscape<0 | 1 | 2, 3>;
  type True = { category: Category.BOOLEAN; type: Type.TRUE } & _DispatchNoEscape<0 | 1 | 2, 3>;
  type False = { category: Category.BOOLEAN; type: Type.FALSE } & _DispatchNoEscape<0 | 1 | 2 | 3, 4>;

  type StringStartEnd = { type: Type.STRING_START | Type.STRING_END } & _Base;
  type StringNormal = { type: Type.STRING_NORMAL } & _Base;
  type StringEscape2Start = { type: Type.STRING_ESCAPE_START | Type.STRING_ESCAPE_UNICODE_START } & _Base;
  type StringEscape = { type: Type.STRING_ESCAPE; index: 0; done: true } & {
    escaped: '"' | "\\" | "/" | "\b" | "\f" | "\n" | "\r" | "\t";
  };
  type StringEscapeUnicode = { type: Type.STRING_ESCAPE_UNICODE } & _Dispatch<0 | 1 | 2, 3, string>;
  type String = (StringStartEnd | StringNormal | StringEscape2Start | StringEscape | StringEscapeUnicode) & {
    category: Category.STRING;
  };

  type NumberSign = { type: Type.NUMBER_INTEGER_SIGN | Type.NUMBER_EXPONENT_SIGN };
  type NumberDigit = { type: Type.NUMBER_INTEGER_DIGIT | Type.NUMBER_FRACTION_DIGIT | Type.NUMBER_EXPONENT_DIGIT };
  type NumberStart = { type: Type.NUMBER_FRACTION_START | Type.NUMBER_EXPONENT_START };
  type Number = (NumberSign | NumberDigit | NumberStart) & _Base & { category: Category.NUMBER };

  type Object = {
    category: Category.OBJECT;
    type: Type.OBJECT_START | Type.OBJECT_END | Type.OBJECT_VALUE_START | Type.OBJECT_NEXT;
  } & _Base;
  type Array = { category: Category.ARRAY; type: Type.ARRAY_START | Type.ARRAY_END | Type.ARRAY_NEXT } & _Base;
  type Eof = { category: Category.EOF; type: Type.EOF } & _Base;

  export type StdJsonTokenInfo = Whitespace | Eof | String | Null | True | False | Number | Object | Array;

  // << object >>
  type Extra_IdentifierKey =
    | ({ category: Category.IDENTIFIER; type: Type.IDENTIFIER_ESCAPE_START } & _DispatchNoEscape<0, 1>)
    | ({ category: Category.IDENTIFIER; type: Type.IDENTIFIER_ESCAPE } & _Dispatch<0 | 1 | 2, 3, string>)
    | ({ category: Category.IDENTIFIER; type: Type.IDENTIFIER_NORMAL } & _Base);

  // << string >>
  type Extra_MultilineString = { category: Category.STRING; type: Type.STRING_NEXT_LINE } & _Base;
  type Extra_Json5StringEscape =
    | ({ category: Category.STRING; type: Type.STRING_ESCAPE_HEX_START } & _Base)
    | { category: Category.STRING; type: Type.STRING_ESCAPE; index: 0; done: true; escaped: "\v" | "\x00" | "'" }
    | ({ category: Category.STRING; type: Type.STRING_ESCAPE_HEX } & _Dispatch<0, 1, string>);

  // << number >>
  type Extra_Nan = { category: Category.NUMBER; type: Type.NUMBER_NAN } & _DispatchNoEscape<0 | 1, 2>;
  type Extra_Infinity = { category: Category.NUMBER; type: Type.NUMBER_INFINITY } & _DispatchNoEscape<
    0 | 1 | 2 | 3 | 4 | 5 | 6,
    7
  >;
  type Extra_HexadecimalInteger = { category: Category.NUMBER; type: Type.NUMBER_HEX_START | Type.NUMBER_HEX } & _Base;
  type Extra_OctalInteger = { category: Category.NUMBER; type: Type.NUMBER_OCT_START | Type.NUMBER_OCT } & _Base;
  type Extra_BinaryInteger = { category: Category.NUMBER; type: Type.NUMBER_BIN_START | Type.NUMBER_BIN } & _Base;

  // << comment >>
  type Extra_SingleLineComment = {
    category: Category.COMMENT;
    type: Type.COMMENT_MAY_START | Type.COMMENT_SINGLE_LINE;
  } & _Base;
  type Extra_MultiLineComment = {
    category: Category.COMMENT;
    type: Type.COMMENT_MAY_START | Type.COMMENT_MULTI_LINE | Type.COMMENT_MULTI_LINE_END;
  } & _Base;

  export type JsonTokenInfo<Opt extends JsonOption> =
    | StdJsonTokenInfo
    // << object >>
    | _Select<Opt, "acceptIdentifierKey", Extra_IdentifierKey>
    // << string >>
    | _Select<Opt, "acceptMultilineString", Extra_MultilineString>
    | _Select<Opt, "acceptJson5StringEscape", Extra_Json5StringEscape>
    // << number >>
    | _Select<Opt, "acceptNan", Extra_Nan>
    | _Select<Opt, "acceptInfinity", Extra_Infinity>
    | _Select<Opt, "acceptHexadecimalInteger", Extra_HexadecimalInteger>
    | _Select<Opt, "acceptOctalInteger", Extra_OctalInteger>
    | _Select<Opt, "acceptBinaryInteger", Extra_BinaryInteger>
    // << comment >>
    | _Select<Opt, "acceptSingleLineComment", Extra_SingleLineComment>
    | _Select<Opt, "acceptMultiLineComment", Extra_MultiLineComment>;
}
export type JsonToken<Opt extends JsonOption = JsonOption> = TokenInfo.JsonTokenInfo<Opt> & {
  character: string;
};

export class JsonStreamParserError extends JsonParserError {
  constructor(
    baseMsg: string,
    public character: string,
    public position: number,
    public line: number,
    public column: number
  ) {
    super(baseMsg, `At ${line}:${column}(${position}), Character ${formatChar(character)} - ${baseMsg}`);
    this.name = "StreamJsonParserError";
  }
}

interface JsonTokenFull {
  type: Type;
  index: number;
  done?: boolean;
  escaped?: string;
  character: string;
  category: Category;
}

// ===

const enum ParserError {
  /* << other >> */
  EOF,
  NONWHITESPACE_AFTER_END,
  CONTENT_AFTER_EOF,
  TRAILING_COMMA_FORBIDDEN,
  UNEXPECTED,
  WRONG_BRACKET,
  WRONG_COLON,
  EMPTY_VALUE,
  /* << array >> */
  COMMA_IN_EMPTY_ARRAY,
  /* << object >> */
  BAD_IDENTIFIER_ESCAPE_START,
  BAD_PROPERTY_NAME_IN_OBJECT,
  COMMA_IN_EMPTY_OBJECT,
  EMPTY_VALUE_IN_OBJECT,
  EXPECTED_COLON,
  INVALID_IDENTIFIER,
  INVALID_IDENTIFIER_ESCAPE,
  REPEATED_COLON,
  /* << string >> */
  BAD_ESCAPE_IN_STRING,
  BAD_HEX_ESCAPE_IN_STRING,
  BAD_UNICODE_ESCAPE_IN_STRING,
  CONTROL_CHARACTER_FORBIDDEN_IN_STRING,
  SINGLE_QUOTE_FORBIDDEN,
  /* << number >> */
  EMPTY_EXPONENT_PART,
  EMPTY_FRACTION_PART,
  EMPTY_INTEGER_PART,
  EXPONENT_NOT_ALLOWED,
  FRACTION_NOT_ALLOWED,
  LEADING_ZERO_FORBIDDEN,
  POSITIVE_SIGN_FORBIDDEN,
  UNEXPECTED_IN_NUMBER,
  LONE_DECIMAL_POINT,
  /* << comment >> */
  COMMENT_FORBIDDEN,
  COMMENT_NOT_CLOSED,
}
const PARSER_ERROR_TABLE = [
  /* << other >> */
  "structure broken because of EOF",
  "unexpected non-whitespace character after end of JSON",
  "content after EOF",
  "trailing comma not allowed",
  "unexpected character",
  "wrong bracket",
  "colon only allowed between property name and value",
  "empty JSON value not allowed",
  /* << array >> */
  "empty array with trailing comma not allowed",
  /* << object >> */
  'the escape sequence for an identifier must start with "/u"',
  "property name must be a string",
  "empty object with trailing comma not allowed",
  "unexpected empty value in object",
  "colon expected between property name and value",
  "invalid identifier in JSON string",
  "invalid identifier escape sequence in JSON5 identifier",
  "repeated colon not allowed",
  /* << string >> */
  "bad escape sequence in JSON string",
  "bad hex escape sequence in JSON string",
  "bad Unicode escape sequence in JSON string",
  "control character not allowed in JSON string",
  "single quote not allowed",
  /* << number >> */
  "the exponent part of a number cannot be empty",
  "the fraction part of a number cannot be empty",
  "the integer part of a number cannot be empty",
  "exponent part not allowed in non-decimal number",
  "fraction part not allowed in non-decimal number",
  "leading zero not allowed",
  "positive sign not allowed",
  "unexpected character in number",
  "lone decimal point not allowed",
  /* << comment >> */
  "comment not allowed",
  "comment not closed",
];

const enum InternalState {
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
  STRING_MULTILINE_CR,
  STRING_ESCAPE_HEX,
  NUMBER_INFINITY,
  NUMBER_NAN,
  NUMBER_HEX,
  NUMBER_OCT,
  NUMBER_BIN,
  COMMENT_MAY_START,
  SINGLE_LINE_COMMENT,
  MULTI_LINE_COMMENT,
  MULTI_LINE_COMMENT_MAY_END,
  IDENTIFIER,
  IDENTIFIER_ESCAPE,
}
const enum InternalLocation {
  ROOT_START,
  KEY_FIRST_START,
  KEY_START,
  VALUE_START,
  ELEMENT_FIRST_START,
  ELEMENT_START,
  ROOT_END,
  KEY_END,
  VALUE_END,
  ELEMENT_END,
  EOF,
}

const NEXT_LOCATION_TABLE = [
  InternalLocation.ROOT_END,
  InternalLocation.KEY_END,
  InternalLocation.KEY_END,
  InternalLocation.VALUE_END,
  InternalLocation.ELEMENT_END,
  InternalLocation.ELEMENT_END,
];
const LOCATION_TABLE = [
  Location.ROOT,
  Location.KEY,
  Location.KEY,
  Location.VALUE,
  Location.ELEMENT,
  Location.ELEMENT,
  Location.ROOT,
  Location.KEY,
  Location.VALUE,
  Location.ELEMENT,
  Location.ROOT,
];

const enum NumberState {
  ONLY_SIGN = 0xff,
  ZERO = 0x0,
  NON_LEADING_ZERO = 0x1,
}
const enum NumberFraction {
  DIGIT,
  NOT_YET,
  EMPTY_INTEGER,
}
const enum NumberExponent {
  NOT_YET,
  AFTER_SIGN,
  AFTER_DIGIT,
}

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
const ESCAPE_TABLE2: Record<string, string | undefined> = {
  ...ESCAPE_TABLE,
  "'": "'",
  v: "\v",
  "0": "\x00",
};

const createJsonStreamParserInternal = (option?: JsonOption, init?: any) => {
  option ||= {};
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
  // << other >>
  const acceptEmptyValue = option.acceptEmptyValue;

  init ||= [0, 0, 0, 0, InternalLocation.ROOT_START, InternalState.EMPTY, [], 0, undefined];
  let position: number = init[0];
  let line: number = init[1];
  let column: number = init[2];
  let escape: number = init[3];
  let location: InternalLocation = init[4];
  let state: InternalState = init[5];
  const stack: number[] = init[6];

  let flag: number = init[7];
  let substate: number = init[8];
  const enum Flag {
    MEET_CR = 0x1,
    SINGLE_QUOTE = 0x2,
  }

  const _throw_error = (error: ParserError, u: string) => {
    throw new JsonStreamParserError(PARSER_ERROR_TABLE[error], u, position, line, column);
  };

  const _handleEof = (token: JsonTokenFull) => {
    if (location === InternalLocation.ROOT_START) {
      if (acceptEmptyValue) {
        token.type = Type.EOF;
        location = InternalLocation.ROOT_END;
      } else _throw_error(ParserError.EMPTY_VALUE, "\x00");
    } else if (location === InternalLocation.ROOT_END) {
      location = InternalLocation.EOF;
      token.type = Type.EOF;
    } else _throw_error(ParserError.EOF, "\x00");
  };
  const _handleNumberSeparator = (u: string, token: JsonTokenFull) => {
    state = InternalState.EMPTY;
    location = NEXT_LOCATION_TABLE[location];
    if (u === "\x00") {
      _handleEof(token);
    } else if (u === "}") {
      if (location === InternalLocation.VALUE_END) {
        state = InternalState.EMPTY;
        location = stack.pop()!;
        token.type = Type.OBJECT_END;
      } else _throw_error(ParserError.WRONG_BRACKET, u);
    } else if (u === "]") {
      if (location === InternalLocation.ELEMENT_END) {
        state = InternalState.EMPTY;
        location = stack.pop()!;
        token.type = Type.ARRAY_END;
      } else _throw_error(ParserError.WRONG_BRACKET, u);
    } else if (u === ",") {
      if (location === InternalLocation.VALUE_END) {
        location = InternalLocation.KEY_START;
        token.type = Type.OBJECT_NEXT;
      } else if (location === InternalLocation.ELEMENT_END) {
        location = InternalLocation.ELEMENT_START;
        token.type = Type.ARRAY_NEXT;
      } else _throw_error(ParserError.UNEXPECTED, u);
    } else if (u === "/") {
      if (acceptSingleLineComment || acceptMultiLineComment) {
        state = InternalState.COMMENT_MAY_START;
        token.type = Type.COMMENT_MAY_START;
      } else _throw_error(ParserError.COMMENT_FORBIDDEN, u);
    } else token.type = Type.WHITESPACE;
  };
  const _handleEmpty = (u: string, token: JsonTokenFull) => {
    if (isWhitespace(u, acceptJson5Whitespace)) {
      token.type = Type.WHITESPACE;
      return;
    } else if (u === "\x00") {
      _handleEof(token);
      return;
    } else if (u === "/") {
      if (acceptSingleLineComment || acceptMultiLineComment) {
        state = InternalState.COMMENT_MAY_START;
        token.type = Type.COMMENT_MAY_START;
      } else _throw_error(ParserError.COMMENT_FORBIDDEN, u);
      return;
    } else if (location === InternalLocation.ROOT_END) _throw_error(ParserError.NONWHITESPACE_AFTER_END, u);
    switch (location) {
      case InternalLocation.KEY_FIRST_START:
      case InternalLocation.KEY_START:
        if (u === '"') {
          state = InternalState.STRING;
          flag &= ~Flag.SINGLE_QUOTE;
          token.type = Type.STRING_START;
        } else if (u === "'") {
          if (!acceptSingleQuote) _throw_error(ParserError.SINGLE_QUOTE_FORBIDDEN, u);
          state = InternalState.STRING;
          flag |= Flag.SINGLE_QUOTE;
          token.type = Type.STRING_START;
        } else {
          if (acceptIdentifierKey) {
            if (isIdentifierStart(u)) {
              state = InternalState.IDENTIFIER;
              token.type = Type.IDENTIFIER_NORMAL;
              return;
            } else if (u === "\\") {
              state = InternalState.IDENTIFIER_ESCAPE;
              substate = 0;
              token.type = Type.IDENTIFIER_ESCAPE_START;
              return;
            }
          }
          if (u === "}") {
            if (location === InternalLocation.KEY_FIRST_START || acceptTrailingCommaInObject) {
              location = stack.pop()!;
              token.type = Type.OBJECT_END;
            } else _throw_error(ParserError.COMMA_IN_EMPTY_OBJECT, u);
            return;
          }
          _throw_error(ParserError.BAD_PROPERTY_NAME_IN_OBJECT, u);
        }
        break;
      case InternalLocation.KEY_END:
        if (u === ":") {
          location = InternalLocation.VALUE_START;
          token.type = Type.OBJECT_VALUE_START;
        } else _throw_error(ParserError.EXPECTED_COLON, u);
        break;
      case InternalLocation.VALUE_END:
        if (u === ",") {
          location = InternalLocation.KEY_START;
          token.type = Type.OBJECT_NEXT;
        } else if (u === "}") {
          location = stack.pop()!;
          token.type = Type.OBJECT_END;
        } else if (u === "]") _throw_error(ParserError.WRONG_BRACKET, u);
        else _throw_error(ParserError.UNEXPECTED, u);
        break;
      case InternalLocation.ELEMENT_END:
        if (u === ",") {
          location = InternalLocation.ELEMENT_START;
          token.type = Type.ARRAY_NEXT;
        } else if (u === "]") {
          location = stack.pop()!;
          token.type = Type.ARRAY_END;
        } else if (u === "}") _throw_error(ParserError.WRONG_BRACKET, u);
        else _throw_error(ParserError.UNEXPECTED, u);
        break;

      default:
        switch (u) {
          case '"':
            state = InternalState.STRING;
            flag &= ~Flag.SINGLE_QUOTE;
            token.type = Type.STRING_START;
            break;
          case "'":
            if (!acceptSingleQuote) _throw_error(ParserError.SINGLE_QUOTE_FORBIDDEN, u);
            state = InternalState.STRING;
            flag |= Flag.SINGLE_QUOTE;
            token.type = Type.STRING_START;
            break;

          case "]":
            if (location === InternalLocation.ELEMENT_FIRST_START) {
              location = stack.pop()!;
              token.type = Type.ARRAY_END;
            } else if (location === InternalLocation.ELEMENT_START) {
              if (acceptTrailingCommaInArray) {
                location = stack.pop()!;
                token.type = Type.ARRAY_END;
              } else _throw_error(ParserError.COMMA_IN_EMPTY_ARRAY, u);
            } else {
              _throw_error(ParserError.WRONG_BRACKET, u);
            }
            break;
          case "}":
            _throw_error(ParserError.WRONG_BRACKET, u);

          case "[":
            stack.push(
              location === InternalLocation.ROOT_START
                ? InternalLocation.ROOT_END
                : location === InternalLocation.VALUE_START
                  ? InternalLocation.VALUE_END
                  : InternalLocation.ELEMENT_END
            );
            location = InternalLocation.ELEMENT_FIRST_START;
            token.type = Type.ARRAY_START;
            break;
          case "{":
            stack.push(
              location === InternalLocation.ROOT_START
                ? InternalLocation.ROOT_END
                : location === InternalLocation.VALUE_START
                  ? InternalLocation.VALUE_END
                  : InternalLocation.ELEMENT_END
            );
            location = InternalLocation.KEY_FIRST_START;
            token.type = Type.OBJECT_START;
            break;

          case "+":
            if (!acceptPositiveSign) _throw_error(ParserError.POSITIVE_SIGN_FORBIDDEN, u);
          case "-":
            state = InternalState.NUMBER;
            substate = NumberState.ONLY_SIGN;
            token.type = Type.NUMBER_INTEGER_SIGN;
            break;

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
            state = InternalState.NUMBER;
            substate = +(u !== "0");
            token.type = Type.NUMBER_INTEGER_DIGIT;
            break;
          case ".":
            if (!acceptEmptyInteger) _throw_error(ParserError.EMPTY_INTEGER_PART, u);
            state = InternalState.NUMBER_FRACTION;
            substate = NumberFraction.EMPTY_INTEGER;
            token.type = Type.NUMBER_FRACTION_START;
            break;
          case "N":
            if (!acceptNan) _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
            state = InternalState.NUMBER_NAN;
            substate = 1;
            token.type = Type.NUMBER_NAN;
            token.done = false;
            break;
          case "I":
            if (!acceptInfinity) _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
            state = InternalState.NUMBER_INFINITY;
            substate = 1;
            token.type = Type.NUMBER_INFINITY;
            token.done = false;
            break;

          case "n":
            state = InternalState.NULL;
            substate = 1;
            token.type = Type.NULL;
            token.done = false;
            break;
          case "t":
            state = InternalState.TRUE;
            substate = 1;
            token.type = Type.TRUE;
            token.done = false;
            break;
          case "f":
            state = InternalState.FALSE;
            substate = 1;
            token.type = Type.FALSE;
            token.done = false;
            break;

          case ":":
            if (location === InternalLocation.VALUE_START) _throw_error(ParserError.REPEATED_COLON, u);
            else _throw_error(ParserError.WRONG_COLON, u);
          case ",":
            if (location === InternalLocation.ELEMENT_FIRST_START) _throw_error(ParserError.COMMA_IN_EMPTY_ARRAY, u);
            else if (location === InternalLocation.ELEMENT_START) _throw_error(ParserError.TRAILING_COMMA_FORBIDDEN, u);
            else if (location === InternalLocation.VALUE_START) _throw_error(ParserError.EMPTY_VALUE_IN_OBJECT, u);
            else _throw_error(ParserError.UNEXPECTED, u);
          default:
            _throw_error(ParserError.UNEXPECTED, u);
        }
    }
  };
  const _step = (u: string, token: JsonTokenFull) => {
    token.done = undefined;
    token.index = 0;
    token.escaped = undefined;
    token.character = u;
    if (location === InternalLocation.EOF) _throw_error(ParserError.CONTENT_AFTER_EOF, u);
    switch (state) {
      case InternalState.EMPTY:
        _handleEmpty(u, token);
        break;
      case InternalState.NULL:
        if (u !== "null"[substate]) _throw_error(ParserError.UNEXPECTED, u);
        token.type = Type.NULL;
        token.index = substate;
        if ((token.done = ++substate === 4)) {
          state = InternalState.EMPTY;
          location = NEXT_LOCATION_TABLE[location];
        }
        break;
      case InternalState.FALSE:
        if (u !== "false"[substate]) _throw_error(ParserError.UNEXPECTED, u);
        token.type = Type.FALSE;
        token.index = substate;
        if ((token.done = ++substate === 5)) {
          state = InternalState.EMPTY;
          location = NEXT_LOCATION_TABLE[location];
        }
        break;
      case InternalState.TRUE:
        if (u !== "true"[substate]) _throw_error(ParserError.UNEXPECTED, u);
        token.type = Type.TRUE;
        token.index = substate;
        if ((token.done = ++substate === 4)) {
          state = InternalState.EMPTY;
          location = NEXT_LOCATION_TABLE[location];
        }
        break;

      case InternalState.NUMBER_INFINITY:
        if (u !== "Infinity"[substate]) _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        token.type = Type.NUMBER_INFINITY;
        token.index = substate;
        if ((token.done = ++substate === 8)) {
          state = InternalState.EMPTY;
          location = NEXT_LOCATION_TABLE[location];
        }
        break;
      case InternalState.NUMBER_NAN:
        if (u !== "NaN"[substate]) _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        token.type = Type.NUMBER_NAN;
        token.index = substate;
        if ((token.done = ++substate === 3)) {
          state = InternalState.EMPTY;
          location = NEXT_LOCATION_TABLE[location];
        }
        break;

      case InternalState.STRING_MULTILINE_CR:
        if (u === "\n") {
          state = InternalState.STRING;
          token.type = Type.STRING_NEXT_LINE;
          break;
        }
      /* fallthrough */
      case InternalState.STRING:
        if (u === (flag & Flag.SINGLE_QUOTE ? "'" : '"')) {
          location = NEXT_LOCATION_TABLE[location];
          state = InternalState.EMPTY;
          token.type = Type.STRING_END;
        } else if (u === "\\") {
          state = InternalState.STRING_ESCAPE;
          token.type = Type.STRING_ESCAPE_START;
        } else if (u === "\x00") _throw_error(ParserError.EOF, u);
        else if (isControl(u)) _throw_error(ParserError.CONTROL_CHARACTER_FORBIDDEN_IN_STRING, u);
        else token.type = Type.STRING_NORMAL;
        break;
      case InternalState.STRING_ESCAPE:
        if (u === "u") {
          state = InternalState.STRING_UNICODE;
          substate = 0;
          escape = 0;
          token.type = Type.STRING_ESCAPE_UNICODE_START;
          return;
        }
        {
          const u2 = acceptJson5StringEscape ? ESCAPE_TABLE2[u] : ESCAPE_TABLE[u];
          if (u2 !== undefined) {
            state = InternalState.STRING;
            token.type = Type.STRING_ESCAPE;
            token.done = true;
            token.escaped = u2;
            break;
          }
        }
        if (acceptMultilineString && isNextLine(u)) {
          state = u === "\r" ? InternalState.STRING_MULTILINE_CR : InternalState.STRING;
          token.type = Type.STRING_NEXT_LINE;
        } else if (acceptJson5StringEscape && u === "x") {
          state = InternalState.STRING_ESCAPE_HEX;
          substate = 0;
          escape = 0;
          token.type = Type.STRING_ESCAPE_HEX_START;
        } else _throw_error(ParserError.BAD_ESCAPE_IN_STRING, u);
        break;
      case InternalState.STRING_UNICODE:
        if (!isHexDigit(u)) _throw_error(ParserError.BAD_UNICODE_ESCAPE_IN_STRING, u);
        escape = (escape << 4) | hexDigit(u);
        token.type = Type.STRING_ESCAPE_UNICODE;
        token.index = substate;
        if ((token.done = ++substate === 4)) {
          state = InternalState.STRING;
          token.escaped = String.fromCharCode(escape);
        }
        break;
      case InternalState.STRING_ESCAPE_HEX:
        if (!isHexDigit(u)) _throw_error(ParserError.BAD_HEX_ESCAPE_IN_STRING, u);
        escape = (escape << 4) | hexDigit(u);
        token.type = Type.STRING_ESCAPE_HEX;
        token.index = substate;
        if ((token.done = ++substate === 2)) {
          state = InternalState.STRING;
          token.escaped = String.fromCharCode(escape);
        }
        break;

      case InternalState.NUMBER:
        if (u >= "0" && u <= "9") {
          if (substate === NumberState.ZERO) _throw_error(ParserError.LEADING_ZERO_FORBIDDEN, u);
          else {
            if (substate === NumberState.ONLY_SIGN)
              substate = u === "0" ? NumberState.ZERO : NumberState.NON_LEADING_ZERO;
            token.type = Type.NUMBER_INTEGER_DIGIT;
          }
        } else if (u === ".") {
          if (substate === NumberState.ONLY_SIGN && !acceptEmptyInteger)
            _throw_error(ParserError.EMPTY_INTEGER_PART, u);
          else {
            state = InternalState.NUMBER_FRACTION;
            substate = substate === NumberState.ONLY_SIGN ? NumberFraction.EMPTY_INTEGER : NumberFraction.NOT_YET;
            token.type = Type.NUMBER_FRACTION_START;
          }
        } else if (substate === NumberState.ONLY_SIGN) {
          if (acceptInfinity && u === "I") {
            state = InternalState.NUMBER_INFINITY;
            substate = 1;
            token.type = Type.NUMBER_INFINITY;
          } else if (acceptNan && u === "N") {
            state = InternalState.NUMBER_NAN;
            substate = 1;
            token.type = Type.NUMBER_NAN;
          } else _throw_error(ParserError.EMPTY_INTEGER_PART, u);
        } else {
          if (substate === NumberState.ZERO) {
            if (acceptHexadecimalInteger && (u === "x" || u === "X")) {
              state = InternalState.NUMBER_HEX;
              substate = 0;
              token.type = Type.NUMBER_HEX_START;
              break;
            } else if (acceptOctalInteger && (u === "o" || u === "O")) {
              state = InternalState.NUMBER_OCT;
              substate = 0;
              token.type = Type.NUMBER_OCT_START;
              break;
            } else if (acceptBinaryInteger && (u === "b" || u === "B")) {
              state = InternalState.NUMBER_BIN;
              substate = 0;
              token.type = Type.NUMBER_BIN_START;
              break;
            }
          }

          if (u === "e" || u === "E") {
            state = InternalState.NUMBER_EXPONENT;
            substate = NumberExponent.NOT_YET;
            token.type = Type.NUMBER_EXPONENT_START;
          } else if (isNumberSeparator(u, acceptJson5Whitespace)) _handleNumberSeparator(u, token);
          else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        }
        break;
      case InternalState.NUMBER_FRACTION:
        if (u >= "0" && u <= "9") {
          substate = NumberFraction.DIGIT;
          token.type = Type.NUMBER_FRACTION_DIGIT;
        } else if (substate !== NumberFraction.DIGIT && !acceptEmptyFraction)
          _throw_error(ParserError.EMPTY_FRACTION_PART, u);
        else if (substate === NumberFraction.EMPTY_INTEGER) _throw_error(ParserError.LONE_DECIMAL_POINT, u);
        else if (u === "e" || u === "E") {
          state = InternalState.NUMBER_EXPONENT;
          substate = NumberExponent.NOT_YET;
          token.type = Type.NUMBER_EXPONENT_START;
        } else if (isNumberSeparator(u, acceptJson5Whitespace)) _handleNumberSeparator(u, token);
        else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        break;
      case InternalState.NUMBER_EXPONENT:
        if (u === "+" || u === "-") {
          if (substate === NumberExponent.NOT_YET) {
            substate = NumberExponent.AFTER_SIGN;
            token.type = Type.NUMBER_EXPONENT_SIGN;
          } else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        } else if (u >= "0" && u <= "9") {
          substate = NumberExponent.AFTER_DIGIT;
          token.type = Type.NUMBER_EXPONENT_DIGIT;
        } else if (substate !== NumberExponent.AFTER_DIGIT) {
          _throw_error(ParserError.EMPTY_EXPONENT_PART, u);
        } else if (isNumberSeparator(u, acceptJson5Whitespace)) {
          _handleNumberSeparator(u, token);
        } else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        break;
      case InternalState.NUMBER_HEX:
        if (isHexDigit(u)) {
          substate = 1;
          token.type = Type.NUMBER_HEX;
        } else if (u === ".") _throw_error(ParserError.FRACTION_NOT_ALLOWED, u);
        else if (!substate) _throw_error(ParserError.EMPTY_INTEGER_PART, u);
        else if (isNumberSeparator(u, acceptJson5Whitespace)) _handleNumberSeparator(u, token);
        else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        break;
      case InternalState.NUMBER_OCT:
        if (u >= "0" && u <= "7") {
          substate = 1;
          token.type = Type.NUMBER_OCT;
        } else if (u === "e" || u === "E") _throw_error(ParserError.EXPONENT_NOT_ALLOWED, u);
        else if (u === ".") _throw_error(ParserError.FRACTION_NOT_ALLOWED, u);
        else if (!substate) _throw_error(ParserError.EMPTY_INTEGER_PART, u);
        else if (isNumberSeparator(u, acceptJson5Whitespace)) _handleNumberSeparator(u, token);
        else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        break;
      case InternalState.NUMBER_BIN:
        if (u === "0" || u === "1") {
          substate = 1;
          token.type = Type.NUMBER_BIN;
        } else if (u === "e" || u === "E") _throw_error(ParserError.EXPONENT_NOT_ALLOWED, u);
        else if (u === ".") _throw_error(ParserError.FRACTION_NOT_ALLOWED, u);
        else if (!substate) _throw_error(ParserError.EMPTY_INTEGER_PART, u);
        else if (isNumberSeparator(u, acceptJson5Whitespace)) _handleNumberSeparator(u, token);
        else _throw_error(ParserError.UNEXPECTED_IN_NUMBER, u);
        break;

      case InternalState.COMMENT_MAY_START:
        if (acceptSingleLineComment && u === "/") {
          state = InternalState.SINGLE_LINE_COMMENT;
          token.type = Type.COMMENT_SINGLE_LINE;
        } else if (acceptMultiLineComment && u === "*") {
          state = InternalState.MULTI_LINE_COMMENT;
          token.type = Type.COMMENT_MULTI_LINE;
        } else _throw_error(ParserError.COMMENT_FORBIDDEN, u);
        break;
      case InternalState.SINGLE_LINE_COMMENT:
        if (isNextLine(u)) state = InternalState.EMPTY;
        if (u === "\x00") {
          state = InternalState.EMPTY;
          _handleEof(token);
        } else token.type = Type.COMMENT_SINGLE_LINE;
        break;
      case InternalState.MULTI_LINE_COMMENT:
        if (u === "\x00") _throw_error(ParserError.COMMENT_NOT_CLOSED, u);
        if (u === "*") state = InternalState.MULTI_LINE_COMMENT_MAY_END;
        token.type = Type.COMMENT_MULTI_LINE;
        break;
      case InternalState.MULTI_LINE_COMMENT_MAY_END:
        if (u === "\x00") _throw_error(ParserError.COMMENT_NOT_CLOSED, u);
        else if (u === "/") {
          state = InternalState.EMPTY;
          token.type = Type.COMMENT_MULTI_LINE_END;
        } else {
          if (u !== "*") state = InternalState.MULTI_LINE_COMMENT;
          token.type = Type.COMMENT_MULTI_LINE;
        }
        break;

      case InternalState.IDENTIFIER:
        if (u === ":") {
          location = InternalLocation.VALUE_START;
          state = InternalState.EMPTY;
          token.type = Type.OBJECT_VALUE_START;
        } else if (isWhitespace(u, acceptJson5Whitespace)) {
          location = InternalLocation.KEY_END;
          state = InternalState.EMPTY;
          token.type = Type.WHITESPACE;
        } else if (isIdentifierNext(u)) {
          token.type = Type.IDENTIFIER_NORMAL;
        } else if (u === "\\") {
          state = InternalState.IDENTIFIER_ESCAPE;
          substate = 0;
          token.type = Type.IDENTIFIER_ESCAPE_START;
        } else _throw_error(ParserError.INVALID_IDENTIFIER, u);
        break;
      case InternalState.IDENTIFIER_ESCAPE:
        if (substate === 0) {
          if (u === "u") {
            state = InternalState.IDENTIFIER_ESCAPE;
            substate = 1;
            escape = 0;
            token.type = Type.IDENTIFIER_ESCAPE_START;
            token.index = 1;
            token.done = true;
          } else _throw_error(ParserError.BAD_IDENTIFIER_ESCAPE_START, u);
        } else {
          if (isHexDigit(u)) {
            escape = (escape << 4) | hexDigit(u);
            token.type = Type.IDENTIFIER_ESCAPE;
            token.index = substate - 1;
            if ((token.done = ++substate === 5)) {
              state = InternalState.IDENTIFIER;
              token.escaped = String.fromCharCode(escape);
            }
          } else _throw_error(ParserError.INVALID_IDENTIFIER_ESCAPE, u);
        }
    }
  };

  const feedOneTo = (dest: object, c: string): JsonToken => {
    _step(c, dest as any);
    (dest as JsonTokenFull).category = (dest as JsonTokenFull).type >> TYPE_SHIFT.v;
    if (flag & Flag.MEET_CR) {
      if (c !== "\n") {
        ++line;
        column = 0;
      }
      flag &= ~Flag.MEET_CR;
    }
    if (c !== "\x00") {
      ++position;
      if (isNextLine(c)) {
        if (c === "\r") {
          ++column;
          flag |= Flag.MEET_CR;
        } else {
          ++line;
          column = 0;
        }
      } else ++column;
    }
    return dest as any as JsonToken;
  };

  return {
    feedOneTo,
    feed(s: string) {
      const tokens: JsonToken[] = [];
      for (const c of s) tokens.push(this.feedOneTo({}, c));
      return tokens;
    },
    end() {
      return feedOneTo({}, "\x00");
    },

    get line() {
      return line;
    },
    get column() {
      return column;
    },
    get position() {
      return position;
    },
    get location() {
      return LOCATION_TABLE[location];
    },
    get stage() {
      if (state !== InternalState.EMPTY) return Stage.PARSING;
      else if (location === InternalLocation.ROOT_START) return Stage.NOT_STARTED;
      else if (location === InternalLocation.EOF || location === InternalLocation.ROOT_END) return Stage.ENDED;
      else return Stage.PARSING;
    },

    copy() {
      return createJsonStreamParserInternal(option, [
        position,
        line,
        column,
        escape,
        location,
        state,
        stack.slice(),
        flag,
        substate,
      ]);
    },
  };
};

// ===

export interface JsonStreamParserBase {
  get position(): number;
  /** Line number (starting from 0) */
  get line(): number;
  /** Column number (starting from 0) */
  get column(): number;

  get stage(): Stage;
}
export interface JsonStreamParser<Opt extends JsonOption = JsonOption> extends JsonStreamParserBase {
  feedOneTo: (destToken: object, c: string) => JsonToken<Opt>;
  feed(s: string): JsonToken<Opt>[];
  end(): JsonToken<Opt>;
  copy(): JsonStreamParser<Opt>;
  get location(): Location;
}
export const createJsonStreamParser = <Opt extends JsonOption = {}>(option?: Opt) => {
  return createJsonStreamParserInternal(option) as JsonStreamParser<Opt>;
};

const patchObject = <Dest extends object, Src extends object, Keys extends KeyT[], KeyT extends keyof Src>(
  dest: Dest,
  src: Src,
  keys: Keys
): Dest & Pick<Src, KeyT> => {
  for (const key of keys) Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key)!);
  return dest as any;
};
export const patchJsonStreamParserBase = <T extends {}, Opt extends JsonOption = JsonOption>(
  target: T,
  parser: JsonStreamParser<Opt>
): JsonStreamParserBase & Omit<T, "stage" | "position" | "line" | "column"> => {
  return patchObject(target, parser, ["stage", "position", "line", "column"]);
};

export const jsonStreamParse = <Opt extends JsonOption = {}>(s: string, option?: Opt): JsonToken<Opt>[] => {
  const parser = createJsonStreamParser(option);
  const ret = parser.feed(s);
  ret.push(parser.end());
  return ret;
};
