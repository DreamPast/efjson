# efjson: 基于流的、事件响应式的 JSON 解析器

[English](./README.md) [简体中文](./README_zh_CN.md)

## 特色

- 无运行时依赖
- 支持 JSON5 和 JSONC
- 在无事件的情况下，流解析器只需要极少的内存

流式解析 JSON 的状态图可以参考[JSON Token 状态转移图](./doc/stream_token/README.md)

## 安装

### 通过[npm](https://npmjs.org/)安装

```sh
npm install efjson
```

## 例子

### 流式解析

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
// 你可以传递任何长度的字符串到parser
for (const c of json) console.log(parser.feed(c));
console.log(parser.end());
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
  type: "object",
  set(key, value) {
    console.log(key, value);
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
