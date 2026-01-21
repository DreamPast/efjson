import { JSON5_OPTION } from "../../src/index";
import { checkNormal } from "../_util";

test("normal[object]", () => {
  checkNormal('{"a":{},"b":1}', { a: {}, b: 1 });
  checkNormal('{"a":{},}', { a: {} }, JSON5_OPTION);

  checkNormal("{,,}", undefined, JSON5_OPTION);
  checkNormal("{,A:1}", undefined, JSON5_OPTION);
  checkNormal("{A:1,,}", undefined, JSON5_OPTION);

  checkNormal("{,}", undefined);
  checkNormal("{,}", undefined, JSON5_OPTION);
  checkNormal('{"a":,}', undefined);
  checkNormal('{"a":,}', undefined, JSON5_OPTION);
  checkNormal("{]", undefined);

  checkNormal("{", undefined);
  checkNormal("{,", undefined);
  checkNormal('{"a"', undefined);
  checkNormal('{"a":', undefined);
  checkNormal('{"a"::', undefined);
  checkNormal('{"a":1', undefined);
  checkNormal('{"a" 1}', undefined);
  checkNormal('{"a":1]', undefined);
  checkNormal('{"a":true ]', undefined);
  checkNormal('{"a":1,', undefined);
  checkNormal('{"a":1[', undefined);

  checkNormal('{"a":1,}', { a: 1 }, JSON5_OPTION);
  checkNormal('{"a":1,}', undefined);

  checkNormal(":", undefined);

  checkNormal("{", undefined, JSON5_OPTION);
  checkNormal("{,", undefined, JSON5_OPTION);
  checkNormal("{a", undefined, JSON5_OPTION);
  checkNormal("{a:", undefined, JSON5_OPTION);
  checkNormal("{a::", undefined, JSON5_OPTION);
  checkNormal("{a:1", undefined, JSON5_OPTION);
  checkNormal("{a 1}", undefined, JSON5_OPTION);
  checkNormal("{a:1]", undefined, JSON5_OPTION);
  checkNormal("{a:1,", undefined, JSON5_OPTION);

  checkNormal("{\\z:1}", undefined, JSON5_OPTION);
  checkNormal("{\\upz:1}", undefined, JSON5_OPTION);

  checkNormal('{"a\\\nb":1}', { ab: 1 }, { acceptMultilineString: true });
});
