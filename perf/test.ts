import {
  createJsonStreamParser,
  jsonEventParse,
  jsonStreamParse,
  JsonToken,
} from "../efjson";

const s1 = `[${"100,".repeat(1000).slice(0, -1)}],`;
const s = `[${s1.repeat(10000).slice(0, -1)}]`;

const measure = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
const measurePrint = (fn: () => void, label: string = "") =>
  console.log(label, measure(fn));

measurePrint(() => JSON.parse(s), "JSON.parse");

measurePrint(() => {
  const parser = createJsonStreamParser();
  const token: JsonToken = {} as any;
  for (const c of s) parser.feedOneTo(token, c);
}, "donnot save token");

measurePrint(() => {
  jsonStreamParse(s);
}, "save token");

measurePrint(() => {
  jsonEventParse(s, { type: "array", save() {} });
}, "event");
