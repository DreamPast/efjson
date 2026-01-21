import { Category, jsonStreamParse, Type } from "efjson";

const json = `{
"null":null,"true":true,"false":false,
"string":"string,\\"escape\\",\\uD83D\\uDE00,😊",
"integer":12,"negative":-12,"fraction":12.34,"exponent":1.234e+2,
"array":["1st element",{"object":"nesting"}],
"object":{"1st":[],"2st":{}}
}`;

const HEADER = [
  "Char".padStart(6),
  "Category".padStart(11),
  "Type".padStart(28),
  "Idx".padStart(4),
  "Done".padStart(5),
  "Escape".padStart(7),
];
console.log(HEADER.join(""));
console.log("-".repeat(6 + 11 + 28 + 4 + 5 + 7));

const formatChar = (c: string) =>
  /\P{C}/u.test(c) ? `'${c}'` : `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;

for (const token of jsonStreamParse(json)) {
  const category = Category[token.category];
  const type = Type[token.type];
  const character = formatChar(token.character);
  const index = token.index.toString();
  const done = token.done === undefined ? "*" : token.done ? "T" : "F";
  const escaped = token.escaped !== undefined ? formatChar(token.escaped) : "*";

  const row = [
    character.padStart(6),
    category.padStart(11),
    type.padStart(28),
    index.padStart(4),
    done.padStart(5),
    escaped.padStart(7),
  ];
  console.log(row.join(""));
}
