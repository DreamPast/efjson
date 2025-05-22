import { checkNormal } from "../util";

checkNormal("null", null);
checkNormal("true", true);
checkNormal("false", false);

checkNormal("Null", undefined);
checkNormal("True", undefined);
checkNormal("False", undefined);
