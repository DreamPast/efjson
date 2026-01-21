import { JSON5_OPTION, jsonNormalParse, JsonOption } from "../../../src/index";

const ALL_PASSED_LIST = {
  comments: [
    `"This /* block comment */ isn't really a block comment."`,
    `"This inline comment // isn't really an inline comment."`,
  ],
  arrays: [
    `[]`,
    `[
    true,
    false,
    null
]`,
  ],
  numbers: [
    `0.5`,
    `1.2e3`,
    `1.2`,
    `2e23`,
    `2e-23`,
    `5e-0`,
    `1e+2`,
    `5e+0`,
    `5e0`,
    `15`,
    `-0.5`,
    `-1.2`,
    `-15`,
    `-0.0`,
    `-0`,
    `0.0`,
    `0e23`,
    `0`,
  ],
  misc: [
    `{
  "name": "npm",
  "publishConfig": {
    "proprietary-attribs": false
  },
  "description": "A package manager for node",
  "keywords": [
    "package manager",
    "modules",
    "install",
    "package.json"
  ],
  "version": "1.1.22",
  "preferGlobal": true,
  "config": {
    "publishtest": false
  },
  "homepage": "http://npmjs.org/",
  "author": "Isaac Z. Schlueter <i@izs.me> (http://blog.izs.me)",
  "repository": {
    "type": "git",
    "url": "https://github.com/isaacs/npm"
  },
  "bugs": {
    "email": "npm-@googlegroups.com",
    "url": "http://github.com/isaacs/npm/issues"
  },
  "directories": {
    "doc": "./doc",
    "man": "./man",
    "lib": "./lib",
    "bin": "./bin"
  },
  "main": "./lib/npm.js",
  "bin": "./bin/npm-cli.js",
  "dependencies": {
    "semver": "~1.0.14",
    "ini": "1",
    "slide": "1",
    "abbrev": "1",
    "graceful-fs": "~1.1.1",
    "minimatch": "~0.2",
    "nopt": "1",
    "node-uuid": "~1.3",
    "proto-list": "1",
    "rimraf": "2",
    "request": "~2.9",
    "which": "1",
    "tar": "~0.1.12",
    "fstream": "~0.1.17",
    "block-stream": "*",
    "inherits": "1",
    "mkdirp": "0.3",
    "read": "0",
    "lru-cache": "1",
    "node-gyp": "~0.4.1",
    "fstream-npm": "0 >=0.0.5",
    "uid-number": "0",
    "archy": "0",
    "chownr": "0"
  },
  "bundleDependencies": [
    "slide",
    "ini",
    "semver",
    "abbrev",
    "graceful-fs",
    "minimatch",
    "nopt",
    "node-uuid",
    "rimraf",
    "request",
    "proto-list",
    "which",
    "tar",
    "fstream",
    "block-stream",
    "inherits",
    "mkdirp",
    "read",
    "lru-cache",
    "node-gyp",
    "fstream-npm",
    "uid-number",
    "archy",
    "chownr"
  ],
  "devDependencies": {
    "ronn": "https://github.com/isaacs/ronnjs/tarball/master"
  },
  "engines": {
    "node": "0.6 || 0.7 || 0.8",
    "npm": "1"
  },
  "scripts": {
    "test": "node ./test/run.js",
    "prepublish": "npm prune; rm -rf node_modules/*/{test,example,bench}*; make -j4 doc",
    "dumpconf": "env | grep npm | sort | uniq"
  },
  "licenses": [
    {
      "type": "MIT +no-false-attribs",
      "url": "http://github.com/isaacs/npm/raw/master/LICENSE"
    }
  ]
}`,
  ],
  objects: [
    `{
    "a": true,
    "a": false
}`,
    `{}`,
  ],
};
const JSON5_PASSED_LIST = {
  "new-lines": [
    `{
    // This comment is terminated with \`\\r\`.
}`,
    `{
    // This comment is terminated with \`\\r\\n\`.
}`,
    `{
    // This comment is terminated with \`\\n\`.
}`,
    `{
    // the following string contains an escaped \`\\r\`
    a: 'line 1 \\
line 2'
}`,
    `{
    // the following string contains an escaped \`\\r\\n\`
    a: 'line 1 \\
line 2'
}`,
    `{
    // the following string contains an escaped \`\\n\`
    a: 'line 1 \\
line 2'
}`,
  ],
  comments: [
    `[
    false
    /*
        true
    */
]`,
    `null
/*
    Some non-comment top-level value is needed;
    we use null above.
*/`,
    `/*
    Some non-comment top-level value is needed;
    we use null below.
*/
null`,
    `/**
 * This is a JavaDoc-like block comment.
 * It contains asterisks inside of it.
 * It might also be closed with multiple asterisks.
 * Like this:
 **/
true`,
    `[
    false   // true
]`,
    `null // Some non-comment top-level value is needed; we use null here.`,
    `// Some non-comment top-level value is needed; we use null below.
null`,
  ],
  arrays: [
    `[
    null,
]`,
  ],
  strings: [
    `'I can\\'t wait'`,
    `'hello\\
 world'`,
    `'hello world'`,
  ],
  numbers: [
    `.5`,
    `5.e4`,
    `5.`,
    `0xc8`,
    `0XC8`,
    `0xc8e4`,
    `0xC8`,
    `Infinity`,
    `NaN`,
    `-.5`,
    `-5.`,
    `-0xC8`,
    `-Infinity`,
    `-.0`,
    `-0.`,
    `-0x0`,
    `+.5`,
    `+0.5`,
    `+5.`,
    `+1.2`,
    `+0xC8`,
    `+Infinity`,
    `+15`,
    `+.0`,
    `+0.`,
    `+0.0`,
    `+0x0`,
    `+0`,
    `.0`,
    `0.`,
    `0x0`,
  ],
  misc: [
    `{
  name: 'npm',
  publishConfig: {
    'proprietary-attribs': false,
  },
  description: 'A package manager for node',
  keywords: [
    'package manager',
    'modules',
    'install',
    'package.json',
  ],
  version: '1.1.22',
  preferGlobal: true,
  config: {
    publishtest: false,
  },
  homepage: 'http://npmjs.org/',
  author: 'Isaac Z. Schlueter <i@izs.me> (http://blog.izs.me)',
  repository: {
    type: 'git',
    url: 'https://github.com/isaacs/npm',
  },
  bugs: {
    email: 'npm-@googlegroups.com',
    url: 'http://github.com/isaacs/npm/issues',
  },
  directories: {
    doc: './doc',
    man: './man',
    lib: './lib',
    bin: './bin',
  },
  main: './lib/npm.js',
  bin: './bin/npm-cli.js',
  dependencies: {
    semver: '~1.0.14',
    ini: '1',
    slide: '1',
    abbrev: '1',
    'graceful-fs': '~1.1.1',
    minimatch: '~0.2',
    nopt: '1',
    'node-uuid': '~1.3',
    'proto-list': '1',
    rimraf: '2',
    request: '~2.9',
    which: '1',
    tar: '~0.1.12',
    fstream: '~0.1.17',
    'block-stream': '*',
    inherits: '1',
    mkdirp: '0.3',
    read: '0',
    'lru-cache': '1',
    'node-gyp': '~0.4.1',
    'fstream-npm': '0 >=0.0.5',
    'uid-number': '0',
    archy: '0',
    chownr: '0',
  },
  bundleDependencies: [
    'slide',
    'ini',
    'semver',
    'abbrev',
    'graceful-fs',
    'minimatch',
    'nopt',
    'node-uuid',
    'rimraf',
    'request',
    'proto-list',
    'which',
    'tar',
    'fstream',
    'block-stream',
    'inherits',
    'mkdirp',
    'read',
    'lru-cache',
    'node-gyp',
    'fstream-npm',
    'uid-number',
    'archy',
    'chownr',
  ],
  devDependencies: {
    ronn: 'https://github.com/isaacs/ronnjs/tarball/master',
  },
  engines: {
    node: '0.6 || 0.7 || 0.8',
    npm: '1',
  },
  scripts: {
    test: 'node ./test/run.js',
    prepublish: 'npm prune; rm -rf node_modules/*/{test,example,bench}*; make -j4 doc',
    dumpconf: 'env | grep npm | sort | uniq',
  },
  licenses: [
    {
      type: 'MIT +no-false-attribs',
      url: 'http://github.com/isaacs/npm/raw/master/LICENSE',
    },
  ],
}`,
    `{
    foo: 'bar',
    while: true,

    this: 'is a \\
multi-line string',

    // this is an inline comment
    here: 'is another', // inline comment

    /* this is a block comment
       that continues on another line */

    hex: 0xDEADbeef,
    half: .5,
    delta: +10,
    to: Infinity,   // and beyond!

    finally: 'a trailing comma',
    oh: [
        "we shouldn't forget",
        'arrays can have',
        'trailing commas too',
    ],
}`,
    `{
 \x0C   // An invalid form feed character (\\x0c) has been entered before this comment.
    // Be careful not to delete it.
  "a": true
}`,
  ],
  objects: [
    `{
    while: true
}`,
    `{
    'hello': "world"
}`,
    `{
    "foo": "bar",
}`,
    `{
    hello: "world",
    _: "underscore",
    $: "dollar sign",
    one1: "numerals",
    _$_: "multiple symbols",
    $_$hello123world_$_: "mixed"
}`,
  ],
  todo: [
    `{
    sig\\u03A3ma: "the sum of all things"
}`,
    `{
    \u00FCml\u00E5\u00FBt: "that's not really an \u00FCml\u00E5\u00FBt, but this is"
}`,
  ],
};
const ALL_FAILED_LIST = {
  comments: [
    `/*
    This should fail;
    comments cannot be the only top-level value.
*/`,
    `// This should fail; comments cannot be the only top-level value.`,
    `true
/*
    This block comment doesn't terminate.
    There was a legitimate value before this,
    but this is still invalid JS/JSON5.`,
  ],
  arrays: [
    `[
    ,null
]`,
    `[
    ,
]`,
    `[
    true
    false
]`,
  ],
  strings: [
    `"foo
bar"`,
  ],
  numbers: [
    `0x`,
    `1e2.3`,
    `1e0x4`,
    `1e-2.3`,
    `1e-0x4`,
    `1e+2.3`,
    `1e+0x4`,
    `.`,
    `-098`,
    `-0123`,
    `-00`,
    `0780`,
    `080`,
    `010`,
    `+098`,
    `+0123`,
    `+00`,
    `00`,
  ],
  misc: [``],
  objects: [
    `{
    10twenty: "ten twenty"
}`,
    `{
    multi-word: "multi-word"
}`,
    `{
    ,"foo": "bar"
}`,
    `{
    ,
}`,
    `{
    "foo": "bar"
    "hello": "world"
}`,
  ],
};

const checkOnlyState = <Opt extends JsonOption = JsonOption>(s: string, has_exception: boolean, option?: Opt) => {
  try {
    jsonNormalParse(s, option);
  } catch (e) {
    if (has_exception) return;
    throw new Error(`${s}\n${option}\nexpected no error, but got: ${e}`);
  }
  if (has_exception) {
    throw new Error(`${s}\n${option}\nexpected error, but got nothing`);
  }
};

describe("official_json", () => {
  test("json5", () => {
    for (const list of Object.values(ALL_PASSED_LIST)) {
      for (const s of list) {
        checkOnlyState(s, false);
        checkOnlyState(s, false, JSON5_OPTION);
      }
    }
    for (const list of Object.values(JSON5_PASSED_LIST)) {
      for (const s of list) {
        checkOnlyState(s, true);
        checkOnlyState(s, false, JSON5_OPTION);
      }
    }
    for (const list of Object.values(ALL_FAILED_LIST)) {
      for (const s of list) {
        checkOnlyState(s, true);
        checkOnlyState(s, true, JSON5_OPTION);
      }
    }
  });
});
