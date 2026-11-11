<script setup lang="ts">
  import { useData } from 'vitepress';
  import { VPButton } from 'vitepress/theme';

  import ChainCheck from './ChainCheck.vue';
  import CopyCommand from './CopyCommand.vue';

  // The home page gives its hero text in the `intro` frontmatter. A `hero` key would also show the default hero.
  const { frontmatter } = useData();
</script>

<template>
  <section
    v-if="frontmatter.intro"
    class="ef-hero"
  >
    <div class="ef-hero-copy">
      <h1 class="ef-hero-title">
        <span class="ef-hero-name">{{ frontmatter.intro.name }}</span>
        {{ frontmatter.intro.text }}
      </h1>
      <p class="ef-hero-tagline">{{ frontmatter.intro.tagline }}</p>
      <div class="ef-hero-actions">
        <VPButton
          v-for="action in frontmatter.intro.actions"
          :key="action.link"
          size="medium"
          :theme="action.theme"
          :text="action.text"
          :href="action.link"
        />
      </div>
      <CopyCommand
        v-if="frontmatter.intro.command"
        :command="frontmatter.intro.command"
      />
    </div>
    <ChainCheck />
  </section>
</template>
