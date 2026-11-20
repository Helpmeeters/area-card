# Helpmeet: Area Card

![Home Assistant Marketplace / HACS](https://img.shields.io/badge/Marketplace%20%2F%20HACS-Custom-41BDF5.svg?style=flat-square)
![GitHub Release](https://img.shields.io/github/v/release/Helpmeeters/area-card?style=flat-square)
![License: MIT](https://img.shields.io/github/license/Helpmeeters/area-card?style=flat-square)

A [Home Assistant Marketplace](https://www.home-assistant.io/integrations/marketplace/) / [HACS](https://hacs.xyz/) Lovelace plugin for Home Assistant areas and floors — **Area Card** shows an Area, **Floor Card** shows all Areas in a Floor, and **Floors Card** shows all Areas, organized by Floor.

**Floor Card**  
![Floor Card showing Areas, status dots, and pinned entities](https://raw.githubusercontent.com/Helpmeeters/area-card/main/docs/images/floor-card.png)

## Zero-Config Philosophy

Each card requires only the selection of an Area or Floor (or nothing at all for **Floors Card**). Area Card depends heavily on Area hygiene and imagery, so your dashboard stays as well-organized and beautiful as your Home Assistant. All customization happens directly in your dashboard.

## Features

- **Automatic Area Discovery** — Pick an area and the card reads its name, icon, picture, and assigned entities, building a `#area-<area_id>` popup organized by domain with **Other Sensors** grouped by device.
- **Status Dots & Tooltips** — Fixed-slot section dots (`lights`, `media`, `cameras`, `switches`, `openings`, `satellites`, `sensors`, `locks`, `vacuums`) with hover tooltips listing every row in that section.
- **Subtitles & Presence Pill** — Compact subtitle with temperature and humidity readings, helper counts, and automation summaries, plus a presence pill (`Occupied`, recognized person name, relative last-seen, or `Clear`) on collapsed Area Cards and Floor headers with occupancy tooltips.
- **Camera Detections** — Frigate detection count badges, recognized person identities, unreviewed review-queue badges, and active class tooltips overlaid on camera cards while keeping person occupancy linked to area presence.
- **Pinning & Card Backgrounds** — Pin favorite entities under the area button (**Always** or **While on** with a 2-minute grace window), or pin secondary device sensors onto their singular primary entity's subtitle (**Pin to `<name>` chip**). Collapsed cards default to a live light-color averaging background (`Light tint`), with a separate **Card Background** selector in popup edit mode (`Light tint`, `Area picture`, `Media: <name>`, or `Camera: <name>`), which also sets the expanded popup background.
- **Battery Overlay** — Toggleable per-area battery percentage badges (**Off**, **Green**, **Yellow**, **Red**) synced per user across browsers.
- **Floor & Floors Cards** — Collapsible **Floor Card** with a rolled-up presence pill and median temperature and humidity in the floor header, plus a header options menu (**Areas when collapsed** stepper and **Sort by presence** toggle, synced per user across browsers) and floor-wide dot alignment — plus **Floors Card** to render every floor in registry order.

## Views

|                                                                                                                                                                                                                                                                                     |                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Area Card - Basic** ![Area Card — Basic](https://raw.githubusercontent.com/Helpmeeters/area-card/main/docs/images/area-card-basic.png) **Area Card - With Pins** ![Area Card — With Pins](https://raw.githubusercontent.com/Helpmeeters/area-card/main/docs/images/area-card.png) | **Area Popup** ![Area Popup showing status chips, entities, and header controls](https://raw.githubusercontent.com/Helpmeeters/area-card/main/docs/images/area-popup.png) |

## Installation

### Marketplace / HACS (Recommended)

![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)

*(This link opens **Marketplace** on Home Assistant 2026.11+ and **HACS** on earlier versions.)*

#### Home Assistant Marketplace (2026.11+)

1. Go to **Settings → Marketplace**.
2. In the upper-right corner, select **Add from link**.
3. Enter `https://github.com/Helpmeeters/area-card` and select **Add** (if prompted for type, choose **Dashboard**).
4. Open **Helpmeet: Area Card** in the list and select **Install**.

#### HACS (2026.10 and earlier)

1. Open **HACS** in Home Assistant.
2. Click the three-dot menu in the top right and select **Custom repositories**.
3. Enter `https://github.com/Helpmeeters/area-card` and select **Dashboard** (or **Lovelace**) as the category.
4. Click **Add**, then search for **Helpmeet: Area Card** and click **Download**.
5. Refresh your browser when prompted.

## Configuration

### Area Card (`custom:area-card`)

Add **Area Card** from the Home Assistant dashboard card picker and select an **Area**.

```yaml
type: custom:area-card
area: office_of_drew
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | **Yes** | `custom:area-card` |
| `area` | `string` | **Yes** | Area ID from Home Assistant. |

### Floor Card (`custom:floor-card`)

Displays a collapsible floor header with a rolled-up presence pill, median temperature/humidity, a floor options menu (**Areas when collapsed** and **Sort by presence**, persisted per user), aggregated status dots, and one **Area Card** per area on that floor, aligned by dot column. Add **Floor Card** from the card picker and select a **Floor**.

```yaml
type: custom:floor-card
floor: downstairs
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | **Yes** | `custom:floor-card` |
| `floor` | `string` | **Yes** | Floor ID from Home Assistant. |

### Floors Card (`custom:floors-card`)

Renders one **Floor Card** for every floor in Home Assistant, in the floor registry's order, with median climate headers and per-floor options menus.

```yaml
type: custom:floors-card
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `string` | **Yes** | `custom:floors-card` |

## Advanced Configuration

### Hiding Sections (`area-card`)

Hide specific sections from both the collapsed card and the popup using **Hide sections** in the visual editor or `hide_sections` in YAML:

```yaml
type: custom:area-card
area: office_of_drew
hide_sections:
  - media
  - satellites
```

Valid `hide_sections` IDs: `climate`, `lights`, `media`, `cameras`, `switches`, `occupancy`, `openings`, `satellites`, `sensors`, `locks`, `vacuums`, `buttons`, `scenes`, `scripts`, `helpers`, `automations`.

### Demo Mode (`area-card`)

Enable **Demo** in the visual editor or set `demo: true` in YAML to preview the card using the built-in Demo Room without reading live Home Assistant entities (`area` can be omitted):

```yaml
type: custom:area-card
demo: true
```

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `hide_sections` | `list` | No | Section IDs to hide from both the collapsed card and the popup. |
| `demo` | `boolean` | No | Fill the card from the built-in Demo Room instead of live Home Assistant entities. |

## Acknowledgments & Inspiration

- **[Advanced Room Card](https://github.com/Lawris/advanced-room-card)** by Lawris — inspiration for live light-color averaging backgrounds, presence badges, floor header median climate, and dynamic presence sorting with collapsed top-N areas.
- **[Bubble Card](https://github.com/Clooos/Bubble-Card)** by Clooos — vendored UI foundation.
- **[Mushroom](https://github.com/piitaya/lovelace-mushroom)** by piitaya — vendored entity and light cards.

## Bundled Dependencies

This card runs private, prefixed copies of:

- [Bubble Card](https://github.com/Clooos/Bubble-Card) v3.4.3 (MIT)
- [Mushroom](https://github.com/piitaya/lovelace-mushroom) v5.2.3 (Apache-2.0)

They are loaded from `vendor/` next to `area-card.js` (or from the same directory when installed via Marketplace / HACS) with prefixed custom element names (`area-card-bubble`, `area-card-mushroom-*`), so separate installs of Bubble Card or Mushroom never conflict and the card picker stays clean. License texts are in `LICENSES/`.

## Technical Reference

For section ordering, dot slot rules, entity classification, subtitle formatting, pinning, battery thresholds, camera backgrounds, and demo room details, see the [Technical Reference](docs/technical-reference.md).

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and what to include in a bug report, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.

## Written with AI assistance

Much of this card's code, tests, and documentation was written with the help of AI coding assistants, then reviewed, tested, and directed by a human maintainer. If something looks wrong, please [open an issue](https://github.com/Helpmeeters/area-card/issues).

## License

[MIT](LICENSE). Area Card is part of Helpmeet, a family of Home Assistant integrations.
