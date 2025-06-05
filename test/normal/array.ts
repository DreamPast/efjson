import { JSON5_OPTION } from "../../src/index";
import { checkNormal } from "../_util";

test("normal[array]", () => {
  checkNormal("[[],[1]]", [[], [1]]);
  checkNormal("[1,]", [1], JSON5_OPTION);

  checkNormal("[,,]", undefined, JSON5_OPTION);
  checkNormal("[,true]", undefined, JSON5_OPTION);
  checkNormal("[1,,2]", undefined, JSON5_OPTION);

  checkNormal("[,]", undefined);
  checkNormal("[,]", undefined, JSON5_OPTION);
  checkNormal("[}", undefined);

  checkNormal("[", undefined);
  checkNormal("[1", undefined);
  checkNormal("[1:", undefined);
  checkNormal("[null:", undefined);
  checkNormal("[1,", undefined);

  checkNormal("[1 []]", undefined);
});
