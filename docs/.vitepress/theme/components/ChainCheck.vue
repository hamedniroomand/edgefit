<script setup lang="ts">
  import { computed, ref } from 'vue';

  import { runtimeLogos } from '../../logos.ts';
  import { CHECK_SAMPLE } from './checkSample.ts';

  import '../widgets.css';

  type Target = keyof typeof CHECK_SAMPLE;

  // The import chains of the sample project. `api` is the index of the API in `fails` of the sample.
  const CHAINS = [
    { name: 'hono', api: undefined, label: undefined },
    { name: 'chokidar', api: 0, label: 'node:fs.watch' },
    { name: 'cross-spawn', api: 1, label: 'node:child_process.spawn' },
  ] as const;

  const targets = runtimeLogos.filter(logo => logo.target in CHECK_SAMPLE);
  const target = ref<Target>('workerd');
  const sample = computed(() => CHECK_SAMPLE[target.value]);

  const lines = computed(() => {
    const { head, findings, hidden, clean, summary } = sample.value;
    const more =
      hidden > 0
        ? [{ text: `${hidden} more ${hidden === 1 ? 'error' : 'errors'}`, kind: 'more' }]
        : [];
    return [
      { text: head[0], kind: 'head' },
      { text: head[1], kind: 'dim' },
      { text: '', kind: 'dim' },
      ...findings.flatMap(finding =>
        finding
          .map((text, at) => ({ text, kind: at === 0 ? 'error' : 'dim' }))
          .concat({ text: '', kind: 'dim' }),
      ),
      ...more,
      ...(clean === null
        ? []
        : [
            { text: clean, kind: 'ok' },
            { text: '', kind: 'dim' },
          ]),
      { text: summary, kind: clean === null ? 'error' : 'ok' },
    ];
  });
</script>

<template>
  <figure
    class="ef-chain"
    :data-target="target"
  >
    <div class="ef-chain-bar">
      <span
        id="ef-chain-pick"
        class="ef-chain-pick"
        >Run the check on</span
      >
      <div
        class="ef-chain-targets"
        role="group"
        aria-labelledby="ef-chain-pick"
      >
        <button
          v-for="runtime in targets"
          :key="runtime.target"
          type="button"
          class="ef-chain-target"
          :data-target="runtime.target"
          :aria-pressed="runtime.target === target"
          :title="runtime.name"
          @click="target = runtime.target as Target"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path :d="runtime.path" />
          </svg>
          {{ runtime.target }}
        </button>
      </div>
    </div>

    <!-- With this key, each change of the target runs the animation again. -->
    <div
      :key="target"
      class="ef-chain-stage"
      aria-live="polite"
    >
      <p class="ef-chain-node ef-chain-entry">
        src/index.ts<span class="ef-chain-role">entry</span>
      </p>
      <ul class="ef-chain-rows">
        <li
          v-for="(chain, row) in CHAINS"
          :key="chain.name"
          class="ef-chain-row"
          :class="chain.api !== undefined && sample.fails[chain.api] ? 'is-fail' : 'is-ok'"
          :style="{ '--row': row }"
        >
          <span class="ef-chain-node">{{ chain.name }}</span>
          <template v-if="chain.label !== undefined">
            <span
              class="ef-chain-link"
              aria-hidden="true"
            />
            <span class="ef-chain-node ef-chain-api">{{ chain.label }}</span>
          </template>
          <span class="ef-chain-state">
            {{ chain.api !== undefined && sample.fails[chain.api] ? 'does not run' : 'no finding' }}
          </span>
        </li>
      </ul>
    </div>

    <pre
      :key="target"
      class="ef-chain-output"
      tabindex="0"
      :aria-label="`Sample output of edgefit check for ${target}`"
    ><code><span
      v-for="(line, index) in lines"
      :key="index"
      class="ef-chain-line"
      :class="`is-${line.kind}`"
      :style="{ '--i': index }"
    >{{ line.text }}{{ '\n' }}</span></code></pre>

    <figcaption class="ef-chain-caption">
      This is a sample. It is real <code>edgefit check</code> output for a small project that
      imports hono, chokidar and cross-spawn. The sample shows only some of the lines. Other
      findings and the data, settings, note, fix and link lines are not shown.
    </figcaption>
  </figure>
</template>
