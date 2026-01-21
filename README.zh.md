# efjson: 基于流的、事件响应式的 JSON 解析器

[English](./README.md) [简体中文](./README.zh.md)

当前此库仍在Alpha版本，可能存在大量API更改。

## 特色

- 无运行时依赖
- 支持 JSON5 和 JSONC
- 在无事件的情况下，流解析器只需要极少的内存

## 安装

### 通过[npm](https://npmjs.org/)安装

```sh
npm install efjson
```

## 例子

### 流式解析

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

### 事件响应

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

### 普通解析

```ts
import { jsonGeneralParse } from "efjson";

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

console.log(jsonGeneralParse(json));
```

## 参阅

JSON 规范：[RFC 4627 on Json](https://www.ietf.org/rfc/rfc4627.txt)

JSON 状态图：[JSON](https://www.json.org/)

JSON5 规范：[The JSON5 Data Interchange Format](https://spec.json5.org/)

JSON 指针: [JavaScript Object Notation (JSON) Pointer](https://datatracker.ietf.org/doc/html/rfc6901)

相对 JSON 指针: [Relative JSON Pointers](https://datatracker.ietf.org/doc/html/draft-bhutton-relative-json-pointer-00)
