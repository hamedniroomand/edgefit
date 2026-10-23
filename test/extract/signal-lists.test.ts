import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const kill = 'process.kill(process.pid)';
const guarded = ['api node:process.kill [not workerd] [not vercel-edge]'];
const plain = ['api node:process.kill'];

const killOf = (source: string): string[] =>
  usagesOf(source).filter(usage => usage.includes('process.kill'));

/** A class with a method that registers a handler for each signal of its parameter. */
const register = (walk: string, extra = ''): string =>
  `  register(signals) {\n    const stop = () => ${kill};\n    ${walk}\n${extra}  }\n`;
const forEach = 'signals.forEach(signal => {\n      process.on(signal, stop);\n    });';
const forOf = 'for (const signal of signals) {\n      process.on(signal, stop);\n    }';
const server = (start: string, method = register(forEach)): string =>
  `class Server {\n  start() {\n    ${start}\n  }\n${method}}\n`;

describe('a list of signals that the one call of a method passes', () => {
  it.each([
    ['forEach over the parameter', server("this.register(['SIGINT', 'SIGTERM']);")],
    ['for...of over the parameter', server("this.register(['SIGINT']);", register(forOf))],
    ['a call in an arrow function', server("[1].forEach(() => this.register(['SIGINT']));")],
    ['a call with an extra argument', server("this.register(['SIGHUP'], 1);")],
  ])('guards the handler for %s', (_name, source) => {
    expect(killOf(source)).toEqual(guarded);
  });
});

const onEach = (list: string): string =>
  `${list}.forEach(signal => process.on(signal, () => ${kill}));`;

describe('an event that no code can change', () => {
  it.each([
    ['a const string', `const event = 'SIGTERM';\nprocess.on(event, () => ${kill});`],
    [
      'a template of const strings',
      `const kind = 'TERM';\nprocess.on(\`SIG\${kind}\`, () => ${kill});`,
    ],
    [
      'for...of over an array written in place',
      `for (const signal of ['SIGINT', 'SIGTERM']) {\n  process.on(signal, () => ${kill});\n}`,
    ],
    ['forEach over an array written in place', onEach("['SIGINT', 'SIGTERM']")],
    [
      'forEach with an index',
      `['SIGINT', 'SIGTERM'].forEach((signal, index) => process.on(signal, () => ${kill}));`,
    ],
    [
      'forEach with a function expression',
      `['SIGINT'].forEach(function (signal) {\n  process.on(signal, () => ${kill});\n});`,
    ],
    [
      'an array that holds a const string',
      `const term = 'SIGTERM';\n${onEach("['SIGINT', term]")}`,
    ],
  ])('guards the handler for %s', (_name, source) => {
    expect(killOf(source)).toEqual(guarded);
  });

  it('keeps the finding for an array written in place with a string that is not a signal', () => {
    expect(killOf(onEach("['SIGINT', 'exit']"))).toEqual(plain);
  });
});

const unsettled: [string, string][] = [
  ['a list with a string that is not a signal', server("this.register(['SIGINT', 'exit']);")],
  ['a list with an element that is not a string', server("this.register(['SIGINT', 1]);")],
  ['a list with a spread', server("this.register(['SIGINT', ...more]);")],
  ['a list that is not known', server('this.register(list);')],
  ['a list that a const holds', `const names = ['SIGINT'];\n${server('this.register(names);')}`],
  [
    'a list that a const holds and code changes',
    `const names = ['SIGINT'];\nnames.push('exit');\n${server('this.register(names);')}`,
  ],
  ['no argument', server('this.register();')],
  ['two calls', server("this.register(['SIGINT']);\n    this.register(['SIGTERM']);")],
  [
    'a parameter with a default',
    server(
      "this.register(['SIGINT']);",
      register(forEach).replace('register(signals)', "register(signals = ['exit'])"),
    ),
  ],
  [
    'a parameter that the method also changes',
    server("this.register(['SIGINT']);", register(forEach, "    signals.push('exit');\n")),
  ],
  [
    'a default value of another parameter that holds the list',
    server(
      "this.register(['SIGINT']);",
      register(forEach, "    other.push('exit');\n").replace(
        'register(signals)',
        'register(signals, other = signals)',
      ),
    ),
  ],
  [
    'a default value of another parameter that changes the list',
    server(
      "this.register(['SIGINT']);",
      register(forEach).replace(
        'register(signals)',
        "register(signals, other = signals.push('exit'))",
      ),
    ),
  ],
  [
    'a callback that gets the list as a third parameter',
    server(
      "this.register(['SIGINT']);",
      register(forEach, "    signals.forEach((item, index, all) => all.push('exit'));\n"),
    ),
  ],
  [
    'a callback with a rest parameter',
    server(
      "this.register(['SIGINT']);",
      register(forEach, "    signals.forEach((...rest) => rest[2].push('exit'));\n"),
    ),
  ],
  [
    'a callback that is a name',
    server("this.register(['SIGINT']);", register(forEach, '    signals.forEach(handle);\n')),
  ],
  [
    'a method that uses arguments',
    server("this.register(['SIGINT']);", register(forEach, "    arguments[0].push('exit');\n")),
  ],
  [
    'a parameter that the method passes on',
    server("this.register(['SIGINT']);", register(forEach, '    keep(signals);\n')),
  ],
  [
    'a parameter that the method writes',
    server("this.register(['SIGINT']);", register(forEach, "    signals = ['exit'];\n")),
  ],
  ['a call on another object', server("this.register(['SIGINT']);\n    other.register(['exit']);")],
  [
    'a call in a function with its own this',
    server("[1].forEach(function () {\n      this.register(['SIGINT']);\n    });"),
  ],
  [
    'a read that is not a call',
    server("const f = this.register;\n    f(['exit']);\n    this.register(['SIGINT']);"),
  ],
  ['a call with call()', server("this.register.call(this, ['exit']);")],
  ['a call with an optional chain', server("this.register?.(['SIGINT']);")],
  ['a computed read of this', server("this[name](['exit']);\n    this.register(['SIGINT']);")],
  [
    'a method that two classes define',
    `${server("this.register(['SIGINT']);")}class Other {\n${register(forEach)}}\n`,
  ],
  [
    'a call from another class',
    `${server('')}class Other {\n  go() {\n    this.register(['SIGINT']);\n  }\n}\n`,
  ],
  [
    'a static method',
    `class Server {\n  static register(signals) {\n    const stop = () => ${kill};\n    signals.forEach(signal => {\n      process.on(signal, stop);\n    });\n  }\n}\nServer.register(['SIGINT']);`,
  ],
  [
    'a method of an object',
    `const server = {\n  register(signals) {\n    const stop = () => ${kill};\n    signals.forEach(signal => {\n      process.on(signal, stop);\n    });\n  },\n};\nserver.register(['SIGINT']);`,
  ],
  [
    'a list name that the calling method takes as a parameter',
    `const names = ['SIGINT'];\nclass Server {\n  start(names) {\n    this.register(names);\n  }\n${register(forEach)}}\n`,
  ],
  [
    'a method that the class defines twice',
    `class Server {\n  start() {\n    this.register(['SIGINT']);\n  }\n${register(forEach)}${register(forEach).replaceAll('stop', 'again')}}\n`,
  ],
  [
    'a key with the name of the method',
    server("this.register(['SIGINT']);\n    const hooks = { register: other };"),
  ],
];

describe('a list of signals that the calls of a method do not settle', () => {
  it.each(unsettled)('keeps the findings for %s', (_name, source) => {
    const found = killOf(source);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(usage => usage === plain[0])).toBe(true);
  });
});

const loop = (before: string): string => `${before}\n${onEach('names')}`;

const changeable: [string, string][] = [
  ['a list that a const holds', loop("const names = ['SIGINT', 'SIGTERM'];")],
  ['a list that push changes', loop("const names = ['SIGINT'];\nnames.push('exit');")],
  ['a list that splice changes', loop("const names = ['SIGINT'];\nnames.splice(0, 1, 'exit');")],
  [
    'a list that a function changes',
    loop("const names = ['SIGINT'];\nfunction add() {\n  names.push('exit');\n}\nadd();"),
  ],
  ['a list that another call gets', loop("const names = ['SIGINT'];\nkeep(names);")],
  [
    'an array in place that its callback changes through the third parameter',
    `['SIGINT', 'SIGTERM'].forEach((signal, index, all) => {\n  all[1] = 'exit';\n  process.on(signal, () => ${kill});\n});`,
  ],
  [
    'an array in place that its callback changes through arguments',
    `['SIGINT'].forEach(function (signal) {\n  arguments[2].push('exit');\n  process.on(signal, () => ${kill});\n});`,
  ],
  [
    'a loop variable that gets an element of a list that code changes',
    `const names = ['SIGTERM'];\nnames.splice(0, 1, 'exit');\nfor (let signal of ['SIGINT']) {\n  signal = names[0];\n  process.on(signal, () => ${kill});\n}`,
  ],
  ['a list that the file exports', loop("const names = ['SIGINT'];\nexport { names };")],
  ['a list that an export declares', loop("export const names = ['SIGINT'];")],
  [
    'an object that another call changes',
    `const event = { name: 'SIGINT' };\nmutate(event);\nprocess.on(event.name, () => ${kill});`,
  ],
  [
    'a let with known writes',
    `let event = 'SIGINT';\nif (flag) event = 'SIGTERM';\nprocess.on(event, () => ${kill});`,
  ],
  [
    'a parameter that each call fills',
    `function listen(event) {\n  process.on(event, () => ${kill});\n}\nlisten('SIGINT');`,
  ],
  ['a choice between two signals', `process.on(flag ? 'SIGINT' : 'SIGTERM', () => ${kill});`],
];

describe('an event that code can change', () => {
  it.each(changeable)('keeps the findings for %s', (_name, source) => {
    expect(killOf(source)).toEqual(plain);
  });
});
