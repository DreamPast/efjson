import { JSON5_OPTION } from "../../efjson";
import { checkError } from "../util";

checkError("[,,]", true, JSON5_OPTION);
checkError("{,,}", true, JSON5_OPTION);
checkError("[,true]", true, JSON5_OPTION);
checkError("{,A:1}", true, JSON5_OPTION);
checkError("{A:1,,}", true, JSON5_OPTION);
checkError("[1,,2]", true, JSON5_OPTION);

checkError("Iull", true, { acceptNan: true });
checkError("Nnfinity", true, { acceptInfinity: true });

checkError("\0", true);
