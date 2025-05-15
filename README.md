# A Streaming and Event-driven JSON Parser

[English](./README.md) [简体中文](./README_zh_CN.md)

## Features

- no dependencies
- supports JSON5 and JSONC
- stream parser requires minimal memory when no events are triggered

The state diagram for stream parsing JSON can be found in [The Diagram of JSON Token State Transition](./doc/stream_token/README.md).

## Installation

### Installation via [npm](https://npmjs.org/)

```sh
npm install efjson
```

### Using Source Code Directly

Copy `efjson.ts` into your project.

If you need a minimal build, the `dist` folder also provides `efjson.min.mjs` (some private variables are renamed for better compression).

## Example

### Stream Parsing

```ts
import { createJsonStreamParser } from "efjson";

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
for(const c of json) 
  console.log(parser.feed(c));
console.log(parser.end());
```
### Event Response

```ts
import { jsonEventParse } from "./efjson";

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

jsonEventParse(json, {
  type: "object",
  set(key, value) {
    console.log(key, value);
  },
});

```

## References

JSON Specification: [RFC 4627 on JSON](https://www.ietf.org/rfc/rfc4627.txt)

JSON State Diagram: [JSON](https://www.json.org/)

JSON5 Specification: [The JSON5 Data Interchange Format](https://spec.json5.org/)
