import { JSON5_OPTION } from "efjson";
import { checkNormal } from "../util";

checkNormal('{"a":{},"b":1}', { a: {}, b: 1 });
checkNormal('{"a":{},}', { a: {} }, JSON5_OPTION);

checkNormal("{,,}", undefined, JSON5_OPTION);
checkNormal("{,A:1}", undefined, JSON5_OPTION);
checkNormal("{A:1,,}", undefined, JSON5_OPTION);
