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
