import {
  createJsonStreamParser,
  jsonEventParse,
  jsonStreamParse,
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
