<script setup lang="ts">
  import { ref } from 'vue';

  const props = defineProps<{ command: string }>();
  const copied = ref(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(props.command);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1600);
  }
</script>

<template>
  <div class="ef-command">
    <span
      class="ef-command-prompt"
      aria-hidden="true"
      >$</span
    >
    <code class="ef-command-text">{{ command }}</code>
    <button
      type="button"
      class="ef-command-copy"
      aria-label="Copy the command"
      @click="copy"
    >
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
    <span
      class="visually-hidden"
      aria-live="polite"
      >{{ copied ? 'Copied' : '' }}</span
    >
  </div>
</template>
