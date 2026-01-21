import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("infinity", () => {
    const str = "Infinity";
    for (let i = 1; i <= 8; ++i) {
      checkNormal(str.slice(0, i), undefined);
      checkNormal("-" + str.slice(0, i), undefined);
      checkNormal("+" + str.slice(0, i), undefined);

      checkNormal("1" + str.slice(0, i), undefined);
      checkNormal("-1" + str.slice(0, i), undefined);
      checkNormal("+1" + str.slice(0, i), undefined);
      checkNormal("0" + str.slice(0, i), undefined);
      checkNormal("-0" + str.slice(0, i), undefined);
      checkNormal("+0" + str.slice(0, i), undefined);

      checkNormal(str.slice(0, i), i !== 8 ? undefined : Infinity, { acceptInfinity: true });
      checkNormal("-" + str.slice(0, i), i !== 8 ? undefined : -Infinity, { acceptInfinity: true });
      checkNormal("+" + str.slice(0, i), undefined, { acceptInfinity: true });

      checkNormal("+" + str.slice(0, i), i !== 8 ? undefined : +Infinity, {
        acceptInfinity: true,
        acceptPositiveSign: true,
      });
    }
  });
});
