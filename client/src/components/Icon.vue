<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path v-if="name === 'close'" d="M6 6l12 12M18 6L6 18" />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'clock'" d="M12 7v5l3 2" />
    <circle v-if="name === 'clock'" cx="12" cy="12" r="7" />
    <path v-else-if="name === 'trash'" d="M5 8h14M9 8V6h6v2M8 8l1 11h6l1-11" />
    <path v-else-if="name === 'send'" d="M4 12l16-7-6 16-2-7-8-2z" />
    <path v-else-if="name === 'clip'" d="M8 12.5l6.2-6.2a3 3 0 014.2 4.2l-7.6 7.6a4.2 4.2 0 01-6-6l7-7" />
    <path v-else-if="name === 'help'" d="M9.5 9a2.5 2.5 0 115 1c0 2-2.5 2-2.5 4" />
    <path v-else-if="name === 'help-dot'" d="M12 17.5h.01" />
    <circle v-if="name === 'help'" cx="12" cy="12" r="8" />
    <path v-else-if="name === 'sun'" d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    <path v-else-if="name === 'moon'" d="M16 14.5A6.5 6.5 0 1110 6a5 5 0 006 8.5z" />
    <path v-else-if="name === 'left'" d="M14 6l-6 6 6 6" />
    <path v-else-if="name === 'right'" d="M10 6l6 6-6 6" />
    <path v-else-if="name === 'menu'" d="M4 7h16M4 12h16M4 17h16" />
    <path v-else-if="name === 'pencil'" d="M4 20l4.2-1 10-10-3.2-3.2-10 10L4 20z" />
    <path v-else-if="name === 'file'" d="M7 4h7l5 5v11H7V4z" />
    <path v-else-if="name === 'logout'" d="M10 7V5h9v14h-9v-2M13 12H4m0 0l3-3M4 12l3 3" />
  </svg>
</template>
