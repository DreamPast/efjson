#  efjson: 基于流的JSON解析器

[English](./README.md) [简体中文](./README_zh_CN.md)

## 特色

- 无依赖
- 在无事件的情况下，流解析器只需要极少的内存

流式解析JSON的状态图可以参考[JSON Token状态转义图](./doc/stream_token/README.md)

## 安装

拷贝`efjson.ts`到项目中。

## 例子

### 流式解析

```ts
import { JsonStreamParser } from "efjson";

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
const parser = new JsonStreamParser();
// you can feed any length of string to the parser
for(const c of json) 
  console.log(parser.feed(c));
console.log(parser.end());
```

## 参阅

JSON规范：[RFC 4627 on Json](https://www.ietf.org/rfc/rfc4627.txt)

JSON状态图：[JSON](https://www.json.org/)

JSON5规范：[The JSON5 Data Interchange Format](https://spec.json5.org/)
