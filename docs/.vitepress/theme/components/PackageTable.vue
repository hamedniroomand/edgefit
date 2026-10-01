<script setup lang="ts">
  import { withBase } from 'vitepress';
  import { computed, onMounted, ref } from 'vue';

  type Status = 'pass' | 'warn' | 'fail' | 'error';

  interface Row {
    name: string;
    file: string;
    resolved: string | null;
    summary: Record<string, Status>;
    subpaths: number;
    error?: string;
    notes?: string;
  }

  interface Results {
    generatedAt: string;
    edgefit?: string;
    data: Record<string, string>;
    targets: string[];
    packages: Row[];
  }

  interface Detail {
    entries: {
      subpath: string;
      results: Record<
        string,
        { status: Status; errors: number; warnings: number; message?: string }
      >;
    }[];
  }

  const symbols: Record<Status, string> = { pass: '✓', warn: '⚠', fail: '✗', error: '?' };
  const words: Record<Status, string> = {
    pass: 'passes',
    warn: 'warnings only',
    fail: 'fails',
    error: 'could not be checked',
  };

  const results = ref<Results | undefined>(undefined);
  const loaded = ref(false);
  const query = ref('');
  const target = ref('');
  const status = ref<Status | ''>('');
  const sortBy = ref<'name' | 'status'>('name');
  const open = ref('');
  const details = ref<Record<string, Detail | undefined>>({});

  const site = 'https://edgefit.kitdev.space';

  const rank: Record<Status, number> = { pass: 0, warn: 1, error: 2, fail: 3 };

  // A package that could not be installed or checked has no summary: it counts as `error`.
  function statuses(row: Row, key = ''): Status[] {
    if (row.error !== undefined) {
      return ['error'];
    }
    return key === '' ? Object.values(row.summary) : row.summary[key] ? [row.summary[key]] : [];
  }

  function worst(row: Row): number {
    return Math.max(-1, ...statuses(row).map(value => rank[value]));
  }

  const rows = computed(() => {
    const all = results.value?.packages ?? [];
    const filtered = all.filter(row => {
      if (query.value !== '' && !row.name.includes(query.value.trim().toLowerCase())) {
        return false;
      }
      if (status.value === '') {
        return true;
      }
      return statuses(row, target.value).includes(status.value);
    });
    return sortBy.value === 'name'
      ? filtered
      : filtered.toSorted((a, b) => worst(b) - worst(a) || a.name.localeCompare(b.name));
  });

  async function toggle(row: Row): Promise<void> {
    open.value = open.value === row.file ? '' : row.file;
    if (open.value !== '' && details.value[row.file] === undefined && row.error === undefined) {
      const response = await fetch(withBase(`/packages/packages/${row.file}.json`));
      details.value[row.file] = response.ok ? ((await response.json()) as Detail) : undefined;
    }
  }

  function markdown(row: Row): string {
    const link = `${site}/packages/#${row.file}`;
    return `[![edgefit](${site}/packages/badges/${row.file}.svg)](${link})`;
  }

  onMounted(async () => {
    try {
      const response = await fetch(withBase('/packages/results.json'));
      results.value = response.ok ? ((await response.json()) as Results) : undefined;
    } catch {
      results.value = undefined;
    }
    loaded.value = true;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const row = results.value?.packages.find(item => item.file === hash);
    if (row !== undefined) {
      query.value = '';
      await toggle(row);
    }
  });
</script>

<template>
  <div class="ef-packages">
    <p v-if="!loaded">Loading the results…</p>
    <p
      v-else-if="results === undefined"
      class="ef-packages-empty"
    >
      No results are published yet. They come from the weekly
      <code>Package table</code> workflow and appear here after the next docs build.
    </p>
    <template v-else>
      <p class="ef-packages-meta">
        Checked {{ results.generatedAt.slice(0, 10) }} with edgefit {{ results.edgefit }}. Data:
        <span
          v-for="(version, runtime) in results.data"
          :key="runtime"
          >{{ runtime }} {{ version }};
        </span>
        <a :href="withBase('/guide/packages')">What a pass means</a>
      </p>
      <div class="ef-packages-controls">
        <input
          v-model="query"
          type="search"
          placeholder="Search packages"
          aria-label="Search packages"
        />
        <select
          v-model="target"
          aria-label="Target"
        >
          <option value="">Any target</option>
          <option
            v-for="key in results.targets"
            :key="key"
            :value="key"
          >
            {{ key }}
          </option>
        </select>
        <select
          v-model="status"
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option
            v-for="(word, key) in words"
            :key="key"
            :value="key"
          >
            {{ word }}
          </option>
        </select>
        <select
          v-model="sortBy"
          aria-label="Sort"
        >
          <option value="name">Sort by name</option>
          <option value="status">Worst first</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Version</th>
            <th
              v-for="key in results.targets"
              :key="key"
            >
              {{ key }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template
            v-for="row in rows"
            :key="row.file"
          >
            <tr
              :id="row.file"
              class="ef-packages-row"
              @click="toggle(row)"
            >
              <td>
                <a
                  :href="`#${row.file}`"
                  @click.prevent="toggle(row)"
                  >{{ row.name }}</a
                >
              </td>
              <td>{{ row.resolved ?? '' }}</td>
              <td
                v-if="row.error !== undefined"
                :colspan="results.targets.length"
              >
                could not be checked
              </td>
              <td
                v-for="key in row.error === undefined ? results.targets : []"
                v-else
                :key="key"
                :title="`${key}: ${row.summary[key] ? words[row.summary[key]] : ''}`"
                :class="`ef-status-${row.summary[key]}`"
              >
                {{ row.summary[key] ? symbols[row.summary[key]] : '' }}
              </td>
            </tr>
            <tr v-if="open === row.file">
              <td :colspan="results.targets.length + 2">
                <p v-if="row.error !== undefined">{{ row.error }}</p>
                <p v-if="row.notes">{{ row.notes }}</p>
                <table v-if="details[row.file]">
                  <thead>
                    <tr>
                      <th>Subpath</th>
                      <th
                        v-for="key in results.targets"
                        :key="key"
                      >
                        {{ key }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="entry in details[row.file]?.entries"
                      :key="entry.subpath"
                    >
                      <td>
                        <code>{{ entry.subpath }}</code>
                      </td>
                      <td
                        v-for="key in results.targets"
                        :key="key"
                        :title="entry.results[key]?.message"
                      >
                        <template v-if="entry.results[key]">
                          {{ symbols[entry.results[key].status] }}
                          <small
                            v-if="
                              entry.results[key].status !== 'pass' &&
                              entry.results[key].status !== 'error'
                            "
                          >
                            {{ entry.results[key].errors }} errors,
                            {{ entry.results[key].warnings }} warnings
                          </small>
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="row.error === undefined">
                  Badge:
                  <code>{{ markdown(row) }}</code>
                </p>
                <p v-if="row.error === undefined">
                  Findings for your own app:
                  <code>npx edgefit check</code>, since what you import may be narrower.
                </p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-if="rows.length === 0">No package matches.</p>
    </template>
  </div>
</template>

<style scoped>
  .ef-packages-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0;
  }
  .ef-packages-controls input,
  .ef-packages-controls select {
    padding: 6px 10px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 6px;
    background: var(--vp-c-bg-soft);
  }
  .ef-packages-row {
    cursor: pointer;
  }
  .ef-status-pass {
    color: var(--vp-c-green-1);
  }
  .ef-status-warn {
    color: var(--vp-c-yellow-1);
  }
  .ef-status-fail {
    color: var(--vp-c-red-1);
  }
  .ef-status-error {
    color: var(--vp-c-text-3);
  }
</style>
