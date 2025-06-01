import { jsonStreamParse } from "efjson";

const json = `{
"null":null,"true":true,"false":false,
"string":"string,\\"escape\\",\\uD83D\\uDE00,😊",
"integer":12,"negative":-12,"fraction":12.34,"exponent":1.234e2,
"array":["1st element",{"object":"nesting"}],
"object":{"1st":[],"2st":{}}
}`;
for (const token of jsonStreamParse(json)) console.log(token);
