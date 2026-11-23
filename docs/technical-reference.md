# Technical Reference

This document specifies how **Helpmeet: Area Card** discovers Home Assistant entities, formats dots and subtitles, renders popups, and persists per-user settings. Contributors should read this before changing `src/sections.ts`, `src/rollups.ts`, or `src/popup-cards.ts`.

## Element Registration

- `custom:area-card` — Area Card
- `custom:floor-card` — Floor Card
- `custom:floors-card` — Floors Card

All three cards ship in one bundle (`area-card.js`), alongside prefixed vendor bundles `area-card-bubble.js` (`area-card-bubble`) and `area-card-mushroom.js` (`area-card-mushroom-*`).

## Area Card

### Area Metadata & Pictures

- Reads the area name, icon, and picture from Home Assistant's area registry, and opens a `#area-<area_id>` popup filled from entities assigned to that area.
- The popup photo uses the selected background (`Area picture`, `Media artwork`, or `Camera` still) when a picture is active, fits the dialog width, and sits at the top.
- By default, the collapsed button and popup use a live light-color averaging background (`Light tint`). When configured to use `Area picture`, `Media artwork`, or a `Camera` background, that background applies to the collapsed button (or to the cluster behind pinned rows when pinned rows are showing, leaving pinned fills clear) as well as the popup dialog.

### Presence Pill

- Collapsed Area Cards display a presence pill next to the room name derived from `sections.occupancy` (replacing the `occupancy` dot):
  - Shows **`Occupied`** when any occupancy sensor in the area is active.
  - Otherwise shows a **relative last-seen** timestamp (e.g., `5m ago`, `2h ago`) based on the most recent occupancy state change, or **`Clear`** when sensors exist without a recorded timestamp.
  - Omitted when the area has no occupancy sensors or when `occupancy` is listed in `hide_sections`.
  - Hovering or focusing the presence pill shows the `Occupancy` section tooltip (heading and every occupancy row from the popup).

### Unavailable Areas

- When an area has device entities and every one of them is unavailable, the collapsed button uses the same half-opacity treatment as a Bubble button whose entity is unavailable, and stays on screen.
- Input booleans, input selects, input buttons, timers, and template helpers that are not device entities are ignored when checking availability.
- An area with no device entities, or with at least one available device entity, stays at full opacity.
- An automation that cannot trigger because every trigger depends on an unavailable device does not count as an available entity.

## Sections & Dot Slots

Valid section IDs:

`climate`, `lights`, `media`, `cameras`, `switches`, `occupancy`, `openings`, `satellites`, `sensors`, `locks`, `vacuums`, `buttons`, `scenes`, `scripts`, `helpers`, `automations`

### `hide_sections`

- Sections listed in `hide_sections` are removed from both the collapsed card and the popup.
- A hidden section is fully removed — not left as an invisible spacer — so the dot row is only as wide as the visible sections.
- `climate`, `buttons`, `scenes`, `scripts`, `helpers`, and `automations` are valid `hide_sections` IDs:
  - Hiding `climate` removes its text from the subtitle and the popup section.
  - Hiding `buttons`, `scenes`, or `scripts` removes that popup section.
  - Hiding `helpers` removes that count from the subtitle and the popup section.
  - Hiding `automations` removes that piece from the subtitle and the popup section.
  - None of those six change the dot-row width.
- Hiding `sensors`, `locks`, or `vacuums` removes both that dot and the popup section.

### Collapsed Dot Row

The collapsed button keeps one 22px dot slot for every section except `climate`, `occupancy`, `buttons`, `scenes`, `scripts`, `helpers`, and `automations`, in fixed order so stacked rooms line up:

1. `lights`
2. `media`
3. `cameras`
4. `switches`
5. `openings`
6. `satellites`
7. `sensors`
8. `locks`
9. `vacuums`

Each dot shows that section's icon:

- **Filled**: when the section is active.
- **Hollow ring**: when the section is present in the area (or floor) but nothing is active.
- **Invisible**: when the section is absent (unless hidden via `hide_sections` or floor-wide hiding, in which case the slot is omitted).

Active criteria per dotted section:

- **Cameras** (`cameras`): filled when a camera is `recording` or `streaming`; hollow ring when present but idle; invisible when the area has no camera.
- **Other Sensors** (`sensors`): filled when any binary sensor in that section is `on`; hollow ring when present and no binary sensor is `on`; invisible when absent.
- **Locks** (`locks`): filled when any lock is not `locked`, `unavailable`, or `unknown`.
- **Vacuums** (`vacuums`): filled when a vacuum is `cleaning`, `returning`, or `on`.

### Dot Tooltips

- Hovering or focusing a collapsed area-card dot shows a tooltip with that section's heading and every row from the popup, in the same order.
- The tooltip opens centered below the dot, and moves above or inward from either side when it would leave the screen.

## Subtitles

The collapsed button shows a single subtitle line under the room name when any of the following are present (otherwise no subtitle is shown):

1. **Climate**: repeats only the temperature and humidity sensor titles and states, separated by ` · `. Thermostats, humidifiers, water heaters, and other environment readings stay off this line.
2. **Helpers**: on/off helpers read `X/Y` followed by the helpers cog icon. (Helper selects and timers stay out of this count.)
3. **Automations**: reads `X/Y` followed by the automations flash icon.
   - A disabled automation count is appended with `+` and the disabled count struck through: e.g. 1 on, 1 off, 3 disabled reads `1/2+` with `3` struck, then the automations icon; 1 disabled and none on/off reads `0/0+` with `1` struck, then the automations icon. A zero disabled count omits `+0`.

Separators:

- Climate text and the counts piece are separated by ` · `.
- When both helpers and automations counts are present, they follow the climate text as one piece separated by a comma: `1/3` (helpers icon), then `2/3` (automations icon).

## Popup Structure & Section Rules

The button and the popup are the same card. Tapping the button or a visible dot opens `#area-<area_id>`. Empty sections stay out of the popup, except empty creatable sections (`scenes`, `scripts`, `helpers`, `automations`), which collapse into a bottom **Add** chip row (see Section Create Actions).

### Status Section

- Heading uses a list icon.
- Lists rollups for active/total counts, such as `Lights 1/4 On`, `Cameras 1/2 On`, `Other Sensors 1/2 On`, `Locks 1/2 Unlocked`, `Vacuums 1/2 Cleaning`.
- Automations status chip reads `Automations 2/3 on, 0 disabled`, or `Automations 1 disabled` when none are on or off. Disabled automations are not part of the fraction.

### Section Headings & Entity Rules

Each popup section heading uses its section icon to the left of the title.

- **Climate**: lists temperature and humidity sensors, thermostats, humidifiers, water heaters, and extra environment readings (illuminance, carbon dioxide, carbon monoxide, particulate matter, air quality, volatile organic compounds, moisture, and standalone pressure). Sensor rows and water heaters are entity cards; thermostats use the climate card; humidifiers use the humidifier card with target humidity control. Thermostats and humidifiers toggle from the icon while the rest of the row opens more-info.
- **Lights**: all lights (both on/off and dimmable/color/light-group rows) toggle from the icon while the rest of the row opens more-info; dimmable lights keep the Mushroom light card controls. A `switch.*_led` on the same device renders as a dot on the right of that light and toggles only the LED. Adaptive Lighting switches (`platform: adaptive_lighting`, or `switch.adaptive_lighting_*`) are swept out of **Switches** and grouped by Adaptive Lighting device into one full-width Adaptive Lighting card per instance at the bottom of **Lights**. Each card shows a Kelvin gradient bar (current `color_temp_kelvin` tick), live Kelvin/brightness readout, a main on/off control, Color / Brightness / Sleep companion toggles with tooltips, and an expandable settings panel (`adaptive_lighting.change_switch_settings`) for min/max brightness, min/max color temp, sleep brightness/color temp, and reset to configuration defaults.
- **Switches & Covers**: switches and `cover.*` openings toggle from the icon while the rest of the row opens more-info.
- **Media & Satellites**:
  - Entities belonging to a kiosk satellite stay on the one **Satellites** card.
  - When the installed Kiosk Satellite Card is loaded, a satellite with a device renders as `custom:kiosk-satellite-card` with `device` set to the satellite device (the old `kiosk-redisplay` name and locally served builds are left unused).
  - `assist_satellite.<name>_assist_satellite` pairs with `media_player.<name>` (even if the player has no area). That player appears under **Media players** when Kiosk Satellite Card is not loaded or the satellite has no device. When Kiosk Satellite Card is loaded and showing Now Playing, the paired player is omitted from **Media players** (Now Playing remains shown while idle, off, unknown, or unavailable).
- **Cameras**: each camera renders as a `picture-entity` card with `camera_view: auto`, showing its picture rather than only its name; tapping opens more-info.
- **Other Sensors, Locks, Vacuums**: follow Satellites in that order. An Other Sensors row is an entity card (non-climate `sensor.*` and non-opening/occupancy `binary_sensor.*` entities), grouped by device under a device subheading when assigned to a named device. Lock and vacuum rows are full width.
- **Buttons, Scenes, Scripts**: follow Vacuums, before Helpers. Tapping a button or input button presses it (holding opens more-info). Tapping a scene or script turns it on.
- **Helpers & Automations**:
  - `input_boolean` helpers toggle from the icon while the rest of the row opens more-info.
  - Template entities normally stay under **Helpers**, except a template `binary_sensor` whose **Show as** / `device_class` is occupancy (or motion/presence) goes under **Occupancy**, and opening/door/window/garage/etc. goes under **Entries**.
  - Automations assigned to the area, and automations whose name contains the room name, are listed under **Automations**.
  - An automation is **Disabled** when every trigger depends on an unavailable device (time, sun, or other triggers that can still fire keep it enabled). Disabled automations stay in the list, show `Disabled`, and do not count as on.
- **Edit pencils** (admin users, non-demo, normal view only — hidden while the popup is in UI edit mode):
  - Manually created entities show a right-floated pencil that appears on row hover (always visible on touch devices without hover).
  - Automations with a UI editor id, scripts, and scenes with a UI editor id open their full HA editor page (`/config/automation/edit/<id>`, `/config/script/edit/<id>`, `/config/scene/edit/<id>`).
  - UI helpers and other manually created virtual entities without a `device_id` (groups, templates, thresholds, `input_*`, timers, etc.) open the entity **Settings** dialog via `hass-more-info` with `view: "settings"` (there is no dedicated Settings URL).
  - Device-backed entities and YAML-only automations/scenes without an id omit the pencil.

### Section Create Actions

For admin users in non-demo mode (and while the popup is not in edit mode), creatable sections expose Home Assistant create flows:

- **Creatable sections**: `scenes`, `scripts`, `helpers`, and `automations`.
- **Non-empty creatable sections**: a right-floated circled plus (`mdi:plus-circle-outline`) on the section heading opens that section's create page or dialog.
- **Empty creatable sections**: instead of empty headings, those sections collapse into one wrapping bottom row of **Add** chips (`Scene`, `Script`, `Helper`, `Automation`), so several empty sections still share a single row.
- Sections listed in the card's `hide_sections` are omitted from both heading buttons and bottom chips. Floor-wide hiding does not include creatable sections, so empty Scene / Script / Helper / Automation Add chips still appear on every area of the floor.
- Navigation targets:
  - Scenes → `/config/scene/edit/new`
  - Scripts → `/config/script/edit/new`
  - Helpers → `/config/helpers?historyBack=1&area=<area_id>` (opens the helper create dialog)
  - Automations → `/config/automation/edit/new`
- After navigation, the card best-effort prepopulates the Area on the editor/dialog when Home Assistant's current frontend internals allow it; if those internals change, the action still lands on the standard create flow.

### Helper Group Suggestions

- For admin users in non-demo mode, sections that map cleanly to a Home Assistant Group helper surface **`Create group`** and **`Ignore`** actions in the section title whenever at least two non-group entities of the same target domain are not yet members of a related area helper group:
  - **Lights** (`light` group), **Occupancy** (`binary_sensor` group with `device_class: occupancy`), **Switches** (`switch` group), **Entries** (`binary_sensor` group with common opening `device_class` or `cover` group), **Media players** (`media_player` group), and **Locks** (`lock` group).
- Clicking **`Create group`** opens an inline name / `Hide members` / **Save** / **Cancel** bar under the section heading and places a checkbox next to each compatible entity in that section, pre-checking the suggested ungrouped items.
- Saving creates the Home Assistant `group` helper via the config entry flow and assigns the resulting entity to the area (plus `device_class` for Occupancy / Entries binary sensor groups).
- Clicking **`Ignore`** persists a per-area, per-user fingerprint of the section's entities and related helper groups (`area-card-group-ignore:<area_id>`) so the suggestion stays hidden until the section's entities or related helper groups/memberships change.

### Row Width & Room-Name Stripping

- Entity titles in the popup (including camera titles) drop a leading room name.
- A row sits at half width when its title and longest state line both fit beside the icon, so two rows (such as two lights) can share a line. A light's LED dot counts against that fit. Edit pencils overlay on hover and do not change half-row width.
- Status chips, section headings, media players, Kiosk Satellite Cards, cameras, locks, and vacuums stay full width.
- The popup header and collapsed button keep the full room name.

## Popup Header, Battery, Pinning & Camera Backgrounds

- The popup header title has no fill.
- To the left of close (`×`), the header has:
  1. **Battery icon** (left of pencil): opens a menu of **Off**, **Green**, **Yellow**, and **Red**.
     - **Off** (default): shows no battery percentages.
     - **Green**: shows percentages on every row that has a battery (green `>= 70%`, yellow `30%–69%`, red `< 30%`).
     - **Yellow**: hides green percentages.
     - **Red**: hides green and yellow percentages (only red remains).
     - Battery source is the `battery` device-class sensor on that row's device, or the row's own `battery_level` attribute when absent.
     - Stored per area for the Home Assistant user across browsers.
  2. **Pencil icon** (left of gear): toggles edit mode, exposing:
     - **Card Background** selector (per-area setting, persisted per Home Assistant user across browsers):
       - **`Light tint`** *(default)*: live light-color averaging background on the collapsed card.
       - **`Area picture`**: uses the area's registry picture as the collapsed card background.
       - **`Media: <name>`** *(one option per media player in the area)*: uses that media player's current artwork (`entity_picture`) while `playing`, `buffering`, `on`, `paused`, or `idle`, falling back to the area picture when off or when no artwork is available.
       - **`Camera: <name>`**: replaces the collapsed card background with that camera's muted, autoplaying, cover-cropped live video (no play button). The still stays visible until a frame renders; the area picture stays if the camera has no stream or playback fails. The popup uses the camera still (falling back to the area picture).
- **Pin menu button** on each entity row with three options (**Hidden**, **Always**, **While on** — each showing its icon and title), plus a fourth **`Pin to <name> chip`** option on **Other Sensors** rows whose device has a single primary-section entity:
  - **Always**: keeps the row pinned under the collapsed area button.
  - **While on**: shows the row only while that entity is on or playing, and for 2 minutes after it stops (a reload clears the 2-minute grace).
  - **Pin to `<name>` chip**: moves that sensor's reading into the primary entity's subtitle (and removes it from **Other Sensors** when not editing).
  - Choices are stored per Home Assistant user and follow the user across browsers.
  3. **Gear icon** (left of close): opens the area's settings page (`/config/areas/area/<area_id>`).

## Floor Card & Floors Card

### Floor Card (`custom:floor-card`)

- Collapsible floor header with floor name, floor registry icon (omitted if none), **presence pill** (rolled up across the floor's occupancy sensors, with an `Occupancy X/Y On` tooltip), **median climate** (median temperature and humidity across the floor's areas), rule, row of dots, and collapse control.
- Clicking the header collapses or expands the card. Open/closed state is stored per Home Assistant user across browsers (defaults to expanded).
- When expanded, shows one Area Card per area assigned to the floor (including unavailable areas).
- **Floor options menu** (in the floor header, synced per Home Assistant user across browsers):
  - **Areas when collapsed**: `−` / `+` stepper (default `0`) to keep the top `N` areas (using the active sort order) visible beneath the collapsed header.
  - **Sort by presence**: toggle (default `On`) to order areas by current occupancy first, then most recent presence/last-seen, falling back to alphabetical order (`Off` sorts alphabetically).
- Header dots sit left of the collapse control and use the same slots as Area Cards (no `climate`, `occupancy`, `buttons`, `scenes`, `scripts`, `helpers`, or `automations` column). A dot is filled if any area on the floor has that section active, hollow if present anywhere on the floor, and invisible otherwise. Tooltips show aggregated counts (e.g., `Lights 3/12 On`).
- Area cards on the floor shift their dots left by the width of the collapse control so columns align. On narrow headers, the floor name stays whole and dots leave from the left so remaining columns still align.
- **Floor-wide section hiding**: sections absent on every area of the floor are hidden across all area cards on that floor so dot rows stay compact and aligned. Sections present on even one area stay visible on every area card of that floor. Creatable sections (`scenes`, `scripts`, `helpers`, `automations`) are not floor-hidden — they stay available for section create actions (heading `+` / bottom Add chips) even when every area on the floor currently has none.

### Floors Card (`custom:floors-card`)

- Renders one Floor Card for every floor in Home Assistant, in the floor registry's order, forwarding `sort_by_presence` (default `true`) and `collapsed_areas` (default `0`).
- A floor with no areas still shows its header.
- When Home Assistant has no floors, displays `"No floors"`.

## Demo Mode

Setting `demo: true` fills the card from a built-in Demo Room without reading Home Assistant areas, entities, or states (`area` can be omitted; `hide_sections` still applies):

- Named **Demo Room**, icon `mdi:home-assistant`, opens `#area-demo`, no area picture.
- Includes every section: temperature and humidity on the subtitle; thermostat, humidifier, water heater, and illuminance in Climate; one dimmable light on (with LED switch dot) and one on/off light off; one playing media player; one idle camera; one switch on and one off; occupancy on; door contact off (82% battery); assist satellite; smoke sensor on (41% battery); one unlocked lock (18% battery) and one locked lock (76% battery); one cleaning vacuum (55% battery); button, input button, scene, and script; helpers (input boolean on, input select, timer); two automations (one on, one off).
- Service calls and more-info actions on demo entities are no-ops; template rows take their visible title and state from the mock.
