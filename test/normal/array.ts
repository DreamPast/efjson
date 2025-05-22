import { JSON5_OPTION } from "efjson";
import { checkNormal } from "../util";

checkNormal("[[],[1]]", [[], [1]]);
checkNormal("[1,]", [1], JSON5_OPTION);

checkNormal("[,,]", undefined, JSON5_OPTION);
checkNormal("[,true]", undefined, JSON5_OPTION);
checkNormal("[1,,2]", undefined, JSON5_OPTION);
