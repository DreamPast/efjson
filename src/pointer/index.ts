import { JsonValue } from "../base";

export class JsonPointerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JSONPointerError";
  }
}

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const tryToInteger = (s: string) => {
  if (s.match(/^0|[1-9][0-9]+$/)) {
    const val = parseInt(s, 10);
    if (-MAX_SAFE_INTEGER <= val && val <= MAX_SAFE_INTEGER) return val;
  }
  throw new JsonPointerError(`not an integer: ${s}`);
};

export const jsonPointerCompile = (s: string) => {
  if (s === "") return [];
  if (s[0] !== "/") throw new JsonPointerError(`invalid JSON pointer: ${s}`);
  const arr = s.substring(1).split("/");
  return arr.map((part) => {
    if (part.match(/~[^01]/)) throw new JsonPointerError(`invalid JSON pointer: ${s}`);
    const t = part.replace(/~1/g, "/").replace(/~0/g, "~");
    return t;
  });
};
export const jsonPointerDecompile = (path: string[]) => {
  if (path.length === 0) return "";
  const arr = path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1"));
  return "/" + arr.join("/");
};

export const jsonPointerGet = (obj: JsonValue, path: string | string[]): JsonValue | undefined => {
  if (typeof path === "string") path = jsonPointerCompile(path);
  for (const part of path) {
    if (Array.isArray(obj)) {
      obj = obj[part === "-" ? obj.length : tryToInteger(part)];
    } else if (typeof obj === "object" && obj !== null) {
      if (!Reflect.has(obj, part)) throw new JsonPointerError(`object does not contain property: ${part}`);
      obj = obj[part];
    } else {
      throw new JsonPointerError(`not an object or array: ${part}`);
    }
  }
  return obj;
};
export const jsonPointerSet = (obj: JsonValue, path: string | string[], value: JsonValue): void => {
  if (typeof path === "string") path = jsonPointerCompile(path);
  const n = path.length - 1;
  for (let i = 0; i < n; ++i) {
    const part = path[i];
    if (Array.isArray(obj)) {
      obj = obj[part === "-" ? obj.length : tryToInteger(part)];
    } else if (typeof obj === "object" && obj !== null) {
      if (!(part in obj)) throw new JsonPointerError(`object does not contain property: ${part}`);
      obj = obj[part];
    } else {
      throw new JsonPointerError(`not an object or array: ${part}`);
    }
  }
  if (n >= 0) {
    const part = path[n];
    if (Array.isArray(obj)) {
      obj[part === "-" ? obj.length : tryToInteger(part)] = value;
    } else if (typeof obj === "object" && obj !== null) {
      obj[part] = value;
    } else {
      throw new JsonPointerError(`not an object or array: ${part}`);
    }
  }
};
export const jsonPointerHas = (obj: JsonValue, path: string | string[]): boolean => {
  if (typeof path === "string") path = jsonPointerCompile(path);
  for (const part of path) {
    if (Array.isArray(obj)) {
      const idx = part === "-" ? obj.length : tryToInteger(part);
      if (idx >= obj.length) return false;
      obj = obj[idx];
    } else if (typeof obj === "object" && obj !== null) {
      if (!Reflect.has(obj, part)) return false;
      obj = obj[part];
    } else {
      throw new JsonPointerError(`not an object or array: ${part}`);
    }
  }
  return true;
};
export const jsonPointer = (obj: JsonValue, path: string | string[], value?: JsonValue) => {
  return value === undefined ? jsonPointerGet(obj, path) : jsonPointerSet(obj, path, value);
};
