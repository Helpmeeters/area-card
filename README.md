# Helpmeet: Area Card

A [HACS](https://hacs.xyz/) Lovelace card for one Home Assistant area. Pick the area. The card reads the area name and icon, opens a `#area-<area_id>` popup, and fills that popup from the entities assigned to the area. The card also reads the area picture and uses it as the background of the button and the popup. The popup photo fits the dialog width and sits at the top. With pinned rows showing, the area picture is the cluster background and the pinned fills are clear; with none showing, it stays on the button; the popup photo is unchanged.

When the area has device entities and every one of them is unavailable, the collapsed button uses the same half-opacity treatment as a Bubble button whose entity is unavailable. The card stays on screen. Input booleans, input selects, input buttons, timers, and template helpers that are not device entities are ignored. An area with no device entities, or with at least one available device entity, stays at full opacity. An automation that cannot trigger because every trigger depends on an unavailable device does not count as an available entity.

```yaml
type: custom:area-card
area: office_of_drew
```

The visual editor has one required field, the area, an optional multi-select "Hide sections", and an optional boolean "Demo". There is no name, icon, hash, light, or visibility option on the card. Floor visibility stays on the Lovelace card's own Visibility tab.

Sections can be hidden from both the collapsed dots and the popup:

```yaml
type: custom:area-card
area: office_of_drew
hide_sections:
  - media
  - satellites
```

`demo` fills the card from a built-in room and does not read Home Assistant areas, entities, or states. The area can be omitted. `hide_sections` still removes sections. With `demo` false or left out, the card reads the area as before. The card and its nested cards still receive a hass object whose states include the demo entities, and a later hass assignment keeps those states. A service call or more-info for a demo entity does nothing. Template rows take their visible title and state from the mock, because Home Assistant would render those templates without the demo entities.

```yaml
type: custom:area-card
demo: true
```

The demo room is named Demo Room, uses `mdi:home-assistant`, opens `#area-demo`, and has no area picture. It includes every section. Temperature and humidity are the only climate readings on the collapsed subtitle. The Climate popup also has a thermostat, a humidifier, a water heater, and an illuminance reading. One dimmable light is on, one on/off light is off, and that dimmer's LED switch is the light's LED dot. A media player is playing and a camera is idle. One switch is on and one is off. Occupancy is on and a door contact is off. An assist satellite, a smoke sensor that is on, one unlocked lock and one locked lock, and a vacuum that is cleaning are included. A button, an input button, a scene, and a script are in the popup. Helpers are an input boolean that is on, an input select, and a timer. Two automations are listed, one on and one off. The door battery is 82%, the smoke sensor is 41%, the front lock is 18%, the back lock is 76%, and the vacuum is 55%. Dots, chips, and popup cards are the same ones a live area uses.

Valid section ids are: `climate`, `lights`, `media`, `cameras`, `switches`, `occupancy`, `openings`, `satellites`, `sensors`, `locks`, `vacuums`, `buttons`, `scenes`, `scripts`, `helpers`, `automations`. A hidden section is fully removed — not left as an invisible spacer — so the dot row is only as wide as the visible sections. `climate`, `buttons`, `scenes`, `scripts`, `helpers`, and `automations` are still valid `hide_sections` ids. Hiding climate removes its text from the subtitle and the popup section. Hiding buttons, scenes, or scripts removes that popup section. Hiding helpers removes that count and the popup section. Hiding automations removes that piece and the popup section. None of those change the dot-row width. Hiding sensors, locks, or vacuums removes that dot and the popup section.

The button and the popup are the same card. The collapsed button keeps one dot slot for every section except climate, buttons, scenes, scripts, helpers, and automations, in that fixed order, so stacked rooms line up. After satellites those dots are sensors, then locks, then vacuums. Buttons, scenes, and scripts are popup sections with no dot and no subtitle count. Climate, helpers, and automations are subtitles under the room name. Each remaining dot is 22px and shows that section's icon: filled when the section is active, a hollow ring when the section is present but nothing is active, and invisible when the section is absent. The cameras dot uses that same slot, after media and before switches: filled when a camera is recording or streaming, a hollow ring when a camera is present but idle, and invisible when the area has no camera. The Other Sensors dot is filled when any binary sensor in that section is on, a hollow ring when those sensors are present and all off, and invisible when the area has none. The locks dot is filled when any lock is not locked, unavailable, or unknown. The vacuums dot is filled when a vacuum is cleaning, returning, or on. The status chip counts the same way, such as `Cameras 1/2 On`, `Other Sensors 1/2 On`, `Locks 1/2 Unlocked`, and `Vacuums 1/2 Cleaning`. The collapsed area-card dot tooltip shows that section's heading and every row from the popup, in the same order. It opens centered below the dot, and moves above or inward from either side when it would leave the screen. The popup heading for a section uses the same icon to the left of the title. The Status heading uses a list icon. Tapping the button or a visible dot opens the popup. The Cameras section lists each camera as a picture-entity card with camera view auto, so a webcam shows its picture rather than only its name. Tapping the picture opens more-info. Empty sections stay out of the popup.

Status lists those rollups, such as `Lights 1/4 On`. The Climate popup lists temperature and humidity sensors, thermostats, humidifiers, water heaters, and the extra environment readings: illuminance, carbon dioxide, carbon monoxide, particulate matter, air quality, volatile organic compounds, moisture, and a standalone pressure reading. Those sensor rows and a water heater are entity cards. A thermostat uses the climate card. A humidifier uses the humidifier card and shows the target humidity control. The collapsed button repeats only the temperature and humidity sensor titles and states on one line under the room name, separated by ` · `. Thermostats, humidifiers, water heaters, and the other environment readings stay off that line. A room with no temperature or humidity sensors, no helper count, and no automation summary has no subtitle. Other Sensors, Locks, and Vacuums follow Satellites in the popup. Buttons, Scenes, and Scripts follow those, before Helpers. An Other Sensors row is an entity card. Lock and vacuum rows are full width. Tapping a button or input button presses it, and holding that row opens more-info. Tapping a scene turns it on. Tapping a script turns it on. Entities that belong to a kiosk satellite stay on the one Satellites card. When the installed Kiosk Satellite Card is loaded, a satellite that has a device is that card (`custom:kiosk-satellite-card`, `device` set to the satellite device). That plugin's one card is the Redisplay. A locally served build and the old `kiosk-redisplay` name are left unused. `assist_satellite.updoot_assist_satellite` pairs with `media_player.updoot`. The player does not need an area. That player is listed under Media players when the kiosk card is not loaded, and when the satellite has no device. When Kiosk Satellite Card is loaded and it is showing Now Playing, that player is left out of Media players. Now Playing is that card's player, and it stays shown while the player is idle, off, unknown, or unavailable.

On/off lights toggle from the icon; the rest of the row opens more-info. Dimmable lights keep the Mushroom light card. A `switch.*_led` on the same device is a dot on the right of that light and toggles only the LED. Entity titles in the popup, including camera titles, drop a leading room name. A row sits at half width when that title and the longest state line both fit beside the icon, so two lights can share a line. Status chips, section headings, media players, a Kiosk Satellite Card, cameras, locks, and vacuums stay full width. A light's LED dot counts against that fit. The popup header and the collapsed button keep the full room name. The popup header title has no fill. The header has a gear to the left of close which opens that area's settings page (`/config/areas/area/<area id>`). A battery icon to the left of the pencil opens a menu of Off, Green, Yellow, and Red. Off is selected until a color is chosen, and it shows no battery percentages. Green shows the percentage on every row that has a battery, colored green at 70% and above, yellow from 30% through 69%, and red below 30%. Yellow hides the green percentages. Red hides green and yellow percentages, so only red remains. The battery is the sensor on that row's device with device class battery, or the row's own battery level when that sensor is absent. Each area keeps its own choice for that Home Assistant user, and that choice follows the user across browsers. A pencil to the left of the gear toggles edit mode, and each entity row then has a button that opens a menu of hidden, always, and while on. Each menu row shows that choice's icon and title. A camera also offers use as area background. That choice replaces the collapsed card background with that camera's live video and does not pin the camera as a row. The video is muted, starts on its own, and shows no play button. It fills the card with a normal cover crop once a frame is showing, and the camera still stays visible until then. The popup photo stays the area picture. The first camera in the area's camera order with that choice supplies the video. A camera with no stream keeps its still image. If the video does not start, the area picture stays. Always shows that row under the collapsed area button. While on shows it only while that entity is on or playing, and for two minutes after it stops. The choice is stored for that Home Assistant user and follows that user across browsers. A reload clears the two-minute grace, so a paused player stays hidden until it plays again. Automations assigned to the area, and automations whose name contains the room name, are listed under Automations. An automation is disabled when every trigger depends on an unavailable device, so a time, sun, or other trigger that can still fire keeps it enabled. A disabled automation stays in the list and does not count as on. The automations status chip reads `Automations 2/3 on, 0 disabled`, and `Automations 1 disabled` when none are on or off. Disabled automations are not part of the fraction. The collapsed area card shows the count on that same subtitle line, after any climate text, separated by ` · `: `2/3` and the automations flash icon. On/off helpers on that line read `1/3` and the helpers cog icon. When both counts are present they follow the climate text as one piece, separated by a comma: `1/3`, the helpers icon, then `2/3` and the automations icon. A disabled count is struck through, so one on, one off, and three disabled reads `1/2+` with `3` struck, then the automations icon. When only one is disabled it reads `0/0+` with `1` struck, then the automations icon. A zero disabled count omits `+0`. Hiding automations removes that piece and the popup section. The popup row shows Disabled.

## Floor Card

A collapsible floor header. Clicking the header collapses or expands the card. When expanded, one Area Card is shown for each area assigned to the floor, sorted alphabetically, including areas whose devices are unavailable. The open or closed state is stored for that Home Assistant user and restored on the next visit on any of that user's browsers. A floor with no stored value starts expanded. Different users keep their own state.

The header is a section title: the floor name, a rule, a row of dots, and a collapse control. Its icon comes from the floor registry. A floor with no icon shows no icon.

The header dots sit just left of the collapse control and use the same slots as the area cards, including the cameras slot and the sensors, locks, and vacuums slots after satellites, so there is no climate, buttons, scenes, scripts, helpers, or automations column. A dot is filled when any area has that section active, a hollow ring when the section is present but nothing is active, and invisible when no area draws it. The tooltip adds the area counts, such as `Lights 3/12 On`. Area cards on the floor shift their dots left by the width of the collapse control so each column lines up with the header. On a narrow header the floor name stays whole and dots leave from the left, so the columns that remain still line up.

```yaml
type: custom:floor-card
floor: downstairs
```

The visual editor has one required field, the floor.

The Floor Card automatically hides sections that have no entities on any area of the floor. This keeps the dot row only as wide as the floor actually uses. A section present in even one area stays visible in all area cards on that floor so the dots still line up. A floor with no cameras hides the cameras section. One camera on the floor keeps that column on every area. Climate sensors still count toward section presence, so the Climate popup section stays, and they do not draw a dot. The collapsed area card shows temperature and humidity as a subtitle. Automations still count toward section presence, so the Automations popup section stays, and they do not draw a dot. The floor header has no automations column. On/off helpers still count toward section presence, so the Helpers popup section stays, and they do not draw a dot. The collapsed area card shows that count as `X/Y` and the helpers icon. The floor header has no helpers column. Helper selects and timers still count toward presence. They stay out of that count and do not draw a dot. Other sensors, locks, and vacuums still count toward section presence and draw a dot, so one lock on the floor keeps the locks column on every area. Buttons, scenes, and scripts still count toward section presence, so those popup sections stay, and they do not draw a dot. The floor header has no buttons, scenes, or scripts column, and the collapsed area card does not add a count for them.

## Floors Card

One Floor Card for every floor in Home Assistant, in the floor registry's order. Dragging floors into a new order in Home Assistant changes this card. A floor with no areas still shows its header. When Home Assistant has no floors, the card says "No floors".

```yaml
type: custom:floors-card
```

The visual editor has no fields. The card reads the floors from Home Assistant.

## Private Bubble Card and Mushroom

This card always runs the copies shipped with it:

- [Bubble Card](https://github.com/Clooos/Bubble-Card) v3.4.3 (MIT)
- [Mushroom](https://github.com/piitaya/lovelace-mushroom) v5.2.3 (Apache-2.0)

Those copies are loaded from `vendor/` next to `area-card.js`, or from the same directory when HACS installs the release assets side by side. Their custom elements are prefixed (`area-card-bubble`, `area-card-mushroom-*`) so a HACS install of Bubble Card or Mushroom cannot change this card, and the card picker does not gain a second set of those cards.

License texts are in `LICENSES/`.

## Install

Add `https://github.com/Helpmeeters/area-card` in HACS as a Lovelace plugin (category `plugin`) and install **Helpmeet: Area Card**. HACS registers the `area-card.js` resource. The release also includes `area-card-bubble.js` and `area-card-mushroom.js`, which the card loads at runtime.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and what to include in a bug report, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.

## Written with AI assistance

Much of this card's code, tests, and documentation was written with the help of AI coding assistants, then reviewed, tested, and directed by a human maintainer. If something looks wrong, please [open an issue](https://github.com/Helpmeeters/area-card/issues).

## License

[MIT](LICENSE). Area Card is part of Helpmeet, a family of Home Assistant integrations.
