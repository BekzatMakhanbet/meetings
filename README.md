# Teams Clone - Платформа Видеоконференций

Полнофункциональная платформа для видеоконференций с чатом и записью встреч, аналогичная Microsoft Teams.

## Функциональность

✅ **Аутентификация пользователей** - регистрация и вход  
✅ **Управление комнатами** - создание и присоединение к комнатам  
✅ **Видеоконференции** - групповые видеозвонки  
✅ **Чат в реальном времени** - обмен сообщениями во время встреч  
✅ **Демонстрация экрана** - показ экрана другим участникам  
✅ **Запись встреч** - сохранение видео встреч  
✅ **Управление медиа** - включение/выключение камеры и микрофона  

## Технологии

- **Frontend**: React, Socket.IO Client, OpenVidu Browser
- **Backend**: Node.js, Express, Socket.IO, PostgreSQL
- **Video**: OpenVidu Server
- **Database**: PostgreSQL
- **Deployment**: Docker Compose

## Быстрый старт

### Требования
- Docker и Docker Compose
- Свободные порты: 3000, 4443, 5000, 5432

### Запуск
```bash
# Клонируйте репозиторий
cd meetings

# Запустите все сервисы
docker-compose up -d

# Установите зависимости (если нужно)
cd client && npm install
cd ../server && npm install
```

### Доступ к приложению
- **Приложение**: http://localhost:3000
- **OpenVidu**: https://localhost:4443
- **API**: http://localhost:5000
- **PostgreSQL**: localhost:5432

## Использование

1. **Регистрация**: Создайте аккаунт на главной странице
2. **Создание комнаты**: Нажмите "Создать комнату" и введите название
3. **Присоединение**: Выберите комнату и нажмите "Присоединиться"
4. **Управление встречей**:
   - 📹 Включить/выключить камеру
   - 🎤 Включить/выключить микрофон
   - 🖥️ Демонстрация экрана
   - ⏺️ Запись встречи
   - 💬 Чат с участниками

## Структура проекта

```
meetings/
├── client/          # React фронтенд
├── server/          # Node.js API
├── recordings/      # Сохраненные записи
└── docker-compose.yml
```

## API Endpoints

### Аутентификация
- `POST /api/register` - Регистрация
- `POST /api/login` - Вход

### Комнаты
- `GET /api/rooms` - Список комнат
- `POST /api/rooms` - Создание комнаты
- `POST /api/session` - Получение токена для комнаты

### Записи
- `POST /api/recordings/start` - Начать запись
- `POST /api/recordings/stop` - Остановить запись
- `GET /api/recordings` - Список записей

### Чат
- `GET /api/rooms/:sessionId/messages` - История сообщений
- WebSocket события: `join-room`, `send-message`, `new-message`

## Конфигурация

Переменные окружения в `docker-compose.yml`:

```yaml
# База данных
POSTGRES_DB=meetings
POSTGRES_USER=postgres  
POSTGRES_PASSWORD=password

# OpenVidu
OPENVIDU_SECRET=MY_SECRET
OPENVIDU_PUBLICURL=https://localhost:4443

# API
PORT=5000
DATABASE_URL=postgresql://postgres:password@postgres:5432/meetings
```

## Разработка

### Локальная разработка
```bash
# Backend
cd server
npm install
npm start

# Frontend  
cd client
npm install
npm start

# PostgreSQL (через Docker)
docker run -d -p 5432:5432 -e POSTGRES_DB=meetings -e POSTGRES_PASSWORD=password postgres:15

# OpenVidu (через Docker)
docker run -d -p 4443:4443 -e OPENVIDU_SECRET=MY_SECRET openvidu/openvidu-server-kms:2.22.0
```

### База данных
Таблицы создаются автоматически при первом запуске:
- `users` - пользователи
- `rooms` - комнаты 
- `messages` - сообщения чата
- `recordings` - записи встреч

## Устранение неполадок

### Проблемы с демонстрацией экрана
- Убедитесь, что используете HTTPS или localhost
- Предоставьте права доступа к экрану в браузере

### Проблемы с записью
- Проверьте, что папка `recordings` доступна для записи
- Убедитесь, что OpenVidu сервер запущен

### Проблемы с подключением
- Проверьте, что все порты свободны
- Убедитесь, что Docker контейнеры запущены: `docker-compose ps`

## Лицензия

MIT License

## Поддержка

Для вопросов и предложений создавайте Issues в репозитории. 