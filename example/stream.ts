import { createJsonStreamParser } from "../efjson";

const json = `
{
  "null": null,
  "true": true,
  "false": false,

  "string": "string",
  "string_with_escape": "string with \\"escape\\"",
  "string_with_unicode_escape": "string with \\uD83D\\uDE00",
  "string_with_unicode": "string with 😊",

  "integer": 1234,
  "negative": -1234,
  "number": 1234.5678,
  "number_with_exponent": 1.234e2,

  "array": [
    "this is the first element",
    {
      "object": "a nesting object"
    }
  ],
  "object": {
    "1st": [],
    "2st": {}
  }
}
`;
const parser = createJsonStreamParser();
// you can feed any length of string to the parser
for (const c of json) console.log(parser.feed(c));
console.log(parser.end());
