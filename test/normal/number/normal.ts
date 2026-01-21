import { checkNormal } from "../../_util";

describe("normal[number]", () => {
  test("normal", () => {
    checkNormal("1", 1);
    checkNormal("-1", -1);
    checkNormal("10", 10);
    checkNormal("-10", -10);
    checkNormal("0", 0);
    checkNormal("-0", -0);
    checkNormal("00", undefined);
    checkNormal("-00", undefined);
    checkNormal("-01", undefined);
    checkNormal("01", undefined);
    checkNormal("0x1", undefined);
    checkNormal("0x0", undefined);
    checkNormal("0o1", undefined);
    checkNormal("0o0", undefined);
    checkNormal("0b1", undefined);
    checkNormal("0b0", undefined);

    checkNormal("-", undefined);
    checkNormal("+", undefined);
    checkNormal("+", undefined, { acceptPositiveSign: true });
    checkNormal("1//", undefined);
    checkNormal("1//", 1, { acceptSingleLineComment: true });
    checkNormal("1/**/", 1, { acceptMultiLineComment: true });
    checkNormal("1 ", 1);
    checkNormal("1,", undefined);

    checkNormal("1.z", undefined);
    checkNormal("1.1z", undefined);
    checkNormal("1ez", undefined);
    checkNormal("1e1z", undefined);
    checkNormal("1e1+", undefined);
    checkNormal("1e++2", undefined);
    checkNormal("1 2", undefined);

    {
      checkNormal("+10", undefined);
      checkNormal("+0", undefined);
      checkNormal("+00", undefined);

      checkNormal("+10", +10, { acceptPositiveSign: true });
      checkNormal("+0", +0, { acceptPositiveSign: true });
      checkNormal("+00", undefined, { acceptPositiveSign: true });
    }
  });
});
