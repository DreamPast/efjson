export class JsonParserError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonParserError";
  }
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
export const JSONC_OPTION = Object.freeze({
  // << comment >>
  acceptSingleLineComment: true,
  accpetMultiLineComment: true,
});
export const JSON5_OPTION = Object.freeze({
  ...JSONC_OPTION,

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
});
export const JSON_FULL_OPTION = Object.freeze({
  ...JSON5_OPTION,
  // << number >>
  acceptOctalInteger: true,
  acceptBinaryInteger: true,
});
