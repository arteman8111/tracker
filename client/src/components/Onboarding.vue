<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Mark from './Mark.vue'

const props = defineProps({
  open: Boolean,
})

const emit = defineEmits(['close'])

const steps = [
  {
    title: 'Кто вы',
    text: 'Внизу слева выберите своё имя. Комментарии, часы и история пишутся от него. Если вас нет в списке, нажмите «+ человек».',
  },
  {
    title: 'Доска',
    text: 'Сверху введите название и нажмите «Добавить» — карточка встанет в «К выполнению». Перетащите её в «В работе», «Ревью» или «Готово». Пока включён поиск или фильтр, тащить нельзя.',
  },
  {
    title: 'Карточка',
    text: 'Нажмите на карточку. Справа откроются описание, приоритет, метки, чеклист, файлы, комментарии и часы. Поля сохраняются сами. Закрыть панель — «Закрыть» или Escape.',
  },
  {
    title: 'Бэклог',
    text: 'Слева откройте «Бэклог». Там очередь и спринты. «Запустить» делает спринт текущим. «Закрыть» оставляет готовые карточки в спринте, остальные возвращает в бэклог.',
  },
  {
    title: 'Сроки',
    text: '«Roadmap» — шкала по дням. Чтобы карточка стала полосой, откройте её и заполните начало или дедлайн.',
  },
]

const index = ref(0)

watch(() => props.open, (value) => {
  if (value) index.value = 0
})

function onKey(event) {
  if (event.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="guide-back" @click="emit('close')"></div>
  <section v-if="open" class="guide" role="dialog" aria-labelledby="guide-title" @click.stop>
    <Mark />
    <p class="guide-kicker">{{ index + 1 }} / {{ steps.length }}</p>
    <h2 id="guide-title">{{ steps[index].title }}</h2>
    <p>{{ steps[index].text }}</p>
    <div class="guide-foot">
      <button class="btn quiet" type="button" @click="emit('close')">Пропустить</button>
      <button class="btn" type="button" :disabled="index === 0" @click="index -= 1">Назад</button>
      <button v-if="index < steps.length - 1" class="btn" type="button" @click="index += 1">Дальше</button>
      <button v-else class="btn" type="button" @click="emit('close')">Понятно</button>
    </div>
  </section>
</template>
