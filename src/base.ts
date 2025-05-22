export type JsonArray = JsonValue[];
export type JsonObject = { [k: string]: JsonValue };
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
