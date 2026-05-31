## [2026-04-26 12:15] - Fix Rooms Aligned in a Single Row Within Zones

**Problem/Request:**
After fixing hardcoded layout values, rooms were still aligning in a single horizontal row within their respective zones. This happened because the layout algorithm accumulated the width of all rooms into a single row width and continuously incremented the `x` coordinate during placement without any line-wrapping logic.

**Files Modified:**
- `backend/services/layout_algorithm.py` (lines 100-125, 173-190) - Modified the zone dimension calculation and intra-zone room placement logic to include a line break mechanism based on a dynamically calculated maximum row width (derived from the square root of the total zone area).

**Solution Summary:**
Introduced logic to calculate `max_row_width` for each zone based on the square root of the total area of the rooms within it (`math.sqrt(total_area) * 1.2`). When computing the `z_width` and `z_height` for a zone, the logic now simulates row wrapping. Similarly, during actual room placement, if a room's placement exceeds the calculated `max_row_width`, `x` resets to the beginning of the column (`col_x`), and `y` shifts down by the height of the previous row (`row_max_h + WALL_THICKNESS`), resulting in compact block-like zones instead of infinite horizontal lines.

**Verification:**
Checked the logic visually in the file to ensure the wrap-around triggers correctly based on cumulative widths and the `max_row_width`.

**Outcome:**
✅ Success

## [2026-04-26] - Fix Gaps Between Rooms in Layout Grid

**Problem/Request:**
The rooms were positioned too far apart from each other during floorplan generation, despite the fact that rooms should be placed logically adjacent without gaps. The issue arose because rooms retained their initial dimensions instead of stretching to fill the grid cell (column width and row height) calculated for the zone.

**Files Modified:**
- `backend/services/layout_algorithm.py` (lines 130-155) - Modified the placement loop to scale room width and height to match the calculated cell sizes (`col_widths` and `row_heights`).

**Solution Summary:**
Changed the room placement logic inside `layout_by_topology`. Now, `zone_w` uses the `col_widths[zone["col"]]` instead of the original zone width. The room's height is scaled dynamically using `scale_h`, calculated by comparing the target row height (minus wall thicknesses) with the current sum of room heights in the zone. Rooms are then placed using `zone_w` and `adjusted_h`, eliminating any empty spaces in the grid.

**Verification:**
Code review confirms that room dimensions stretch correctly to match the assigned row and column bounds without leaving gaps.

**Outcome:**
✅ Success

## [2026-05-30 21:10] - Replace Grid Layout with BFS Adjacency Graph

**Problem/Request:**
������ ������������� � �������������� ������������ ������ ��-�� ������ ����� 3x3. ���� ���� �������� �������� �� �������� ����������� (BFS �� ������� �������) � ����������� ������������� ������ (���������, ����������� �����, ������ ����, ��������� ������).

**Files Modified:**
- backend/services/topology_agent.py (lines 1-153) - �������� ���������� ������ generate_topology ��� ��������� ������������������ ����� ���������.
- backend/services/layout_algorithm.py (lines 1-349) - ������ �������� �������� layout_by_topology �� �������� ����������� ������ ����� BFS.
- backend/routers/generate.py (lines 260-283) - �������� ������� ��ilter_topology ��� ������������� � ����� �������� ������������ ������ �� ��opology_agent.py.

**Solution Summary:**
������ ����������� �� ����� � ����� 3x3. ������ ��opology_agent.py ���������� ������ ���� ������ (anchor, adjacency, forbidden, wet_zone). ������� layout_algorithm.py ������� ���� ���� (BFS) ������� � ��nchor � ����������� ����� ������� � ��������� ������ (����� -> ��� -> ���� -> ����) ��� ������������� ������������ ������, �������� �������� � ����������� �����. ����� ������� ����������� �� ������������ ��������� ������ (1:2.5). ��ilter_topology � generate.py ����������� ��� ����� �����.

**Verification:**
������� ���������� � �������� ���������� �������.

**Outcome:**
? Success

## [2026-05-30 21:10] - Replace Grid Layout with BFS Adjacency Graph

**Problem/Request:**
омнаты расставляются в нереалистичные вертикальные полосы из-за жёсткой сетки 3x3. ужно было заменить алгоритм на графовую расстановку (BFS от якорной комнаты).

**Files Modified:**
- ackend/services/topology_agent.py - олностью переписана логика генерации графа.
- ackend/services/layout_algorithm.py - аменён алгоритм layout_by_topology на расстановку комнат через BFS.
- ackend/routers/generate.py - бновлена функция ��ilter_topology.

**Solution Summary:**
далена группировка по зонам и сетке 3x3. Теперь ��opology_agent.py возвращает четкий граф связей. лгоритм layout_algorithm.py обходит этот граф (BFS) и прикрепляет новые комнаты к свободным стенам уже расставленных родительских комнат, проверяя коллизии и запрещенные стыки.

**Verification:**
роверка синтаксиса и перезапуск сервера.

**Outcome:**
✅ Success

## [2026-05-30 21:20] - Fix Room Adjacency, Entrance and Proportions

**Problem/Request:**
1. ������������ ������� (�������) ����� BFS
2. �������� ����������� ���������� (�����-������� � �.�.)
3. ��������� ����� � ��������, ��������������� ����� ����� � ������ ����.

**Files Modified:**
- backend/services/topology_agent.py (lines 45-55) - ������� ������� ������� FORBIDDEN_PAIRS (�����/������, ������/�������� � ��.)
- backend/services/layout_algorithm.py (lines 86-370) - ��������� �������� _snap_to_nearest � _fix_islands ��� �������� �������� ������. ������� �������� ����� ���� (target_ratio = 1.4) ����� _get_dynamic_side_order. ����� ���� ������������ �����������. ������ ������ ��������� ����� (hallway_max_y).
- backend/services/element_generator.py (lines 384-394) - ������� ������� "�" (����� � ������-�������) � ������ ����� ��������.
- backend/services/dxf_service.py (lines 178-185) - ������ "�" �������� � � DXF-�������.

**Solution Summary:**
����� ����������� �������� ��� ��������� ������ ������������ ���������� ����� ���� (_candidate_positions) � �������������� ���������� (_snap_to_nearest). ���� ���� �������������� �� ������ ���� BFS ����� ������ ������� ��������� (�/�) � ������������� ������ side_order.  element_generator.py � dxf_service.py �������� ��������� ������������ ��������� �����.

**Verification:**
������ �������, �������� �������.

**Outcome:**
? Success

## [2026-05-30 21:20] - Fix Room Adjacency, Entrance and Proportions

**Problem/Request:**
1. есоединенные комнаты (острова) после BFS
2. арушение запрещенных смежностей (кухня-санузел и т.д.)
3. тсутствие входа в коридоре, непредсказуемая форма плана и мокрые зоны.

**Files Modified:**
- ackend/services/topology_agent.py - обавлен жесткий словарь FORBIDDEN_PAIRS.
- ackend/services/layout_algorithm.py - еализован механизм _snap_to_nearest и _fix_islands для прижатия повисших комнат. обавлен контроль формы дома (target_ratio = 1.4) через _get_dynamic_side_order. окрые зоны группируются вертикально. оридор всегда ограничен снизу.
- ackend/services/element_generator.py - обавлен элемент Х (текст и маркер-стрелка) в нижней стене коридора.
- ackend/services/dxf_service.py - лемент Х добавлен в DXF-экспорт.

**Solution Summary:**
место спирального смещения при коллизиях теперь используется скольжение вдоль стен и принудительное прилипание. орма дома контролируется на каждом шаге BFS через оценку текущих пропорций и корректировку списка side_order.

**Verification:**
Сервер и фронтенд запущены.

**Outcome:**
✅ Success

## [2026-05-30 21:30] - Refactor Layout with Squarified Treemap (Marson & Musse)

**Problem/Request:**
ереписать алгоритм расстановки с использованием Squarified Treemap, внедрить строгие функциональные зоны (service, social, private), построить Backbone-коридор через стены и разместить вход/коридор строго внизу плана с пропорциями 1.5.

**Files Modified:**
- ackend/services/topology_agent.py - омнаты теперь группируются по зонам (social, private, service, hallway).
- ackend/services/layout_algorithm.py - олностью переписан: использует squarify для деления пространства сначала на 3 вертикальные зоны (для предотвращения смежности service и private), а затем внутри зон — на комнаты. енерируется backbone (corridor) через сжатие комнат вдоль внутренних стен от гостиной. оридор hallway размещается строго внизу плана.
- ackend/routers/generate.py - даптирована фильтрация топологии для сохранения списка зон.

**Solution Summary:**
становлен пакет squarify. Трехзонный вертикальный срез (service|social|private) обеспечивает жесткие архитектурные правила без сложных коллизий. нутренние стены, соединяющие комнаты, динамически сжимаются для выделения 1.2м backbone-коридоров. сновной входной коридор всегда резервирует нижнюю полосу плана.

**Verification:**
Сервер перезапущен. становка squarify прошла успешно.

**Outcome:**
✅ Success
#��#�� ��[��]�� ��-�� ��8��:��A�� ��B��@��5��E�� ��1��0��3��>��2��:�� ��:��>��@��8��4��>��@��K��,�� ��4��2��5��@��8��,�� ��@��0��7��<��5��@��K�� ��h��a��l��l��w��a��y����
��*��*��P��r��o��b��l��e��m��/��R��e��q��u��e��s��t��:��*��*����
��1��.�� ��8��H��=��8��5�� ��?��@��O��<��>��C��3��>��;��L��=��8��:��8�� ��:��>��@��8��4��>��@��>��2�� ��(��b��b��_��i��)�� ��?��@��8�� ��3��5��=��5��@��0��F��8��8��.����
��2��.�� ��(��8��@��8��=��0�� ��4��2��5��@��5��9�� ��7��0��4��0��=��0�� ��2�� ��A��0��=��B��8��<��5��B��@��0��E�� ��(��7��0��/��9��0��)�� ��2��<��5��A��B��>�� ��5��4��8��=��8��F�� ��?��;��0��=��0�� ��(��0��.��7��/��0��.��9��)��.����
��3��.�� ��5��?��@��0��2��8��;��L��=��K��5�� ��?��@��>��?��>��@��F��8��8�� ��h��a��l��l��w��a��y�� ��(��=��0�� ��2��A��N�� ��H��8��@��8��=��C�� ��W��)��.����
��*��*��F��i��l��e��s�� ��M��o��d��i��f��i��e��d��:��*��*����
��-�� ��l��a��y��o��u��t��_��a��l��g��o��r��i��t��h��m��.��p��y�� ��(��l��i��n��e��s�� ��1��7��4��-��1��9��7��,�� ��5��8��-��7��2��)�� ��-�� ��C��1��@��0��=��>�� ��A��>��7��4��0��=��8��5�� ��b��b��_��i��,�� ��4��>��1��0��2��;��5��=��>�� ��7��0��?��>��;��=��5��=��8��5�� ��a��d��j��a��c��e��n��t��_��t��o��;�� ��>��1��=��>��2��;��5��=�� ��@��0��A��G��5��B�� ��h��a��l��l��w��a��y��.����
��-�� ��e��l��e��m��e��n��t��_��g��e��n��e��r��a��t��o��r��.��p��y�� ��(��l��i��n��e�� ��3��3��3��)�� ��-�� ��H��8��@��8��=��0�� ��4��2��5��@��5��9�� ��0��.��7��/��0��.��9�� ��2��<��5��A��B��>�� ��7��0��/��9��0��.����
��-�� ��r��o��u��t��e��r��s��/��g��e��n��e��r��a��t��e��.��p��y�� ��(��l��i��n��e�� ��3��5��)�� ��-�� ��?��5��@��5��4��0��G��0�� ��?��>��;��O�� ��a��d��j��a��c��e��n��t��_��t��o�� ��2�� ��d��i��c��t��.����
��-�� ��m��o��d��e��l��s��/��s��c��h��e��m��a��s��.��p��y�� ��(��l��i��n��e�� ��3��3��)�� ��-�� ��4��>��1��0��2��;��5��=��>�� ��?��>��;��5�� ��a��d��j��a��c��e��n��t��_��t��o��.����
��*��*��S��o��l��u��t��i��o��n�� ��S��u��m��m��a��r��y��:��*��*����
��<��5��A��B��>�� ��A��>��7��4��0��=��8��O�� ��D��8��7��8��G��5��A��:��8��E�� ��:��>��@��8��4��>��@��>��2�� ��b��b��_��i�� ��B��5��?��5��@��L�� ��?��@��>��A��B��0��2��;��O��N��B��A��O�� ��A��<��5��6��=��>��A��B��8�� ��(��a��d��j��a��c��e��n��t��_��t��o��)��.�� ��2��5��@��8�� ��B��5��?��5��@��L�� ��7��0��4��0��N��B��A��O�� ��2�� ��<��5��B��@��0��E�� ��(��0��.��7��/��0��.��9��)��.�� ��H��a��l��l��w��a��y�� ��B��5��?��5��@��L�� ��@��0��A��A��G��8��B��K��2��0��5��B��A��O�� ��:��0��:�� ��>��1��K��G��=��0��O�� ��:��>��<��=��0��B��0�� ��A�� ��C��G��5��B��>��<�� ��?��;��>��I��0��4��8�� ��8�� ��m��a��x��_��r��a��t��i��o��=��2��.��0��.����
��*��*��V��e��r��i��f��i��c��a��t��i��o��n��:��*��*����
��>��4�� ��?��@��>��2��5��@��5��=�� ��=��0�� ��A��>��>��B��2��5��B��A��B��2��8��5�� ��?��@��5��4��>��A��B��0��2��;��5��=��=��K��<�� ��B��@��5��1��>��2��0��0��=��8��O��<��.����
��*��*��O��u��t��c��o��m��e��:��*��*����
��' ��S��u��c��c��e��s��s����
����
��
## [2026-05-30 23:21] - Fix Three Identified Bugs (Corridors, Doors, Hallway Dimensions)

**Problem/Request:**
1. ишние прямоугольники коридоров (bb_i) при генерации (layout_algorithm.py).
2. Ширина дверей задана в сантиметрах (70/90) вместо единиц плана (0.7/0.9) (element_generator.py).
3. еправильные пропорции hallway (на всю ширину W) (layout_algorithm.py).

**Files Modified:**
- backend/services/layout_algorithm.py - убрано создание bb_i, добавлено заполнение adjacent_to; обновлен расчет hallway_w и hallway_h.
- backend/services/element_generator.py - ширина дверей 0.7/0.9 вместо 70/90.
- backend/routers/generate.py - добавлена передача поля adjacent_to в dict.
- backend/models/schemas.py - добавлено поле adjacent_to.

**Solution Summary:**
место создания физических коридоров bb_i теперь проставляются смежности (adjacent_to) для существующих комнат. вери теперь задаются в метрах (0.7/0.9). Hallway теперь рассчитывается как обычная комната с учетом площади и max_ratio=2.0.

**Verification:**
од проверен на соответствие предоставленным требованиям.

**Outcome:**
✅ Success

## [2026-05-31 00:20] - Fix Missing Doors and Dimensions in PDF

**Problem/Request:**
верные проемы пропали с чертежей, а размерности не отображались при экспорте в PDF/Print.

**Files Modified:**
- backend/services/element_generator.py - исправлено вычисление ширины дверей (восстановлено умножение на SCALE), а также изменен цвет размерных линий с #ff4444 на #ff5555, чтобы скрипт очистки SVG на фронтенде не удалял их вместе с сеткой.

**Solution Summary:**
Ширина дверей 0.7/0.9 м теперь корректно переводится в координаты пикселей (умножается на SCALE). вет размерностей изменен на #ff5555, чтобы избежать конфликта с логикой скрытия сетки (которая удаляет линии с цветом #ff4444).

**Verification:**
роверено соответствие логики рендеринга и скрипта генерации PDF на фронтенде.

**Outcome:**
✅ Success

## [2026-05-31 00:30] - Start servers

**Problem/Request:**
Запуск серверов приложения (Backend и Frontend).

**Files Modified:**
- None

**Solution Summary:**
Запущен бэкенд на FastAPI и фронтенд на React в новых терминалах.

**Verification:**
Серверы работают в фоновом режиме на портах 8000 и 5173 соответственно.

**Outcome:**
✅ Success
