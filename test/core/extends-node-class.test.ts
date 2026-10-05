import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { classify } from '@/core/classify.ts';
import { CompatIndex } from '@/data/compat-index.ts';
import { extractUsages } from '@/extract/index.ts';
import type { Target } from '@/targets/index.ts';
import { fixture, stubTarget } from '~/helpers.ts';

describe('a class that extends a Node.js class', () => {
  it('has no finding on workerd, bun and deno', async () => {
    const result = await check({
      root: fixture('extends-app'),
      config: { targets: ['workerd', 'bun', 'deno'], entry: 'src/index.js' },
    });
    expect(result.reports.map(report => report.findings.map(finding => finding.api))).toEqual([
      [],
      [],
      [],
    ]);
  });
});

const reason = 'extended by a class, so its instance members may be used elsewhere';

const tree = {
  '*self*': 'object',
  default: { '*self*': 'function', prototype: { emit: 'function' } },
};
const index = new CompatIndex(
  {
    baseline: { events: tree },
    runtime: { events: tree },
    source: { provider: 'test', version: '1' },
  },
  [
    {
      target: 'workerd',
      module: 'events',
      path: ['prototype', 'emit'],
      status: 'unsupported',
      source: { provider: 'test', version: '1' },
    },
  ],
);
const target: Target = {
  ...stubTarget(),
  lookup: api => index.lookup(api),
  hasProblemsBelow: api => index.hasProblemsBelow(api),
};

function details(source: string): (string | undefined)[] {
  return extractUsages('src/input.ts', source, { globals: new Set(), nodeEnv: 'production' }).map(
    usage => classify(usage, target)?.detail,
  );
}

describe('a class whose data lacks an instance member', () => {
  it('still warns for a class that extends the parent', () => {
    expect(details("import E from 'events';\nclass A extends E {}")).toContain(
      `cannot be checked statically: ${reason}`,
    );
  });

  it('still warns for util.inherits', () => {
    const source = "import E from 'events';\nimport { inherits } from 'util';\ninherits(A, E);";
    expect(details(source)).toContain(`cannot be checked statically: ${reason}`);
  });
});

const passed = 'passed on as a value, so its members may be used elsewhere';

describe('a parameter of a function that is called at once and is a parent class', () => {
  const events = "const events = require('events');\n";

  it('warns as a parent class for a class that extends the parameter', () => {
    const source = `${events}module.exports = (function (Base) {\n  return class A extends Base {};\n})(events);`;
    const found = details(source);
    expect(found).toContain(`cannot be checked statically: ${reason}`);
    expect(found).not.toContain(`cannot be checked statically: ${passed}`);
  });

  it('warns as a parent class for the extend helper of CoffeeScript', () => {
    const source = [
      'var extend = function (child, parent) {',
      '  function ctor() {}',
      '  ctor.prototype = parent.prototype;',
      '  child.prototype = new ctor();',
      '};',
      `${events}exports.A = (function (superClass) {`,
      '  extend(A, superClass);',
      '  function A() {}',
      '  return A;',
      '})(events);',
    ].join('\n');
    const found = details(source);
    expect(found).toContain(`cannot be checked statically: ${reason}`);
    expect(found).not.toContain(`cannot be checked statically: ${passed}`);
  });

  it('keeps the value passed on for an extend with no parent parameter', () => {
    const source = `function extend(child) {\n  child.prototype = {};\n}\n${events}(function (src) { extend(config, src); })(events);`;
    expect(details(source)).toContain(`cannot be checked statically: ${passed}`);
  });

  it('keeps the value passed on for an extend that does not read the parent prototype', () => {
    const source = `function extend(child, parent) {\n  child.prototype = {};\n}\n${events}(function (src) { extend(config, src); })(events);`;
    expect(details(source)).toContain(`cannot be checked statically: ${passed}`);
  });

  it('keeps the value passed on for an extend of the file that only copies members', () => {
    const source = `function extend(target, source) {\n  Object.assign(target, source);\n}\n${events}(function (src) { extend(config, src); })(events);`;
    expect(details(source)).toContain(`cannot be checked statically: ${passed}`);
  });

  it('keeps the value passed on for an extend that is not a function of the file', () => {
    const source = `const { extend } = require('lodash');\n${events}(function (src) { extend(config, src); })(events);`;
    expect(details(source)).toContain(`cannot be checked statically: ${passed}`);
  });
});

describe('an extend helper of the file with another name or called with the module', () => {
  const helper = [
    'var __extends = function (child, parent) {',
    '  function ctor() {}',
    '  ctor.prototype = parent.prototype;',
    '  child.prototype = new ctor();',
    '};',
    "const events = require('events');",
  ].join('\n');

  it('warns as a parent class for a helper with another name', () => {
    const source = `${helper}\n(function (superClass) {\n  __extends(A, superClass);\n})(events);`;
    const found = details(source);
    expect(found).toContain(`cannot be checked statically: ${reason}`);
    expect(found).not.toContain(`cannot be checked statically: ${passed}`);
  });

  it('warns as a parent class for a helper called with the module itself', () => {
    const found = details(`${helper}\nfunction A() {}\n__extends(A, events);`);
    expect(found).toContain(`cannot be checked statically: ${reason}`);
    expect(found).not.toContain(`cannot be checked statically: ${passed}`);
  });

  it('does not count the module after a spread, whose position is not known', () => {
    const found = details(`${helper}\n__extends(...pair, events);`);
    expect(found).not.toContain(`cannot be checked statically: ${reason}`);
  });
});
