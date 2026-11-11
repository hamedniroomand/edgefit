import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import type { VNode } from 'vue';

import Card from './components/Card.vue';
import CardGroup from './components/CardGroup.vue';
import GraphPattern from './components/GraphPattern.vue';
import HomeHero from './components/HomeHero.vue';
import PackageTable from './components/PackageTable.vue';
import Steps from './components/Steps.vue';

import './style.css';

export default {
  extends: DefaultTheme,
  Layout(): VNode {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => [h(GraphPattern), h(HomeHero)],
    });
  },
  enhanceApp({ app, router }): void {
    app.component('Card', Card);
    app.component('CardGroup', CardGroup);
    app.component('PackageTable', PackageTable);
    app.component('Steps', Steps);
    if (typeof document === 'undefined') {
      return;
    }
    // A new page moves in from the left. A change of the hash on the same page does not run
    // the animation.
    let last = location.pathname;
    router.onAfterRouteChange = (): void => {
      if (location.pathname === last || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      last = location.pathname;
      document.querySelector('.VPDoc .content-container, .VPHome')?.animate(
        [
          { opacity: 0, transform: 'translateX(-12px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    };
  },
} satisfies Theme;
