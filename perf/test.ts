import { createJsonStreamParser, jsonEventParse, jsonNormalParse, jsonStreamParse } from "efjson";

const measure = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
const measurePrint = (fn: () => void, label: string = "") => console.log(label, measure(fn));

{
  const s1 = `[${"100,".repeat(1000).slice(0, -1)}],`;
  const s = `[${s1.repeat(5000).slice(0, -1)}]`;
  console.log("======Array");

  measurePrint(() => JSON.parse(s), "JSON.parse");

  measurePrint(() => {
    const parser = createJsonStreamParser();
    const token: object = {};
    for (const c of s) parser.feedOneTo(token, c);
  }, "stream (not save token)");

  measurePrint(() => {
    jsonStreamParse(s);
  }, "steam (save token)");

  measurePrint(() => {
    jsonEventParse(s, { type: "array", save() {} });
  }, "event (save)");

  measurePrint(() => {
    jsonEventParse(s, { type: "array" });
  }, "event (not save)");

  measurePrint(() => {
    jsonNormalParse(s);
  }, "normal");
}
{
  const TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  console.log("======Object");

  const gen = (val: number) => {
    const list: string[] = [];
    while (val) {
      list.push(TABLE[val % TABLE.length]);
      val = Math.floor(val / TABLE.length);
    }
    return list.join("");
  };
  const genList = (len: number) => {
    const ret: string[] = [];
    for (let i = 0; i < len; ++i) ret.push(gen(i));
    return ret;
  };

  const s1 = `{${genList(500)
    .map((item) => `"${item}":"${item}"`)
    .join(",")}}`;
  const s = `{${genList(5000)
    .map((item) => `"${item}":${s1}`)
    .join(",")}}`;

  measurePrint(() => JSON.parse(s), "JSON.parse");

  measurePrint(() => {
    const parser = createJsonStreamParser();
    const token: object = {};
    for (const c of s) parser.feedOneTo(token, c);
  }, "stream (not save token)");

  measurePrint(() => {
    jsonStreamParse(s);
  }, "steam (save token)");

  measurePrint(() => {
    jsonEventParse(s, { type: "object", save() {} });
  }, "event (save)");

  measurePrint(() => {
    jsonEventParse(s, { type: "object" });
  }, "event (not save)");

  measurePrint(() => {
    jsonNormalParse(s);
  }, "normal");
}
{
  const list = ['"'];
  for (let i = 0; i < 10000000; ++i) list.push(String.fromCodePoint((Math.random() * (0x10ffff - 0xff) + 0xff) | 0));
  list.push('"');
  const s = list.join("");
  console.log("======String");

  measurePrint(() => JSON.parse(s), "JSON.parse");

  measurePrint(() => {
    const parser = createJsonStreamParser();
    const token: object = {};
    for (const c of s) parser.feedOneTo(token, c);
  }, "stream (not save token)");

  measurePrint(() => {
    jsonStreamParse(s);
  }, "steam (save token)");

  measurePrint(() => {
    jsonEventParse(s, { type: "string", save() {} });
  }, "event (save)");

  measurePrint(() => {
    jsonEventParse(s, { type: "string" });
  }, "event (not save)");

  measurePrint(() => {
    jsonNormalParse(s);
  }, "normal");
}
