import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, JsonParserError, parseJsonNumber } from "./base";
import { createJsonStreamParser, JsonToken } from "./stream";

export class JsonEventParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonEventParserError";
  }
}

type JsonEventNullReceiver = { save?: (val: null) => void };
type JsonEventBooleanReceiver = { save?: (val: boolean) => void };
type JsonEventIntegerReceiver = { save?: (num: BigInt) => void };
type JsonEventNumberReceiver = { save?: (num: number) => void };
type JsonEventStringReceiver = {
  save?: (str: string) => void;
  append?: (chunk: string) => void;
};
type JsonEventObjectReceiver<Opt extends JsonOption> = {
  save?: (obj: JsonObject) => void;
  set?: (key: string, value: JsonValue) => void;
  next?: () => void;
  keyReceiver?: JsonEventReceiver<Opt>;
  subreceiver?: (key: string) => JsonEventReceiver<Opt>;
};
type JsonEventArrayReceiver<Opt extends JsonOption> = {
  save?: (obj: JsonArray) => void;
  set?: (index: number, value: JsonValue) => void;
  next?: (new_index: number) => void;
  subreceiver?: (index: number) => JsonEventReceiver<Opt>;
};
/**
 * # Event receiver interface.
 *
 * ## sub-types
 * If the fields `null`, `boolean`, `integer`, `number`, `string`, `object`, or `array` are not `undefined`,
 * it means this type is accepted as a valid value.
 *   - If these fields are not defined, all types will be rejected.
 *   - If you want to accept all types, you should provide an object for all these fields;
 *     `JsonDefaultEventReceiver` provides such an object for you.
 *
 * ## `integer` and `number`
 * If `integer` is set, an attempt will be made to convert the value to BigInt and pass it in;
 * if it cannot be converted to an integer, it will fall back to the `number` type.
 *
 * ## order of four basic triggers
 * `start` -> `feed` (may be called multiple times) -> `end` -> `save`
 */
export type JsonEventReceiver<Opt extends JsonOption = JsonOption> = {
  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt>) => void;
  /** If the sub-type's `save` exists, it will be called first; otherwise, this `save` will be called */
  save?: (val: JsonValue) => void;

  null?: JsonEventNullReceiver;
  boolean?: JsonEventBooleanReceiver;
  integer?: JsonEventIntegerReceiver;
  number?: JsonEventNumberReceiver;
  string?: JsonEventStringReceiver;
  object?: JsonEventObjectReceiver<Opt>;
  array?: JsonEventArrayReceiver<Opt>;
};
const _EmptyObject = Object.freeze({});
export const JsonDefaultEventReceiver: JsonEventReceiver<any> = Object.freeze({
  null: _EmptyObject,
  boolean: _EmptyObject,
  number: _EmptyObject,
  string: _EmptyObject,
  object: _EmptyObject,
  array: _EmptyObject,
});

namespace EventState {
  type _StateBase<Opt extends JsonOption> = {
    _receiver: JsonEventReceiver<Opt>;
    _start: boolean;
  };

  export type _StateLess<Opt extends JsonOption> = _StateBase<Opt> & {};
  export type _Number<Opt extends JsonOption> = _StateBase<Opt> & {
    _save: boolean;
    _list: string[];
  };
  export type _String<Opt extends JsonOption> = _StateBase<Opt> & {
    _append?: (chunk: string) => void;

    _save?: boolean;
    _list: string[];
  };

  export type _Object<Opt extends JsonOption> = _StateBase<Opt> & {
    _set?: (key: string, value: JsonValue) => void;
    _next?: () => void;
    _keyReceiver?: JsonEventReceiver<Opt>;
    _subreceiver?: (key: string) => JsonEventReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _key?: string;

    _save: boolean;
    _saveKey: boolean;
    _saveValue: boolean;
    _object: JsonObject | boolean;
  };
  export type _Array<Opt extends JsonOption> = _StateBase<Opt> & {
    _set?: (index: number, value: JsonValue) => void;
    _next?: (new_index: number) => void;
    _subreceiver?: (index: number) => JsonEventReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _index: number;

    _save: boolean;
    _array: JsonArray | boolean;
  };
  export type _Struct<Opt extends JsonOption> = _Object<Opt> | _Array<Opt>;

  export type _State<Opt extends JsonOption> = _StateLess<Opt> | _Number<Opt> | _String<Opt> | _Struct<Opt>;
}
const parseJsonInteger = (str: string): bigint | undefined => {
  try {
    const val = BigInt(str);
    return str[0] === "-" ? (val ? -val : undefined) : val;
  } catch (e) {
    return undefined;
  }
};

/**
 * Input tokens and emit events
 */
export interface JsonEventEmitter<Opt extends JsonOption = JsonOption> {
  feed: (token: JsonToken<Opt>) => void;
}
export const createJsonEventEmitter = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>,
): JsonEventEmitter<Opt> => {
  const _stack: EventState._State<Opt>[] = [{ _receiver: receiver, _start: false }];

  const enum SpecialParse {
    None = 0,
    Identifier = 1,
    Number = 2,
  }
  let _spec = SpecialParse.None;

  function _throw(msg: string): never {
    throw new JsonEventParserError(`JsonEventParser Error - ${msg}`);
  }

  const _endValue = (value: JsonValue, save: undefined | ((val: any) => void)): void => {
    const state = _stack.pop()!;
    state._receiver.end?.();
    if (save) save(value);
    else state._receiver.save?.(value);
    if (_stack.length !== 0) (_stack[_stack.length - 1] as EventState._Struct<Opt>)._child = value;
  };
  const _needSave = () => {
    return !!(_stack[_stack.length - 2] as undefined | EventState._Struct<Opt>)?._saveChild;
  };

  const _feedStateless = (token: JsonToken<Opt> & { type: "true" | "false" | "null" }) => {
    const state = _stack[_stack.length - 1];
    if (!state._start) {
      const type = token.type === "null" ? "null" : "boolean";
      if (!state._receiver[type]) _throw(`${type} is rejected`);
      state._start = true;
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.done) {
      return _endValue(
        token.type === "null" ? null : token.type === "true",
        state._receiver[token.type === "null" ? "null" : "boolean"]?.save,
      );
    }
  };
  const _feedNumber = (token: JsonToken<Opt> & { type: "number" }) => {
    const state = _stack[_stack.length - 1] as EventState._Number<Opt>;
    if (!state._start) {
      if (!state._receiver["number"] && !state._receiver["integer"]) _throw(`number is rejected`);
      state._save =
        _needSave() || !!state._receiver.save || !!state._receiver.integer?.save || !!state._receiver.number?.save;
      state._list = [];

      _spec = SpecialParse.Number;
      state._start = true;
      state._receiver.start?.();
    }
    if (state._save) state._list.push(token.character);
    state._receiver.feed?.(token);
  };
  const _feedString = (token: JsonToken<Opt> & { type: "string" }) => {
    const state = _stack[_stack.length - 1] as EventState._String<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["string"];
      if (!_subreceiver) _throw(`string is rejected`);
      state._save = _needSave() || !!(state._receiver.save || _subreceiver.save);
      state._list = [];
      state._append = _subreceiver.append;

      state._start = true;
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.subtype === "normal") {
      state._append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (token.subtype === "escape" || token.subtype === "escape_unicode" || token.subtype === "escape_hex") {
      if (token.escaped_value !== undefined) {
        state._append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    } else if (token.subtype === "end") {
      _endValue(state._list.join(""), state._receiver["string"]?.save);
    }
  };
  const _feedIdentifier = (token: JsonToken<Opt> & { type: "identifier" }) => {
    const state = _stack[_stack.length - 1] as EventState._String<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["string"];
      if (!_subreceiver) _throw(`string is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._list = [];
      state._append = _subreceiver.append;

      _spec = SpecialParse.Identifier;
      state._start = true;
      state._receiver.start?.();

      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: "start",
          character: '"',
        });
    }
    if (token.subtype === "normal") {
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: "normal",
          character: token.character,
        });
      state._append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (token.subtype === "escape_start") {
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: token.index === 0 ? "escape_start" : "escape_unicode_start",
          character: token.character,
        });
    } else {
      /* if (token.subtype === "escape") */
      if (state._receiver.feed)
        state._receiver.feed({
          location: "key",
          type: "string",
          subtype: "escape_unicode",
          index: token.index as any,
          escaped_value: token.escaped_value,
          character: token.character,
        });
      if (token.escaped_value !== undefined) {
        state._append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    }
  };
  const _feedObject = (token: JsonToken<Opt> & { type: "object" }) => {
    const state = _stack[_stack.length - 1] as EventState._Object<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["object"];
      if (!_subreceiver) _throw(`object is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._saveValue = state._save || !!_subreceiver.set;
      state._saveKey = state._saveValue || !!_subreceiver.keyReceiver?.save || !!_subreceiver.keyReceiver?.string?.save;

      state._object = state._save && {};
      state._set = _subreceiver.set;
      state._next = _subreceiver.next;
      state._keyReceiver = _subreceiver.keyReceiver;
      state._subreceiver = _subreceiver.subreceiver;

      state._start = true;
      state._receiver.start?.();
      state._receiver.feed?.(token);

      state._saveChild = state._saveKey;
      _stack.push({
        _receiver: state._keyReceiver ?? JsonDefaultEventReceiver,
        _start: false,
      } as EventState._String<Opt>);
      return;
    }
    state._receiver.feed?.(token);
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._key !== undefined) {
        // trailing comma
        if (state._save) (state._object as JsonObject)[state._key] = state._child!;
        state._set?.(state._key, state._child!);
      }
      _endValue(state._object!, state._receiver["object"]?.save);
    } else if (token.subtype === "next") {
      state._next?.();

      if (state._save) (state._object as JsonObject)[state._key!] = state._child!;
      state._set?.(state._key!, state._child!);

      state._key = state._child = undefined;
      state._saveChild = state._saveKey;
      _stack.push({
        _receiver: state._keyReceiver ?? JsonDefaultEventReceiver,
        _start: false,
      } as EventState._String<Opt>);
    } else {
      /* if (token.subtype === "value_start") */
      state._saveChild = state._saveValue;
      const key = state._child as string | undefined;
      state._key = key;
      _stack.push({
        _receiver: (key != undefined && state._subreceiver?.(key)) || JsonDefaultEventReceiver,
        _start: false,
      });
    }
  };
  const _feedArray = (token: JsonToken<Opt> & { type: "array" }): void => {
    const state = _stack[_stack.length - 1] as EventState._Array<Opt>;
    if (!state._start) {
      const _subreceiver = state._receiver["array"];
      if (!_subreceiver) _throw(`array is rejected`);
      state._save = _needSave() || !!state._receiver.save || !!_subreceiver.save;
      state._saveChild = state._save || !!_subreceiver.set;

      state._index = 0;
      state._array = state._save && [];
      state._set = _subreceiver.set;
      state._next = _subreceiver.next;
      state._subreceiver = _subreceiver.subreceiver;

      state._start = true;
      state._receiver.start?.();
      state._receiver.feed?.(token);

      _stack.push({ _receiver: state._subreceiver?.(state._index) ?? JsonDefaultEventReceiver, _start: false });
      return;
    }
    state._receiver.feed?.(token);
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._child !== undefined) {
        if (state._save) (state._array as JsonArray)[state._index] = state._child!; // trailing comma
        state._set?.(state._index, state._child!);
      }
      _endValue(state._array, state._receiver["array"]?.save);
    } else {
      /* if(token.subtype === 'next') */
      state._next?.(state._index + 1);

      if (state._save) (state._array as JsonArray)[state._index] = state._child!;
      state._set?.(state._index, state._child!);

      state._child = undefined;
      ++state._index;
      _stack.push({ _receiver: state._subreceiver?.(state._index) ?? JsonDefaultEventReceiver, _start: false });
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = _stack[_stack.length - 1];
      if (state === undefined) return;
      if (_spec) {
        if (_spec === SpecialParse.Number) {
          if (token.type !== "number") {
            if ((state as EventState._Number<Opt>)._save) {
              _stack.pop();
              const str = (state as EventState._Number<Opt>)._list.join("");
              let saveFloat = true;
              if (state._receiver["integer"]) {
                const val = parseJsonInteger(str);
                if (val !== undefined) {
                  state._receiver.end?.();
                  state._receiver["integer"].save?.(val);
                  saveFloat = false;
                } else if (!state._receiver["number"] && !state._receiver.save) _throw(`invalid integer: ${str}`);
              }

              const value = parseJsonNumber(str);
              if (saveFloat) {
                state._receiver.end?.();
                const func = state._receiver["number"]?.save;
                if (func) func(value);
                else state._receiver.save?.(value);
              }
              if (_stack.length !== 0) (_stack[_stack.length - 1] as EventState._Struct<Opt>)._child = value;
            } else _stack.pop()!._receiver.end?.();
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        } else {
          if (token.type !== "identifier") {
            if (state._receiver.feed)
              state._receiver.feed({
                location: "key",
                type: "string",
                subtype: "end",
                character: '"',
              });
            if ((state as EventState._String<Opt>)._save) {
              _endValue((state as EventState._String<Opt>)._list.join(""), state._receiver["string"]?.save);
            } else _stack.pop()!._receiver.end?.();
            _spec = SpecialParse.None;
            state = _stack[_stack.length - 1];
          }
        }
      } else if (!state._start && token.subtype === "end" && token.type !== "string") {
        // trailing comma
        _stack.pop();
        state = _stack[_stack.length - 1];
      }
      if (token.type === "whitespace" || token.type === "comment" || token.type === "eof") return;

      switch (token.type) {
        case "number":
          _feedNumber(token);
          break;
        case "string":
          _feedString(token);
          break;
        case "identifier":
          _feedIdentifier(token);
          break;
        case "object":
          _feedObject(token);
          break;
        case "array":
          _feedArray(token);
          break;
        default:
          _feedStateless(token);
      }
    },
  };
};

export const jsonEventEmit = <Opt extends JsonOption = JsonOption>(
  tokens: Iterable<JsonToken<Opt>>,
  receiver: JsonEventReceiver<Opt>,
) => {
  const emitter = createJsonEventEmitter(receiver);
  for (const token of tokens) emitter.feed(token);
};

/**
 * Input JSON string and emit events (equivalent to combine `JsonStreamParser` and `JsonEventEmiiter`)
 */
export interface JsonEventParser {
  feed: (s: string) => void;
  end: () => void;

  get position(): number;
  get line(): number;
  get column(): number;
}
export const createJsonEventParser = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>,
  option?: Opt,
): JsonEventParser => {
  const _parser = createJsonStreamParser(option);
  const _emitter = createJsonEventEmitter(receiver);
  const _token = {};
  return {
    feed(s: string) {
      for (const c of s) _emitter.feed(_parser.feedOneTo(_token, c));
    },
    end() {
      _emitter.feed(_parser.end());
    },
    get position() {
      return _parser.position;
    },
    get line() {
      return _parser.line;
    },
    get column() {
      return _parser.column;
    },
  };
};

export const jsonEventParse = <Opt extends JsonOption = JsonOption>(
  str: string,
  receiver: JsonEventReceiver<Opt>,
  option?: Opt,
) => {
  const parser = createJsonEventParser(receiver, option);
  parser.feed(str);
  parser.end();
};
