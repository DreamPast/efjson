import { checkNormal } from "../_util";

test("normal[literal]", () => {
  checkNormal("null", null);
  checkNormal("true", true);
  checkNormal("false", false);

  checkNormal("Null", undefined);
  checkNormal("True", undefined);
  checkNormal("False", undefined);

  checkNormal("undefined", undefined);
  checkNormal("Iull", undefined, { acceptNan: true });
  checkNormal("Nnfinity", undefined, { acceptInfinity: true });
});
