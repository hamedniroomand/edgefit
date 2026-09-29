<script setup lang="ts">
  import { withBase } from 'vitepress';
  import { computed } from 'vue';

  import { icon as iconSvg } from '../../icons.ts';

  const props = defineProps<{ title?: string; icon?: string; to?: string }>();

  const glyph = computed(() => (props.icon === undefined ? '' : iconSvg(props.icon)));
  const arrow = iconSvg('arrow-right');
</script>

<template>
  <component
    :is="to ? 'a' : 'div'"
    class="ef-card"
    :class="{ 'ef-card-link': to }"
    :href="to ? withBase(to) : undefined"
  >
    <span
      v-if="glyph"
      class="ef-card-glyph"
      v-html="glyph"
    />
    <p
      v-if="title"
      class="ef-card-title"
    >
      {{ title }}
    </p>
    <div class="ef-card-body">
      <slot />
    </div>
    <span
      v-if="to"
      class="ef-card-arrow"
      v-html="arrow"
    />
  </component>
</template>
