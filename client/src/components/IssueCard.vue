<script setup>
import { computed } from 'vue'
import { byId, chipColor, formatShort, hoursText, PRIORITIES, shortName, TYPES } from '../labels.js'

const props = defineProps({
  issue: { type: Object, required: true },
  over: Boolean,
  dragging: Boolean,
  locked: Boolean,
})

const emit = defineEmits(['open', 'dragstart', 'dragend', 'dragover', 'drop'])

const people = computed(() => (
  props.issue.assignees?.length
    ? props.issue.assignees
    : (props.issue.assignee ? [props.issue.assignee] : [])
))
</script>

<template>
  <article
    class="card"
    :class="[issue.type, { over, dragging, critical: issue.priority === 'critical' }]"
    :draggable="!locked"
    @click="emit('open')"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <div v-if="people.length" class="people">
      <span v-for="person in people" :key="person.id" class="who" :title="person.name">{{ shortName(person.name) }}</span>
    </div>
    <header>
      <span class="key">{{ issue.key }}</span>
      <span class="type" :class="issue.type">{{ byId(TYPES, issue.type) }}</span>
    </header>
    <h3>{{ issue.title }}</h3>
    <footer>
      <span class="tag" :class="issue.priority">{{ byId(PRIORITIES, issue.priority) }}</span>
      <span
        v-for="label in issue.labels.slice(0, 2)"
        :key="label.id"
        class="tag"
        :style="{ '--chip': chipColor(label.name) }"
      >{{ label.name }}</span>
      <span v-if="issue.labels.length > 2">+{{ issue.labels.length - 2 }}</span>
      <span v-if="issue.checklistTotal">{{ issue.checklistDone }}/{{ issue.checklistTotal }}</span>
      <span v-if="issue.dueDate">{{ formatShort(issue.dueDate) }}</span>
      <span v-if="issue.estimateHours != null || issue.spentHours">
        {{ hoursText(issue.spentHours) }}<template v-if="issue.estimateHours != null"> / {{ hoursText(issue.estimateHours) }}</template> ч
      </span>
    </footer>
  </article>
</template>
