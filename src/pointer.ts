import { JsonValue } from "./base";

export class JsonPointerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JSONPointerError";
  }
}

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const tryToInteger = (s: string) => {
  if (s.match(/^0|[1-9][0-9]*$/)) {
    const val = parseInt(s, 10);
    if (-MAX_SAFE_INTEGER <= val && val <= MAX_SAFE_INTEGER) return val;
  }
  throw new JsonPointerError(`not an integer: ${s}`);
};

const jsonPointerUnescape = (s: string) => {
  if (s.match(/~[^01]/)) throw new JsonPointerError("JSON pointer contains invalid escape sequence");
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
};
const jsonPointerEscape = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

export const jsonPointerCompile = (s: string) => {
  if (s === "") return [];
  if (s[0] !== "/") throw new JsonPointerError("JSON pointer must start with '/'");
  const arr = s.substring(1).split("/");
  return arr.map(jsonPointerUnescape);
};
export const jsonPointerDecompile = (path: string[]) => {
  if (path.length === 0) return "";
  return "/" + path.map(jsonPointerEscape).join("/");
};

const jsonPointerMove = (obj: JsonValue, path: string[], start = 0, last = path.length): JsonValue => {
  for (; start < last; ++start) {
    const part = path[start];
    if (Array.isArray(obj)) {
      const index = part === "-" ? obj.length : tryToInteger(part);
      if (index >= obj.length) throw new JsonPointerError(`array index exceed: ${part}`);
      obj = obj[index];
    } else if (typeof obj === "object" && obj !== null) {
      if (!(part in obj)) throw new JsonPointerError(`object does not contain property: ${part}`);
      obj = obj[part];
    } else {
      throw new JsonPointerError("not an object or array");
    }
  }
  return obj;
};
/* if the second return value is -2, should return index */
const jsonPointerRelative = (
  path: string | string[],
  start: string | string[]
): [(string | [boolean, number])[], number] => {
  if (typeof path === "string" && path.startsWith("/")) return [jsonPointerCompile(path), -1]; // absolute JSON pointer
  const arr: (string | [boolean, number])[] = typeof start === "string" ? jsonPointerCompile(start) : start.slice();
  if (typeof path !== "string") return [arr.concat(path), -1];

  let index = 0;
  for (const len = path.length; index < len && path[index] >= "0" && path[index] <= "9"; ++index) {}
  if (index !== 0) {
    const jump = tryToInteger(path.slice(0, index));
    if (jump > arr.length) throw new JsonPointerError("cannot move up from root");
    arr.length -= jump;
  }

  let offsetIdx = -1;
  if (path[index] === "+" || path[index] === "-") {
    let index2 = index + 1;
    for (const len = path.length; index2 < len && path[index2] >= "0" && path[index2] <= "9"; ++index2) {}
    if (index2 === index + 1) throw new JsonPointerError("relative JSON pointer offset must be a number");
    const back = arr.pop();
    if (back === undefined) throw new JsonPointerError("not an array");
    let offset = tryToInteger(path.slice(index + 1, index2));
    if (path[index] === "-") offset = -offset;
    offsetIdx = arr.length;
    if (back === "-") arr.push([true, offset]);
    else arr.push([false, tryToInteger(back as string) + offset]);
    index = index2;
  }

  if (path[index] === "#") {
    if (index !== path.length - 1)
      throw new JsonPointerError("relative JSON pointer to get position must end with '#'");
    return [arr, -2];
  }

  return [arr.concat(jsonPointerCompile(path.slice(index))), offsetIdx];
};

export const jsonPointerGet = (obj: JsonValue, path: string | string[], start?: string | string[]): JsonValue => {
  if (start === undefined) return jsonPointerMove(obj, typeof path === "string" ? jsonPointerCompile(path) : path);

  const [arr, flag] = jsonPointerRelative(path, start);
  if (flag === -2) {
    const back = arr.pop();
    if (back === undefined) throw new JsonPointerError("cannot get position from root");
    obj = jsonPointerMove(obj, arr as string[]);
    if (typeof back === "string") {
      if (Array.isArray(obj)) return back === "-" ? obj.length : tryToInteger(back);
      else if (typeof obj === "object" && obj !== null) return back;
      else throw new JsonPointerError("not an object or array");
    } else {
      const [fromEnd, offset] = back;
      if (!Array.isArray(obj)) throw new JsonPointerError("not an array");
      const index = fromEnd ? obj.length + offset : offset;
      if (index < 0 || index >= obj.length) throw new JsonPointerError("array index exceed");
      return index;
    }
  }

  obj = jsonPointerMove(obj, arr as string[], 0, flag);
  if (flag >= 0) {
    const [fromEnd, offset] = arr[flag] as [boolean, number];
    if (!Array.isArray(obj)) throw new JsonPointerError("not an array");
    const index = fromEnd ? obj.length + offset : offset;
    if (index < 0 || index >= obj.length) throw new JsonPointerError("array index exceed");
    obj = obj[index];
  }
  return jsonPointerMove(obj, arr as string[], flag + 1);
};
export const jsonPointerSet = (
  obj: JsonValue,
  path: string | string[],
  value: JsonValue,
  start?: string | string[]
): void => {
  if (start === undefined) {
    const arr = typeof path === "string" ? jsonPointerCompile(path) : path;
    obj = jsonPointerMove(obj, arr, 0, arr.length - 1);
    if (arr.length === 0) throw new JsonPointerError("cannot set value to root");
    const part = arr[arr.length - 1];
    if (Array.isArray(obj)) obj[part === "-" ? obj.length : tryToInteger(part)] = value;
    else if (typeof obj === "object" && obj !== null) obj[part] = value;
    else throw new JsonPointerError("not an object or array");
    return;
  }

  const [arr, flag] = jsonPointerRelative(path, start);
  if (flag === -2) throw new JsonPointerError("cannot get position when modifying");
  if (arr.length === 0) throw new JsonPointerError("cannot set value to root");

  obj = jsonPointerMove(obj, arr as string[], 0, flag - 1);
  if (flag >= 0) {
    const [fromEnd, offset] = arr[flag] as [boolean, number];
    if (!Array.isArray(obj)) throw new JsonPointerError("not an array");
    const index = fromEnd ? obj.length + offset : offset;
    if (index < 0 || index >= obj.length) throw new JsonPointerError("array index exceed");
    if (flag === arr.length - 1) {
      obj[index] = value;
      return;
    }
    obj = obj[index];
  }
  obj = jsonPointerMove(obj, arr as string[], flag + 1, arr.length - 1);
  const part = arr[arr.length - 1] as string;
  if (Array.isArray(obj)) obj[part === "-" ? obj.length : tryToInteger(part)] = value;
  else if (typeof obj === "object" && obj !== null) obj[part] = value;
  else throw new JsonPointerError("not an object or array");
};

type JsonPointerFunction = {
  (obj: JsonValue, path: string | string[], value?: undefined, start?: string | string[]): JsonValue;
  (obj: JsonValue, path: string | string[], value: JsonValue, start?: string | string[]): void;
};

/**
 * Get or set value in JSON object by JSON Pointer or relative JSON Pointer.
 *
 * spec:
 * - JSON Pointer
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 * - Relative Json Pointer
 * @see https://datatracker.ietf.org/doc/html/draft-bhutton-relative-json-pointer-00
 */
export const jsonPointer = ((
  obj: JsonValue,
  path: string | string[],
  value?: JsonValue | undefined,
  start?: string | string[]
) => {
  return value === undefined ? jsonPointerGet(obj, path, start) : jsonPointerSet(obj, path, value, start);
}) as JsonPointerFunction;
