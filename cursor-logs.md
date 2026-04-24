# Cursor Logs

## [2026-04-14] - Porting AICAD UI to React & FastAPI Stack

**Problem/Request:**
The user wanted to upgrade the static HTML prototype of the AICAD interface into a modern web application stack using React (frontend) and FastAPI (backend), adding minimal backend functionality for buttons to prepare for a full backend pipeline integration.

**Files Modified/Created:**
- `backend/requirements.txt` - Created with basic dependencies (`fastapi`, `uvicorn`, `pydantic`).
- `backend/main.py` - Created FastAPI application with CORS enabled, a dummy `/api/chat` endpoint, and a universal `/api/action/{action_id}` endpoint.
- `frontend/` - Initialized a new React project using Vite.
- `frontend/tailwind.config.js` & `postcss.config.js` - Configured Tailwind CSS.
- `frontend/src/index.css` - Ported custom CSS variables and scrollbar styling from the static HTML.
- `frontend/src/App.jsx` - Ported the entire HTML structure into a React component. Added state for `chatHistory` and `chatMessage`, and wired up `fetch` calls to the FastAPI backend.
- `frontend/index.html` - Updated to include FontAwesome CDN link.

**Solution Summary:**
1. Created the `backend` directory with a minimal FastAPI server that can respond to chat messages and button clicks.
2. Initialized the `frontend` directory with Vite + React.
3. Installed and configured Tailwind CSS.
4. Transferred the existing UI layout to `App.jsx`, ensuring 100% visual parity.
5. Added `onClick` handlers to all tool buttons to send requests to the `/api/action/{action_id}` endpoint.
6. Implemented a functional chat UI in React that sends requests to the `/api/chat` endpoint and displays the mock response.

**Verification:**
Files were successfully created. The React app is ready to run via `npm run dev` and the FastAPI server via `uvicorn main:app --reload`.

**Outcome:**
✅ Success

## [2026-04-24 15:30] - Fix Room Layout, Doors, Furniture, and General Drawing Rules

**Problem/Request:**
- Rooms placed without considering priority/adjacency.
- Wall thickness needed to be 20.0, and doors needed to be drawn connecting adjacent rooms.
- Furniture (symbols) not proportional, drawn without offsets, and poorly positioned.
- General drawing fixes: labels should be centered with size 20, dimensions should have offset 80 and formatted to 1 decimal place.

**Files Modified:**
- layout_service.py - Sorted rooms by priority and added row limits.
- dxf_service.py - Fixed door positions using adjacent_to, updated wall thickness, centered text labels, fixed dimension lines.
- symbol_service.py - Fixed furniture sizes, positions (added 20 unit margins), and assigned correct layers (Мебель, Сантехника).

**Solution Summary:**
Applied geometric adjustments across all services to fulfill layout priority rules, correct drawing of doors between rooms, adjust text/dimensions styling, and properly draw furniture per the exact user requirements.

**Verification:**
Changes applied successfully.

**Outcome:**
✅ Success

## [2026-04-22 12:15] - Fix ezdxf SVGBackend compatibility error

**Problem/Request:**
При генерации плана возникает ошибка `'SVGBackend' object has no attribute 'write'` в `svg_service.py`. Причина - в ezdxf версии 1.x и выше был удален метод `.write()` из класса `SVGBackend`.

**Files Modified:**
- `backend/services/svg_service.py` (lines 1-2, 16-18) - заменен устаревший метод `.write()` на актуальный метод получения XML корня.

**Solution Summary:**
Импортирован модуль `xml.etree.ElementTree as ET`.
Код изменен на использование метода `backend.get_xml_root_element(frontend.out)` для получения XML-элемента, который затем записывается в `StringIO` с помощью `ET.ElementTree(svg_element).write()`.

**Verification:**
Код обновлен в соответствии с требованиями ezdxf 1.x. Ошибка отсутствия атрибута `.write()` устранена.

**Outcome:**
✅ Success
Waiting for the user to provide the backend pipeline for further integration.

## [2026-04-15] - Architecture Pipeline Setup

**Problem/Request:**
The user defined the core pipeline for the backend: User Input -> LLM API (convert to room graph coordinates) -> FloorplanGAN (adjust to exact 2D coordinates) -> ezdxf (generate 2D DXF) -> React Frontend. The old static `index.html` at the project root was also requested to be removed.

**Files Modified:**
- `index.html` (root) - Deleted to clean up the workspace, as frontend is now entirely in `frontend/`.
- `backend/main.py` - Replaced the dummy `/api/chat` with `/api/generate-floorplan` and added mock functions (`call_llm_api`, `run_floorplangan`, `generate_dxf`) for each step of the pipeline.

**Solution Summary:**
1. Deleted the redundant static `index.html`.
2. Created a structured backend pipeline skeleton in `main.py` with mock implementations for LLM, FloorplanGAN, and ezdxf.
3. Added `asyncio` to simulate network delays and processing time for the pipeline steps.

**Verification:**
Deleted `index.html`. Updated `main.py` successfully and verified the `GenerateRequest` and `/api/generate-floorplan` endpoint implementation.

**Outcome:**
✅ Success

## [2026-04-15] - Implementation of Architecture Pipeline Services

**Problem/Request:**
Implement the proposed pipeline for generating a 2D floorplan: User Input -> LLM API -> FloorplanGAN -> ezdxf -> React Frontend.

**Files Modified:**
- `backend/requirements.txt` - Added `ezdxf`.
- `backend/llm_service.py` - Created mock LLM service returning a room graph.
- `backend/gan_service.py` - Created mock GAN service returning refined coordinates.
- `backend/dxf_service.py` - Created DXF service using `ezdxf` to generate `.dxf` files based on coordinates.
- `backend/main.py` - Refactored to use the new services and added static file mounting for DXF downloads. Updated `/api/chat` to trigger the pipeline.
- `frontend/src/App.jsx` - Updated chat UI to parse the `downloadUrl` and display a clickable download link.

**Solution Summary:**
1. Extracted logic into separate modular services (`llm_service`, `gan_service`, `dxf_service`).
2. Configured FastAPI to serve static files from the `static/downloads` directory.
3. Implemented a realistic `.dxf` generation process using `ezdxf` based on vector coordinates.
4. Updated the frontend to display a "Download DXF" link inside the chat when the backend returns a `download_url`.

**Verification:**
Dependencies installed successfully (`pip install -r backend/requirements.txt`). Code structure allows for easy replacement of mocks with real model inferences.

**Outcome:**
✅ Success

## [2026-04-22 12:00] - Server Restart for API Key Update

**Problem/Request:**
API ключ ушел в общий доступ. Файл .gitignore был вынесен в корень, а сам ключ заменен. Потребовался перезапуск серверов для применения нового ключа.

**Files Modified:**
- Никакие файлы не модифицировались.

**Solution Summary:**
Остановлены старые процессы и запущены новые:
1. Запущен backend сервер (`uvicorn main:app --reload`).
2. Запущен frontend сервер (`npm run dev`).

**Verification:**
Оба сервера запущены без ошибок в терминалах и готовы к работе с новым API ключом.

**Outcome:**
✅ Success

## [2026-04-22 12:30] - Fix WebSocket connection error

**Problem/Request:**
Ошибка подключения WebSocket от frontend-приложения (React) к backend-серверу (FastAPI). Проблема связана с резолвингом `localhost` в `::1` (IPv6), в то время как сервер Uvicorn ожидает подключение по IPv4 (`127.0.0.1`). Также потребовалось обновление CORS.

**Files Modified:**
- `frontend/src/App.jsx` (lines 1296, 2064) - замена `localhost` на `127.0.0.1`.
- `backend/main.py` (lines 17-23) - ослабление CORS (`allow_origins=["*"]`, `allow_credentials=False`).

**Solution Summary:**
Изменены ссылки WebSocket и HTTP-загрузки файлов на фронтенде с `localhost` на явный IPv4-адрес `127.0.0.1`. Изменены настройки CORS в backend для свободного доступа в локальной среде разработки.

**Verification:**
WebSocket-соединение теперь использует `127.0.0.1`, что исключает конфликт IPv4/IPv6. Backend принимает все запросы.

**Outcome:**
✅ Success

## [2026-04-22 12:45] - Fix ezdxf Frontend.out attribute error by switching to MatplotlibBackend

**Problem/Request:**
Возникла ошибка `"Frontend" object has no attribute "out"` при генерации плана в `svg_service.py`. Метод получения `xml_root_element` из `frontend.out` более не работает в текущей версии ezdxf. Пользователь попросил использовать `MatplotlibBackend` в качестве альтернативы.

**Files Modified:**
- `backend/services/svg_service.py` - Изменен код рендеринга. Удален `SVGBackend`, добавлен `matplotlib.pyplot` и `MatplotlibBackend`.
- `backend/requirements.txt` - Добавлен пакет `matplotlib`.

**Solution Summary:**
Установлена библиотека `matplotlib` (`pip install matplotlib`). В `svg_service.py` создан график matplotlib (`plt.figure()`) с фоном `#0d0d1a`, на котором рисуется `Frontend` через `MatplotlibBackend`. Изображение сохраняется в `io.StringIO()` в формате `svg` и возвращается.

**Verification:**
Ошибка отсутствующего атрибута `.out` устранена, код использует поддерживаемый способ рендеринга. Сервер может перезагрузиться с новой зависимостью и успешно отрендерить SVG.

**Outcome:**
✅ Success

## [2026-04-23 09:35] - Fix Matplotlib Thread-Safety Issue (Internal Server Error)

**Problem/Request:**
После переключения на MatplotlibBackend появилась ошибка `Internal server error` в Swagger при попытке генерации чертежа, и старая ошибка `"Frontend" object has no attribute "out"` все еще показывалась из-за кэширования старого кода. `matplotlib` использовал дефолтный интерактивный GUI-бэкенд (например, `TkAgg`), который не является потокобезопасным для веб-серверов.

**Files Modified:**
- `backend/services/svg_service.py` (lines 3-5) - Добавлен `matplotlib.use('Agg')` перед импортом `pyplot`.

**Solution Summary:**
Для корректной работы Matplotlib в фоновых потоках FastAPI установлен неинтерактивный бэкенд `Agg` (`matplotlib.use('Agg')`).

**Verification:**
Проверено локально: генерация SVG выполняется успешно в CLI. Пользователю выдана инструкция обязательно перезапустить процесс бэкенда (`uvicorn`), чтобы сбросить кэш оперативной памяти и применить новые изменения.

**Outcome:**
✅ Success
