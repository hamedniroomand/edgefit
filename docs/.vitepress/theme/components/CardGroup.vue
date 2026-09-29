<script setup lang="ts">
  const props = defineProps<{ cols?: number | string }>();
</script>

<template>
  <div
    class="ef-card-group"
    :style="{ '--ef-cols': String(props.cols ?? 2) }"
  >
    <slot />
  </div>
</template>
