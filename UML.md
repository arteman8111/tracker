# UML

Диаграммы PlantUML. Вставляются в любой рендер PlantUML как есть.

## Компоненты

```plantuml
@startuml
skinparam backgroundColor #26272f
skinparam componentStyle rectangle
skinparam defaultFontName Segoe UI

component "Vue 3\nДоска, бэклог, roadmap" as UI
component "Express API" as API
database "PostgreSQL" as DB
folder "uploads" as Files

UI --> API : REST /api\nX-User-Id
API --> DB
API --> Files : вложения карточек
@enduml
```

## Данные

```plantuml
@startuml
skinparam backgroundColor #26272f
skinparam linetype ortho
hide circle

entity projects {
  * id
  --
  key
  name
}

entity users {
  * id
  --
  name
  email
  initials
}

entity sprints {
  * id
  --
  project_id
  name
  goal
  start_date
  end_date
  status
}

entity labels {
  * id
  --
  project_id
  name
}

entity issues {
  * id
  --
  project_id
  number
  type
  title
  description
  status
  priority
  estimate_hours
  assignee_id
  reporter_id
  sprint_id
  start_date
  due_date
  position
}

entity issue_labels {
  * issue_id
  * label_id
}

entity checklist_items {
  * id
  --
  issue_id
  title
  done
  position
}

entity comments {
  * id
  --
  issue_id
  author_id
  body
}

entity attachments {
  * id
  --
  issue_id
  filename
  stored_name
  size_bytes
  uploaded_by
}

entity time_logs {
  * id
  --
  issue_id
  user_id
  hours
  note
  logged_at
}

entity issue_history {
  * id
  --
  issue_id
  user_id
  field
  old_value
  new_value
}

projects ||--o{ sprints
projects ||--o{ labels
projects ||--o{ issues
users ||--o{ issues : assignee
users ||--o{ issues : reporter
sprints ||--o{ issues
issues ||--o{ issue_labels
labels ||--o{ issue_labels
issues ||--o{ checklist_items
issues ||--o{ comments
users ||--o{ comments
issues ||--o{ attachments
issues ||--o{ time_logs
users ||--o{ time_logs
issues ||--o{ issue_history
@enduml
```

## Статусы карточки

Переход разрешён между любыми состояниями.

```plantuml
@startuml
skinparam backgroundColor #26272f
hide empty description

state "К выполнению" as todo
state "В работе" as progress
state "Ревью" as review
state "Готово" as done

[*] --> todo
todo --> progress
todo --> review
todo --> done
progress --> todo
progress --> review
progress --> done
review --> todo
review --> progress
review --> done
done --> todo
done --> progress
done --> review
@enduml
```

## Статусы спринта

```plantuml
@startuml
skinparam backgroundColor #26272f
hide empty description

[*] --> planned
planned --> active : start\nесли нет другого активного
planned --> [*] : delete\nкарточки в бэклог
active --> closed : close\nнезавершённые в бэклог
@enduml
```

## Перенос карточки по доске

```plantuml
@startuml
skinparam backgroundColor #26272f

start
if (Включён фильтр или поиск?) then (да)
  :Перетаскивание выключено;
  stop
else (нет)
  :Клиент вставляет карточку\nв новую позицию колонки;
  :POST /issues/reorder\nstatus и ids по порядку;
  if (Колонка изменилась?) then (да)
    :История: статус;
  endif
  :Сервер записывает status и position;
endif
stop
@enduml
```
