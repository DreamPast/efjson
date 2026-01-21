import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("nan", () => {
    const str = "NaN";
    for (let i = 1; i <= 3; ++i) {
      checkNormal(str.slice(0, i), undefined);
      checkNormal("-" + str.slice(0, i), undefined);
      checkNormal("+" + str.slice(0, i), undefined);

      checkNormal("1" + str.slice(0, i), undefined);
      checkNormal("-1" + str.slice(0, i), undefined);
      checkNormal("+1" + str.slice(0, i), undefined);
      checkNormal("0" + str.slice(0, i), undefined);
      checkNormal("-0" + str.slice(0, i), undefined);
      checkNormal("+0" + str.slice(0, i), undefined);

      checkNormal(str.slice(0, i), i !== 3 ? undefined : NaN, { acceptNan: true });
      checkNormal("-" + str.slice(0, i), i !== 3 ? undefined : -NaN, { acceptNan: true });
      checkNormal("+" + str.slice(0, i), undefined, { acceptNan: true });

      checkNormal("+" + str.slice(0, i), i !== 3 ? undefined : +NaN, {
        acceptNan: true,
        acceptPositiveSign: true,
      });
    }
  });
});
