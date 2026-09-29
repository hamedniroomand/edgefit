<script setup lang="ts">
  import { withBase } from 'vitepress';

  import { runtimeLogos } from '../../logos.ts';
</script>

<template>
  <div class="runtime-logos">
    <p class="label">Checks your code against</p>
    <ul>
      <li
        v-for="runtime in runtimeLogos"
        :key="runtime.target"
      >
        <a
          :href="withBase(runtime.link)"
          :style="runtime.color ? { '--runtime-color': runtime.color } : undefined"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path :d="runtime.path" />
          </svg>
          <span>{{ runtime.name }}</span>
          <code>{{ runtime.target }}</code>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
  .runtime-logos {
    margin-top: 28px;
  }

  .label {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 500;
    color: var(--vp-c-text-3);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 10px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 8px;
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-2);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition:
      color 0.2s,
      border-color 0.2s;
  }

  a:hover {
    border-color: var(--runtime-color, var(--vp-c-text-2));
    color: var(--runtime-color, var(--vp-c-text-1));
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    fill: currentColor;
  }

  code {
    font-size: 12px;
    color: var(--vp-c-text-3);
  }

  @media (max-width: 959px) {
    .runtime-logos {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    ul {
      justify-content: center;
    }
  }
</style>
