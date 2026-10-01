import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import type { VNode } from 'vue';

import Card from './components/Card.vue';
import CardGroup from './components/CardGroup.vue';
import GraphPattern from './components/GraphPattern.vue';
import PackageTable from './components/PackageTable.vue';
import RuntimeLogos from './components/RuntimeLogos.vue';
import Steps from './components/Steps.vue';
import Terminal from './components/Terminal.vue';

import './style.css';

export default {
  extends: DefaultTheme,
  Layout(): VNode {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => h(GraphPattern),
      'home-hero-actions-after': () => h(RuntimeLogos),
    });
  },
  enhanceApp({ app }): void {
    app.component('Card', Card);
    app.component('CardGroup', CardGroup);
    app.component('PackageTable', PackageTable);
    app.component('Steps', Steps);
    app.component('Terminal', Terminal);
  },
} satisfies Theme;
