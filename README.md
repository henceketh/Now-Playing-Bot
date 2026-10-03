# Now Playing Bot

Telegram inline-бот, который показывает текущую песню **одного подключённого Spotify-аккаунта** и готовит MP3 через поиск на YouTube. Текст inline-запроса не используется для поиска: это бот «сейчас играет».

## Запуск

Нужны Node.js 22+, npm, `yt-dlp` и `ffmpeg` в PATH. Установка Python нужна только если выбран Python-вариант установки yt-dlp.

```sh
git clone https://github.com/henceketh/Now-Playing-Bot.git
cd Now-Playing-Bot
npm ci
```

В копии после рефакторинга есть общий `package-lock.json` и npm workspace `Backend`; установка из корня устанавливает оба приложения.

1. Скопируйте `.env.example` в `.env`, а `Backend/.env.example` в `Backend/.env`.
2. Заполните `BOT_TOKEN`, `ALLOWED_USER_IDS` (Telegram ID через запятую), `AUDIO_BASE_URL`, Spotify credentials и `YOUTUBE_API_KEY`.
3. Зарегистрируйте в Spotify Dashboard тот же redirect URI, что указан в `Backend/.env`. По умолчанию это `http://127.0.0.1:3012/callback`; открывайте login на том же hostname, чтобы callback получил cookie.
4. Запустите backend: `npm run start:backend`. Откройте `http://127.0.0.1:3012/login` и подключите Spotify.
5. В другом терминале запустите бот: `npm start`.
6. В BotFather включите inline mode через `/setinline`. Отправьте боту `/god`, затем используйте `@имя_бота` в чате.

Для трека без кэша ответ приходит сразу со Spotify-ссылкой. MP3 готовится в фоне; повторите inline-запрос через несколько секунд. Для готового трека бот возвращает аудио.

`AUDIO_BASE_URL` должен быть доступен Telegram извне, например `https://your-host/audio`. Для этого направьте `/audio/` через HTTPS reverse proxy на бот `127.0.0.1:8888`. Backend по умолчанию слушает `127.0.0.1:3012`; оставьте его приватным. При удалённом запуске используйте SSH tunnel для первоначального OAuth либо защищённый доступ к backend. Не публикуйте `/login`, `/callback` и скачивание без контроля доступа: подключённый Spotify-аккаунт общий.

## Структура

```text
index.js                      запуск бота и HTTP-раздача MP3
config.js                     проверка настроек бота
bot/commands.js               /god, проверка allowlist
bot/inlineQuery.js            подготовка ответа Telegram
db/userDatabase.js            очередь изменений JSON-базы
utils/download.js             клиент backend и кэш MP3
utils/fileUtils.js            чтение JSON и атомарная запись
Backend/index.js              запуск Spotify API
Backend/config.js             проверка настроек backend
Backend/app.js                HTTP-маршруты, OAuth state, обработка ошибок
Backend/services/spotifyClient.js  HTTP-запросы Spotify с таймаутами
Backend/services/spotify.js    токены и нормализация playback
Backend/services/downloader.js поиск YouTube и запуск yt-dlp
Backend/services/lyrics.js     необязательные источники текстов
test/                         тесты без настоящих ключей и скачиваний
```

Все зависимости создаются в точках запуска и передаются обработчикам. Импорт сервисов не запускает сервер, бота или таймеры. CommonJS сохранён; сборка, TypeScript и DI-фреймворк не требуются.

## Настройки

Настройки бота читаются из корневого `.env`, backend — из `Backend/.env`; путь не зависит от текущей директории терминала. Уже заданные переменные процесса имеют приоритет.

| Бот | Назначение |
| --- | --- |
| `BOT_TOKEN` | Обязательный токен Telegram |
| `ALLOWED_USER_IDS` | Обязательный список разрешённых Telegram ID; удаление ID сразу закрывает доступ |
| `PORT`, `HOST` | `8888`, `127.0.0.1` по умолчанию |
| `USER_DB` | `users.json`; относительный путь от корня репозитория |
| `CACHE_DIR` | `cache`; относительный путь от корня репозитория |
| `AUDIO_BASE_URL` | Обязательный публичный URL каталога аудио |
| `BACKEND_URL` | `http://127.0.0.1:3012` по умолчанию |

| Backend | Назначение |
| --- | --- |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Обязательные credentials приложения |
| `SPOTIFY_REDIRECT_URI` | Обязательный полный callback URL |
| `YOUTUBE_API_KEY` | Обязательный ключ YouTube Data API |
| `PORT`, `HOST` | `3012`, `127.0.0.1` по умолчанию |
| `TOKEN_FILE` | `spotify-tokens.json`; относительный путь от `Backend/` |
| `SP_DC` | Необязательная cookie для неофициального Spotify lyrics endpoint |
| `GENIUS_API_TOKEN` | Необязательный поиск текстов через Genius, затем чтение HTML |

Тексты не нужны боту: он запрашивает `?lyrics=false`. Если провайдер текстов недоступен, playback API возвращает пустой список строк.

## Проверка

```sh
npm test
npm audit
```

Тесты проверяют OAuth, конкуренцию запросов и записей, refresh/retry токенов, пустой playback, смену трека, очистку файлов и ответы Telegram. Внешние API и процесс yt-dlp заменены контролируемыми зависимостями; HTTP-маршруты проверяются настоящими локальными запросами.

## Ограничения и миграция

- `/god` больше не открывает доступ любому: ID должен быть в `ALLOWED_USER_IDS`. Сохранённая авторизация сама по себе не обходит список.
- В `/currently-playing` добавлены `id` и `uri`; прежние поля playback сохранены. Отсутствие playback, пауза, эпизод и local track без Spotify ID означают «нет песни».
- `/download-current-song?track_id=...` возвращает `409`, если песня сменилась. Без параметра прежний маршрут продолжает работать. Имена в `X-Song-Name`/`X-Artist-Name` теперь кодируются через `encodeURIComponent`; клиентам этих заголовков нужен `decodeURIComponent`.
- Старый `/mazafakatospotik` оставлен как alias `/login`. Callback теперь требует OAuth state и login cookie.
- Старые случайные MP3 и `cache/1.bin` не используются: новый кэш имеет SHA-256 имя по URI трека. Существующие файлы локально сохранены.
- `users.json`, OAuth-токены, web token cache и аудио исключены из Git. Это не удаляет их из истории. Если в ранее опубликованных файлах были настоящие токены, отзовите их и выполните новый login. Не отправляйте `.git` как публичный архив исходников.
- JSON и блокировки предназначены для одного экземпляра каждого процесса. Для нескольких экземпляров понадобится SQLite/Postgres и общая очередь.
- Кэш не удаляется автоматически: выберите срок хранения и лимит диска с учётом того, что старые URL перестанут работать после удаления. Временные файлы очищаются при обычном успехе/ошибке; после принудительного завершения процесса возможны остатки `.tmp` и системных временных каталогов.
- Поиск YouTube выбирает первый результат и может найти кавер или неверную запись. Улучшайте matching только при реальной необходимости.

Подробный разбор исходных ошибок и следующие приоритеты: [REFACTOR.md](REFACTOR.md).

## Источники

OAuth сверяется с [Spotify Authorization Code Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow); пустой playback и ответы API — с [Spotify Playback State](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback). Формат inline-аудио и персональное кэширование — с [Telegram Bot API](https://core.telegram.org/bots/api#answerinlinequery).

Лицензия: [MIT](LICENSE.txt).
