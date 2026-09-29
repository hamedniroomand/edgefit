<script setup lang="ts">
  // A module graph drawn behind the home hero: an entry fanning out to its imports.
  const patternId = 'edgefit-graph';
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    class="ef-graph-pattern"
  >
    <defs>
      <pattern
        :id="patternId"
        width="320"
        height="240"
        patternUnits="userSpaceOnUse"
      >
        <g
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
        >
          <path d="M40 40v40a16 16 0 0 0 16 16h64" />
          <path d="M40 80v64a16 16 0 0 0 16 16h24" />
          <path d="M136 96h48a16 16 0 0 1 16 16v24" />
          <path
            d="M200 152v32a16 16 0 0 0 16 16h56"
            opacity="0.5"
          />
          <path
            d="M232 32h40a16 16 0 0 1 16 16v32"
            opacity="0.5"
          />
          <rect
            x="28"
            y="20"
            width="24"
            height="20"
            rx="5"
          />
          <rect
            x="120"
            y="86"
            width="16"
            height="20"
            rx="4"
          />
          <circle
            cx="88"
            cy="160"
            r="6"
          />
          <circle
            cx="200"
            cy="144"
            r="6"
          />
          <circle
            cx="280"
            cy="200"
            r="6"
            opacity="0.5"
          />
          <circle
            cx="224"
            cy="32"
            r="6"
            opacity="0.5"
          />
          <circle
            cx="288"
            cy="88"
            r="6"
            opacity="0.5"
          />
        </g>
      </pattern>
    </defs>
    <rect
      width="100%"
      height="100%"
      :fill="`url(#${patternId})`"
    />
  </svg>
</template>
