import "./position";

import "./number";
import "./string";

import { JSON5_OPTION, jsonStreamParse } from "../efjson";
import { checkError } from "./util";

/* JSON5 "unquoted" is not supported yet */
const str = `{
  // comments
  "comments" /* comment here */: /* or here */ "a" /* and here */, /**/
  'singleQuotes': 'I can use "double quotes" here',
  "lineBreaks": "Look, Mom! \\
No \\\\n's! \\x01",
  "hexadecimal": 0xdecaf,
  "leadingDecimalPoint": .8675309, "andTrailing": 8675309.,
  "positiveSign": +1,
  "trailingComma": 'in objects', "andIn": ['arrays',],
  "backwardsCompatible": "with JSON",
  "nan": NaN,
  "infinity": \u3000 [Infinity, -Infinity],
}
`;

checkError(str, false, JSON5_OPTION);
const option = Object.assign({}, JSON5_OPTION);
for (const key in option) {
  option[key as keyof typeof option] = false;
  checkError(str, true, option);
  option[key as keyof typeof option] = true;
}
