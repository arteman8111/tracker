<script setup>
import { byId, formatShort, hoursText, PRIORITIES, TYPES } from '../labels.js'

defineProps({
  issue: { type: Object, required: true },
  over: Boolean,
  dragging: Boolean,
  locked: Boolean,
})

const emit = defineEmits(['open', 'dragstart', 'dragend', 'dragover', 'drop'])
</script>

<template>
  <article
    class="card"
    :class="{ over, dragging, critical: issue.priority === 'critical' }"
    :draggable="!locked"
    @click="emit('open')"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <header>
      <span class="key">{{ issue.key }}</span>
      <span class="type">{{ byId(TYPES, issue.type) }}</span>
      <span v-if="issue.assignee" class="avatar" :title="issue.assignee.name">{{ issue.assignee.initials }}</span>
    </header>
    <h3>{{ issue.title }}</h3>
    <footer>
      <span :class="{ warm: issue.priority === 'critical' }">{{ byId(PRIORITIES, issue.priority) }}</span>
      <span v-for="label in issue.labels.slice(0, 2)" :key="label.id">{{ label.name }}</span>
      <span v-if="issue.labels.length > 2">+{{ issue.labels.length - 2 }}</span>
      <span v-if="issue.checklistTotal">{{ issue.checklistDone }}/{{ issue.checklistTotal }}</span>
      <span v-if="issue.dueDate">{{ formatShort(issue.dueDate) }}</span>
      <span v-if="issue.estimateHours != null || issue.spentHours">
        {{ hoursText(issue.spentHours) }}<template v-if="issue.estimateHours != null"> / {{ hoursText(issue.estimateHours) }}</template> ч
      </span>
    </footer>
  </article>
</template>
