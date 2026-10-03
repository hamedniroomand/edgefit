<script setup lang="ts">
  import { withBase } from 'vitepress';
  import { computed, onMounted, ref } from 'vue';

  type Status = 'pass' | 'warn' | 'fail' | 'error' | 'unchecked';

  interface Row {
    name: string;
    file: string;
    resolved: string | null;
    summary: Record<string, Status>;
    main?: string;
    worst?: Record<string, { subpath: string; status: Status }>;
    worstExport?: Record<string, { subpath: string; name: string; status: Status }>;
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
        {
          status: Status;
          errors: number;
          warnings: number;
          message?: string;
          notes?: string[];
          exports?: { name: string; findings: { api: string; category: string }[] }[];
        }
      >;
    }[];
  }

  const symbols: Record<Status, string> = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
    error: '?',
    unchecked: '–',
  };
  const words: Record<Status, string> = {
    pass: 'passes',
    warn: 'warnings only',
    fail: 'fails',
    error: 'could not be checked',
    unchecked: 'not checked',
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

  const rank: Record<Status, number> = { pass: 0, unchecked: 0, warn: 1, error: 2, fail: 3 };

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

  function cellTitle(row: Row, key: string): string {
    const overall = row.summary[key];
    const parts = [`${key}: ${overall ? words[overall] : ''}`];
    if (row.main !== undefined) {
      parts.push(`main entry ${row.main}`);
    }
    const worst = row.worst?.[key];
    if (worst !== undefined) {
      parts.push(`worst subpath ${worst.subpath} ${words[worst.status]}`);
    }
    const worstExport = row.worstExport?.[key];
    if (worstExport !== undefined) {
      parts.push(
        `worst export ${worstExport.name} of ${worstExport.subpath} ${words[worstExport.status]}`,
      );
    }
    return parts.join(', ');
  }

  // What the check did not cover, with the subpaths that have it.
  const notes = computed(() => {
    const bySubpaths = new Map<string, Set<string>>();
    for (const entry of details.value[open.value]?.entries ?? []) {
      for (const result of Object.values(entry.results)) {
        for (const note of result.notes ?? []) {
          bySubpaths.set(note, (bySubpaths.get(note) ?? new Set<string>()).add(entry.subpath));
        }
      }
    }
    return [...bySubpaths].map(([note, subpaths]) => `${note}: ${[...subpaths].join(', ')}`);
  });

  // The findings that only some exports reach, one line for each export of a subpath on a target.
  const exportLines = computed(() =>
    (details.value[open.value]?.entries ?? []).flatMap(entry =>
      Object.entries(entry.results).flatMap(([key, result]) =>
        (result.exports ?? []).map(
          item =>
            `${entry.subpath} on ${key}, only through ${item.name}: ${item.findings.map(finding => `${finding.category} ${finding.api}`).join(', ')}`,
        ),
      ),
    ),
  );

  const failing = computed(() =>
    (details.value[open.value]?.entries ?? []).filter(entry =>
      Object.values(entry.results).some(result => result.status !== 'pass'),
    ),
  );

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
      <p class="ef-packages-legend">
        The first mark is the result of the main entry, which is what an import of the package gets.
        A second, smaller mark is the worst subpath, when it is worse. A third is the worst export,
        when an export has findings that the first mark does not count. The status filter and the
        sort use the first mark. A package without a main entry shows its worst subpath, unless its
        row names the subpath that stands for it.
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
                :title="cellTitle(row, key)"
              >
                <template v-if="row.summary[key]">
                  <span :class="`ef-status-${row.summary[key]}`">{{
                    symbols[row.summary[key]]
                  }}</span>
                  <span
                    v-if="row.worst?.[key]"
                    :class="[`ef-status-${row.worst[key].status}`, 'ef-worst']"
                    >{{ symbols[row.worst[key].status] }}</span
                  >
                  <span
                    v-if="row.worstExport?.[key]"
                    :class="[`ef-status-${row.worstExport[key].status}`, 'ef-worst']"
                    >{{ symbols[row.worstExport[key].status] }}</span
                  >
                </template>
              </td>
            </tr>
            <tr v-if="open === row.file">
              <td :colspan="results.targets.length + 2">
                <p v-if="row.error !== undefined">{{ row.error }}</p>
                <p v-if="row.notes">{{ row.notes }}</p>
                <p v-if="details[row.file]">
                  {{ details[row.file]?.entries.length }} subpaths checked, {{ failing.length }} not
                  a pass.
                </p>
                <table v-if="failing.length > 0">
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
                      v-for="entry in failing"
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
                              entry.results[key].status !== 'error' &&
                              entry.results[key].status !== 'unchecked'
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
                <p
                  v-for="line in exportLines"
                  :key="line"
                >
                  {{ line }}
                </p>
                <p
                  v-for="note in notes"
                  :key="note"
                >
                  {{ note }}
                </p>
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
  .ef-worst {
    font-size: 0.75em;
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
  .ef-status-error,
  .ef-status-unchecked {
    color: var(--vp-c-text-3);
  }
</style>
