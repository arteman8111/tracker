# RKS

Трекер для небольшой команды. Доска, карточка, бэклог, спринты и простая шкала сроков.

Спецификация — в [SPEKA.md](SPEKA.md). Журнал изменений — в [CONTEXT.md](CONTEXT.md). Диаграммы — в [UML.md](UML.md).

## Стек

- Vue 3, Composition API, Vue Router, Vite
- Node.js, Express
- PostgreSQL 16

## Структура

```
README.md            как устроен проект и как его запустить
SPEKA.md             спецификация, ей следует код
CONTEXT.md           журнал изменений
UML.md               диаграммы PlantUML
docker-compose.yml   PostgreSQL
server/              API
  src/index.js       запуск, мета, люди
  src/db.js          пул и транзакции
  src/schema.sql     схема
  src/seed.js        начальные данные
  src/util.js        ошибки и история
  src/issues.js      карточки, порядок, метки
  src/collab.js      чеклист, комментарии, файлы, время
  src/sprints.js     спринты
  uploads/           файлы карточек, в git не входят
client/              интерфейс
  src/App.vue        каркас: панель и панель карточки
  src/styles.css     вся визуальная система
  src/api.js         запросы
  src/state.js       состояние экранов
  src/labels.js      подписи статусов, дат, часов
  src/views/         Доска, Бэклог, Roadmap
  src/components/    карточка колонки, панель задачи, знак
```

## Запуск

Нужны Node.js 22, npm и Docker.

```bash
docker compose up -d
npm install --prefix server
npm install --prefix client
npm run dev --prefix server
npm run dev --prefix client
```

Сервер: `http://127.0.0.1:3001`. Интерфейс: `http://localhost:5173`. Запросы `/api` с клиента проксируются на сервер.

База: пользователь `rks`, пароль `rks`, база `rks`, порт `5432`. Это локальные данные для разработки, они записаны в `docker-compose.yml`.

Сбросить базу вместе с карточками:

```bash
docker compose down -v
docker compose up -d
```

Сервер сам создаёт таблицы и, если база пустая, наполняет её.

В боковой панели выбирается, от чьего имени пишутся комментарии, время и история.

## Ветки

Каждая законченная часть лежит в своей ветке и влита в `main` отдельным слиянием.

```bash
git log --oneline --graph --all
```
