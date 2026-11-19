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
- Uses the area picture as the background of both the collapsed button and the popup. The popup photo fits the dialog width and sits at the top.
- With pinned rows showing, the area picture is the cluster background and the pinned fills are clear; with none showing, it stays on the button. The popup photo is unchanged.

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

The collapsed button keeps one 22px dot slot for every section except `climate`, `buttons`, `scenes`, `scripts`, `helpers`, and `automations`, in fixed order so stacked rooms line up:

1. `lights`
2. `media`
3. `cameras`
4. `switches`
5. `occupancy`
6. `openings`
7. `satellites`
8. `sensors`
9. `locks`
10. `vacuums`

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

The button and the popup are the same card. Tapping the button or a visible dot opens `#area-<area_id>`. Empty sections stay out of the popup.

### Status Section

- Heading uses a list icon.
- Lists rollups for active/total counts, such as `Lights 1/4 On`, `Cameras 1/2 On`, `Other Sensors 1/2 On`, `Locks 1/2 Unlocked`, `Vacuums 1/2 Cleaning`.
- Automations status chip reads `Automations 2/3 on, 0 disabled`, or `Automations 1 disabled` when none are on or off. Disabled automations are not part of the fraction.

### Section Headings & Entity Rules

Each popup section heading uses its section icon to the left of the title.

- **Climate**: lists temperature and humidity sensors, thermostats, humidifiers, water heaters, and extra environment readings (illuminance, carbon dioxide, carbon monoxide, particulate matter, air quality, volatile organic compounds, moisture, and standalone pressure). Sensor rows and water heaters are entity cards; thermostats use the climate card; humidifiers use the humidifier card with target humidity control.
- **Lights**: on/off lights toggle from the icon while the rest of the row opens more-info; dimmable lights keep the Mushroom light card. A `switch.*_led` on the same device renders as a dot on the right of that light and toggles only the LED.
- **Media & Satellites**:
  - Entities belonging to a kiosk satellite stay on the one **Satellites** card.
  - When the installed Kiosk Satellite Card is loaded, a satellite with a device renders as `custom:kiosk-satellite-card` with `device` set to the satellite device (the old `kiosk-redisplay` name and locally served builds are left unused).
  - `assist_satellite.<name>_assist_satellite` pairs with `media_player.<name>` (even if the player has no area). That player appears under **Media players** when Kiosk Satellite Card is not loaded or the satellite has no device. When Kiosk Satellite Card is loaded and showing Now Playing, the paired player is omitted from **Media players** (Now Playing remains shown while idle, off, unknown, or unavailable).
- **Cameras**: each camera renders as a `picture-entity` card with `camera_view: auto`, showing its picture rather than only its name; tapping opens more-info.
- **Other Sensors, Locks, Vacuums**: follow Satellites in that order. An Other Sensors row is an entity card (non-climate `sensor.*` and non-opening/occupancy `binary_sensor.*` entities), grouped by device under a device subheading when assigned to a named device. Lock and vacuum rows are full width.
- **Buttons, Scenes, Scripts**: follow Vacuums, before Helpers. Tapping a button or input button presses it (holding opens more-info). Tapping a scene or script turns it on.
- **Helpers & Automations**:
  - Automations assigned to the area, and automations whose name contains the room name, are listed under **Automations**.
  - An automation is **Disabled** when every trigger depends on an unavailable device (time, sun, or other triggers that can still fire keep it enabled). Disabled automations stay in the list, show `Disabled`, and do not count as on.

### Row Width & Room-Name Stripping

- Entity titles in the popup (including camera titles) drop a leading room name.
- A row sits at half width when its title and longest state line both fit beside the icon, so two rows (such as two lights) can share a line. A light's LED dot counts against that fit.
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
  2. **Pencil icon** (left of gear): toggles edit mode, adding a pin menu button to each entity row:
     - **Hidden**, **Always**, **While on** (each menu row shows its icon and title).
     - **Always**: keeps the row pinned under the collapsed area button.
     - **While on**: shows the row only while that entity is on or playing, and for 2 minutes after it stops (a reload clears the 2-minute grace).
     - **Use as area background** (cameras only): replaces the collapsed card background with that camera's muted, autoplaying, cover-cropped live video (no play button) and does not pin the camera as a row. The still stays visible until a frame renders; the area picture stays if the camera has no stream or playback fails. The popup photo stays the area picture. If multiple cameras have this choice, the first in the area's camera order supplies the video.
     - Choices are stored per Home Assistant user and follow the user across browsers.
  3. **Gear icon** (left of close): opens the area's settings page (`/config/areas/area/<area_id>`).

## Floor Card & Floors Card

### Floor Card (`custom:floor-card`)

- Collapsible floor header with floor name, floor registry icon (omitted if none), rule, row of dots, and collapse control.
- Clicking the header collapses or expands the card. Open/closed state is stored per Home Assistant user across browsers (defaults to expanded).
- When expanded, shows one Area Card per area assigned to the floor, sorted alphabetically (including unavailable areas).
- Header dots sit left of the collapse control and use the same slots as Area Cards (no `climate`, `buttons`, `scenes`, `scripts`, `helpers`, or `automations` column). A dot is filled if any area on the floor has that section active, hollow if present anywhere on the floor, and invisible otherwise. Tooltips show aggregated counts (e.g., `Lights 3/12 On`).
- Area cards on the floor shift their dots left by the width of the collapse control so columns align. On narrow headers, the floor name stays whole and dots leave from the left so remaining columns still align.
- **Floor-wide section hiding**: sections absent on every area of the floor are hidden across all area cards on that floor so dot rows stay compact and aligned. Sections present on even one area stay visible on every area card of that floor.

### Floors Card (`custom:floors-card`)

- Renders one Floor Card for every floor in Home Assistant, in the floor registry's order.
- A floor with no areas still shows its header.
- When Home Assistant has no floors, displays `"No floors"`.

## Demo Mode

Setting `demo: true` fills the card from a built-in Demo Room without reading Home Assistant areas, entities, or states (`area` can be omitted; `hide_sections` still applies):

- Named **Demo Room**, icon `mdi:home-assistant`, opens `#area-demo`, no area picture.
- Includes every section: temperature and humidity on the subtitle; thermostat, humidifier, water heater, and illuminance in Climate; one dimmable light on (with LED switch dot) and one on/off light off; one playing media player; one idle camera; one switch on and one off; occupancy on; door contact off (82% battery); assist satellite; smoke sensor on (41% battery); one unlocked lock (18% battery) and one locked lock (76% battery); one cleaning vacuum (55% battery); button, input button, scene, and script; helpers (input boolean on, input select, timer); two automations (one on, one off).
- Service calls and more-info actions on demo entities are no-ops; template rows take their visible title and state from the mock.
