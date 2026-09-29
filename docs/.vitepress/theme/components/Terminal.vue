<script setup lang="ts">
  import { withBase } from 'vitepress';

  defineProps<{ src: string; alt: string; title?: string }>();
</script>

<template>
  <figure class="ef-terminal">
    <figcaption
      class="ef-terminal-bar"
      aria-hidden="true"
    >
      <span class="ef-terminal-dots"><i /><i /><i /></span>
      <span class="ef-terminal-title">{{ title }}</span>
    </figcaption>
    <img
      class="ef-terminal-screen"
      :src="withBase(src)"
      :alt="alt"
      loading="lazy"
    />
  </figure>
</template>
