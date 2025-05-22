import { checkNormal } from "../util";

checkNormal("Iull", undefined, { acceptNan: true });
checkNormal("Nnfinity", undefined, { acceptInfinity: true });

checkNormal("\0", undefined);

checkNormal('{"a\\\nb":1}', { ab: 1 }, { acceptMultilineString: true });

checkNormal("[,]", undefined, { acceptTrailingCommaInArray: true });
checkNormal("{,}", undefined, { acceptTrailingCommaInObject: true });
