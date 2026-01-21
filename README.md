# A Streaming and Event-driven JSON Parser

[English](./README.md) [简体中文](./README.zh.md)

This library is currently in Alpha version, and there may be many API changes.

## Features

- no runtime dependencies
- supports JSON5 and JSONC
- stream parser requires minimal memory when no events are triggered

## Installation

### Installation via [npm](https://npmjs.org/)

```sh
npm install efjson
```

## Example

### Stream Parsing

```ts
import { jsonStreamParse } from "efjson";

const json = `{
"null":null,"true":true,"false":false,
"string":"string,\\"escape\\",\\uD83D\\uDE00,😊",
"integer":12,"negative":-12,"fraction":12.34,"exponent":1.234e+2,
"array":["1st element",{"object":"nesting"}],
"object":{"1st":[],"2st":{}}
}`;
for (const token of jsonStreamParse(json)) console.log(token);
```

### Event Response

```ts
import { jsonEventParse } from "efjson";

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
  object: {
    set(key, value) {
      console.log(key, value);
    },
  },
});
```

### Normal Parsing

```ts
import { jsonNormalParse } from "efjson";

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

console.log(jsonNormalParse(json));
```

## References

JSON Specification: [RFC 4627 on JSON](https://www.ietf.org/rfc/rfc4627.txt)

JSON State Diagram: [JSON](https://www.json.org/)

JSON5 Specification: [The JSON5 Data Interchange Format](https://spec.json5.org/)

JSON Pointer: [JavaScript Object Notation (JSON) Pointer](https://datatracker.ietf.org/doc/html/rfc6901)

Relative JSON Pointers: [Relative JSON Pointers](https://datatracker.ietf.org/doc/html/draft-bhutton-relative-json-pointer-00)
