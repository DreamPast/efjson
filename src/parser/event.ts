import { JsonArray, JsonObject, JsonValue } from "../base";
import { JsonOption, JsonParserError, parseJsonNumber } from "./base";
import { createJsonStreamParser, JsonToken } from "./stream";
type AllJsonToken = JsonToken<JsonOption>;

export class JsonEventParserError extends JsonParserError {
  constructor(msg: string) {
    super(msg);
    this.name = "JsonEventParserError";
  }
}

export type JsonEventAnyReceiver<Opt extends JsonOption> = {
  type: "any";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt>) => void;
  save?: (val: JsonValue) => void;

  /**
   * After obtaining a specific type, it can be transformed into other types of receivers.
   * If the sub-receiver lacks methods like `start`, `end`, `feed`, or `save`,
   * it will attempt to inherit them from the parent receiver.
   */
  dict?: {
    null?: JsonEventNullReceiver<Opt>;
    boolean?: JsonEventBooleanReceiver<Opt>;
    number?: JsonEventNumberReceiver<Opt>;
    string?: JsonEventStringReceiver<Opt>;
    object?: JsonEventObjectReceiver<Opt>;
    array?: JsonEventArrayReceiver<Opt>;
  };
};
export type JsonEventNullReceiver<Opt extends JsonOption> = {
  type: "null";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "null" }) => void;
  save?: (val: null) => void;
};
export type JsonEventBooleanReceiver<Opt extends JsonOption> = {
  type: "boolean";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "true" | "false" }) => void;
  save?: (val: boolean) => void;
};
export type JsonEventNumberReceiver<Opt extends JsonOption> = {
  type: "number";

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "number" }) => void;
  save?: (num: number) => void;
};
export type JsonEventStringReceiver<Opt extends JsonOption> = {
  type: "string";
  append?: (chunk: string) => void;

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "string" }) => void;
  save?: (str: string) => void;
};
export type JsonEventObjectReceiver<Opt extends JsonOption> = {
  type: "object";

  set?: (key: string, value: JsonValue) => void;
  next?: () => void;

  keyReceiver?: JsonEventStringReceiver<Opt>;
  subscribeList?: ((key: string) => JsonEventReceiver<Opt> | undefined)[];

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "object" }) => void;
  save?: (obj: JsonObject) => void;
};
export type JsonEventArrayReceiver<Opt extends JsonOption> = {
  type: "array";

  set?: (index: number, value: JsonValue) => void;
  next?: (new_index: number) => void;

  subscribeList?: ((index: number) => JsonEventReceiver<Opt> | undefined)[];

  start?: () => void;
  end?: () => void;
  feed?: (token: JsonToken<Opt> & { type: "array" }) => void;
  save?: (obj: JsonArray) => void;
};
export type JsonEventReceiver<Opt extends JsonOption = JsonOption> =
  | JsonEventAnyReceiver<Opt>
  | JsonEventNullReceiver<Opt>
  | JsonEventBooleanReceiver<Opt>
  | JsonEventNumberReceiver<Opt>
  | JsonEventStringReceiver<Opt>
  | JsonEventObjectReceiver<Opt>
  | JsonEventArrayReceiver<Opt>;

namespace EventState {
  export type _Unknown<Opt extends JsonOption> = {
    _type?: undefined;
    _receiver: JsonEventReceiver<Opt>;
    _save?: undefined;
  };
  export type _StateLess<Opt extends JsonOption> = {
    _type: "null" | "true" | "false";
    _receiver: JsonEventNullReceiver<Opt> | JsonEventBooleanReceiver<Opt>;
    _save?: undefined;
  };
  export type _Number<Opt extends JsonOption> = {
    _type: "number";
    _receiver: JsonEventNumberReceiver<Opt>;

    _save?: boolean;
    _list: string[];
  };
  export type _String<Opt extends JsonOption> = {
    _type: "string";
    _receiver: JsonEventStringReceiver<Opt>;

    _save?: boolean;
    _list: string[];
    _isIdentifier?: boolean;
  };

  export type _Object<Opt extends JsonOption> = {
    _type: "object";
    _receiver: JsonEventObjectReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _key?: string;

    _save: boolean;
    _saveKey: boolean;
    _saveValue: boolean;
    _object: JsonObject;
  };
  export type _Array<Opt extends JsonOption> = {
    _type: "array";
    _receiver: JsonEventArrayReceiver<Opt>;

    _saveChild: boolean;
    _child?: JsonValue;
    _index: number;

    _save: boolean;
    _array: JsonArray;
  };
  export type _Struct<Opt extends JsonOption> = _Object<Opt> | _Array<Opt>;

  export type _State<Opt extends JsonOption> =
    | _Unknown<Opt>
    | _StateLess<Opt>
    | _Number<Opt>
    | _String<Opt>
    | _Struct<Opt>;
}

/**
 * Input tokens and emit events
 */
export interface JsonEventEmitter<Opt extends JsonOption = JsonOption> {
  feed: (token: JsonToken<Opt>) => void;
}
export const createJsonEventEmitter = <Opt extends JsonOption = JsonOption>(
  receiver: JsonEventReceiver<Opt>,
): JsonEventEmitter<Opt> => {
  const _state: EventState._State<JsonOption>[] = [{ _receiver: receiver as JsonEventReceiver<JsonOption> }];

  function _throw(msg: string): never {
    throw new JsonEventParserError(`JsonEventParser Error - ${msg}`);
  }

  const _endValue = (value: JsonValue): void => {
    const state = _state.pop()!;
    state._receiver.end?.();
    (state._receiver.save as undefined | ((val: JsonValue) => void))?.(value);
    if (_state.length !== 0) {
      (_state[_state.length - 1] as EventState._Struct<JsonOption>)._child = value;
    }
  };
  const _needSave = () => {
    return _state.length >= 2 && (_state[_state.length - 2] as EventState._Struct<JsonOption>)._saveChild;
  };

  const _feedStateless = (token: AllJsonToken & { type: "true" | "false" | "null" }) => {
    const state = _state[_state.length - 1] as EventState._StateLess<JsonOption>;
    if (state._type === undefined) {
      state._type = token.type;
      state._receiver.start?.();
    }
    (state._receiver.feed as undefined | ((token: JsonToken) => void))?.(token);
    if (token.done) {
      if (token.type === "null") return _endValue(null);
      else if (token.type === "true") return _endValue(true);
      else /* if (token.type === "false") */ return _endValue(false);
    }
  };
  const _feedNumber = (token: AllJsonToken & { type: "number" }) => {
    const state = _state[_state.length - 1] as EventState._Number<JsonOption>;
    if (state._type === undefined) {
      state._type = "number";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    state._list.push(token.character);
  };
  const _feedString = (token: AllJsonToken & { type: "string" }) => {
    const state = _state[_state.length - 1] as EventState._String<JsonOption>;
    if (state._type === undefined) {
      state._type = "string";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
    }
    state._receiver.feed?.(token);
    if (token.subtype === "normal") {
      state._receiver.append?.(token.character);
      if (state._save) state._list.push(token.character);
    } else if (token.subtype === "escape" || token.subtype === "escape_unicode" || token.subtype === "escape_hex") {
      if (token.escaped_value !== undefined) {
        state._receiver.append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    } else if (token.subtype === "end") {
      _endValue(state._list.join(""));
    }
  };
  const _feedIdentifier = (token: AllJsonToken & { type: "identifier" }) => {
    const state = _state[_state.length - 1] as EventState._String<JsonOption>;
    if (state._type === undefined) {
      state._type = "string";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._list = [];
      state._receiver.start?.();
      state._isIdentifier = true;

      state._receiver.feed?.({
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
      state._receiver.append?.(token.character);
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
        state._receiver.append?.(token.escaped_value);
        if (state._save) state._list.push(token.escaped_value);
      }
    }
  };
  const _feedObject = (token: AllJsonToken & { type: "object" }) => {
    let state = _state[_state.length - 1] as EventState._Object<JsonOption>;
    if (state._type === undefined) {
      state._type = "object";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._saveValue = state._save || state._receiver.set !== undefined;
      state._saveKey = state._saveValue || state._receiver.subscribeList !== undefined;

      state._object = {};
      state._saveChild = state._saveKey;

      state._receiver.start?.();
      state._receiver.feed?.(token);
      _state.push({
        _receiver: state._receiver.keyReceiver ?? { type: "any" },
      });
      return;
    }
    state._receiver.feed?.(token);
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._key !== undefined) {
        // trailing comma
        if (state._save) state._object[state._key] = state._child!;
        state._receiver.set?.(state._key, state._child!);
      }
      return _endValue(state._object);
    }
    if (token.subtype === "next") {
      if (state._save) state._object[state._key!] = state._child!;
      state._receiver.set?.(state._key!, state._child!);

      state._saveChild = state._saveKey;
      state._key = state._child = undefined;
      _state.push({
        _receiver: state._receiver.keyReceiver ?? { type: "any" },
      });
      return;
    }
    /* if (token.subtype === "value_start") */ {
      state._saveChild = state._saveValue;
      state._key = state._child as string | undefined;
      let receiver: JsonEventReceiver<JsonOption> | undefined = undefined;
      if (state._receiver.subscribeList !== undefined) {
        for (const func of state._receiver.subscribeList) {
          receiver = func(state._key!);
          if (receiver !== undefined) break;
        }
      }
      _state.push({
        _receiver: receiver ?? { type: "any" },
      });
    }
  };
  const _feedArray = (token: AllJsonToken & { type: "array" }): void => {
    let state = _state[_state.length - 1] as EventState._Array<JsonOption>;
    if (state._type === undefined) {
      state._type = "array";
      state._save = _needSave() || state._receiver.save !== undefined;
      state._saveChild = state._save || state._receiver.set !== undefined;
      state._index = 0;
      state._array = [];

      state._receiver.start?.();
      state._receiver.feed?.(token);

      let receiver: JsonEventReceiver<JsonOption> | undefined;
      if (state._receiver.subscribeList !== undefined)
        for (const func of state._receiver.subscribeList) {
          receiver = func(state._index);
          if (receiver === undefined) break;
        }
      _state.push({
        _receiver: receiver ?? { type: "any" },
      });
      return;
    }
    state._receiver.feed?.(token);
    /* if (token.subtype === "start") return; */
    if (token.subtype === "end") {
      if (state._child !== undefined) {
        if (state._save) state._array[state._index] = state._child!; // trailing comma
        state._receiver.set?.(state._index, state._child!);
      }
      return _endValue(state._array);
    }

    /* if(token.subtype === 'next') */ {
      state._receiver.next?.(state._index + 1);
      if (state._save) state._array[state._index] = state._child!;
      state._receiver.set?.(state._index, state._child!);
      state._child = undefined;
      ++state._index;

      let receiver: JsonEventReceiver<JsonOption> | undefined = undefined;
      if (state._receiver.subscribeList !== undefined)
        for (const func of state._receiver.subscribeList) {
          receiver = func(state._index);
          if (receiver !== undefined) break;
        }
      _state.push({
        _receiver: receiver ?? { type: "any" },
      });
    }
  };

  return {
    feed(token: JsonToken<Opt>) {
      let state = _state[_state.length - 1];
      if (state === undefined) return;
      if (state._type === "number" && token.type !== "number") {
        const str = (state as EventState._Number<JsonOption>)._list.join("");
        _endValue(parseJsonNumber(str));
        state = _state[_state.length - 1];
      } else if ((state as EventState._String<JsonOption>)._isIdentifier && token.type !== "identifier") {
        (state._receiver.feed as undefined | ((token: JsonToken) => void))?.({
          location: "key",
          type: "string",
          subtype: "end",
          character: '"',
        });
        _endValue((state as EventState._String<JsonOption>)._list.join(""));
        state = _state[_state.length - 1];
      } else if (state._type === undefined)
        if (token.subtype === "end" && token.type !== "string") {
          // trailing comma
          _state.pop();
          state = _state[_state.length - 1];
        }
      if (token.type === "whitespace" || token.type === "comment" || token.type === "eof") return;

      const tokenCastType =
        token.type === "true" || token.type === "false"
          ? "boolean"
          : token.type === "identifier"
            ? "string"
            : token.type;
      if (state._type === undefined && state._receiver.type === "any") {
        const anyReceiver = state._receiver;
        const subReceiver: JsonEventReceiver<JsonOption> | undefined = anyReceiver.dict?.[tokenCastType];
        if (subReceiver === undefined) {
          state._receiver = { ...anyReceiver, type: tokenCastType };
        } else {
          const newReceiver = { ...subReceiver };
          if (newReceiver.start === undefined) newReceiver.start = anyReceiver.start;
          if (newReceiver.feed === undefined) newReceiver.feed = anyReceiver.feed;
          if (newReceiver.end === undefined) newReceiver.end = anyReceiver.end;
          if (newReceiver.save === undefined) newReceiver.save = anyReceiver.save;
          state._receiver = newReceiver;
        }
      }
      if (tokenCastType !== state._receiver.type) _throw(`expected ${state._receiver.type} but got ${token.type}`);

      switch (token.type) {
        case "number":
          return _feedNumber(token);
        case "string":
          return _feedString(token);
        case "identifier":
          return _feedIdentifier(token);

        case "object":
          return _feedObject(token);
        case "array":
          return _feedArray(token);

        default:
          return _feedStateless(token);
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
