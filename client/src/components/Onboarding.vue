<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: Boolean,
})

const emit = defineEmits(['close'])

const steps = [
  {
    title: 'Кто вы',
    text: 'Вход по почте и паролю. Внизу слева — вы, иконка вопроса открывает эту подсказку, солнце меняет тему.',
    shot: 'foot',
  },
  {
    title: 'Канбан',
    text: 'Слева колонка «Бэклог». Перетащите карточку в «В работе», «Ревью» или «Готово». Подсвеченная колонка — место, куда она встанет. Пока включён фильтр, тащить нельзя.',
    shot: 'board',
  },
  {
    title: 'Карточка',
    text: 'Клик по карточке открывает панель справа. Можно выбрать несколько исполнителей. Поля сохраняются сами. Закрыть — крестик или Escape.',
    shot: 'card',
  },
  {
    title: 'Проект',
    text: 'Слева «Проекты» открывает канбан. Сверху переключатель: Канбан, Бэклог, Роудмап. На бэклоге карточки так же перетаскиваются между очередью и спринтами.',
    shot: 'nav',
  },
  {
    title: 'Сроки',
    text: 'Роудмап — шкала по дням. Чтобы карточка стала полосой, откройте её и заполните начало или дедлайн.',
    shot: 'road',
  },
]

const index = ref(0)
const step = () => steps[index.value]

watch(() => props.open, (value) => {
  if (value) index.value = 0
})

function onKey(event) {
  if (!props.open) return
  if (event.key === 'Escape') emit('close')
  if (event.key === 'ArrowRight' && index.value < steps.length - 1) index.value += 1
  if (event.key === 'ArrowLeft' && index.value > 0) index.value -= 1
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="guide-back" @click="emit('close')"></div>
  <section v-if="open" class="guide" role="dialog" aria-labelledby="guide-title" @click.stop>
    <p class="guide-kicker">{{ index + 1 }} / {{ steps.length }}</p>
    <h2 id="guide-title">{{ step().title }}</h2>
    <div class="shot" :class="step().shot" aria-hidden="true">
      <div v-if="step().shot === 'foot'" class="mock side">
        <span>Команда</span>
        <span class="hit">Вы · Артём Волков</span>
        <span class="hit icons">? &nbsp; тема</span>
      </div>
      <div v-else-if="step().shot === 'board'" class="mock board">
        <span class="hit">Бэклог</span>
        <span>В работе</span>
        <span>Ревью</span>
        <span>Готово</span>
      </div>
      <div v-else-if="step().shot === 'card'" class="mock card">
        <span class="hit">Карточка</span>
        <span>Исполнители</span>
      </div>
      <div v-else-if="step().shot === 'nav'" class="mock nav">
        <span class="hit">Проекты</span>
        <span class="hit">Канбан</span>
        <span>Бэклог</span>
        <span>Роудмап</span>
      </div>
      <div v-else class="mock road">
        <span class="bar"></span>
        <span class="hit bar short"></span>
      </div>
    </div>
    <p>{{ step().text }}</p>
    <div class="guide-foot">
      <button class="btn quiet" type="button" @click="emit('close')">Пропустить</button>
      <button class="icon-btn" type="button" aria-label="Назад" :disabled="index === 0" @click="index -= 1">
        <Icon name="left" />
      </button>
      <button v-if="index < steps.length - 1" class="icon-btn" type="button" aria-label="Дальше" @click="index += 1">
        <Icon name="right" />
      </button>
      <button v-else class="btn" type="button" @click="emit('close')">Понятно</button>
    </div>
  </section>
</template>
