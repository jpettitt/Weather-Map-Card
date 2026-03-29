# Alpha test code, this is the first pass at a new Weather Map Card

This is a fork with massive rewrite of the [Weather Radar Card](https://github.com/Makin-Things/weather-radar-card) for home assistant.

Known issues:
- [ ] **Can't be installed via HACS**
- [ ] Marker does not show up
- [ ] Mobile locations are not implmented
- [ ] Panel cards behave weirdly
- [ ] Sections sizing is not yet implmented
- [ ] Lots of test and debug needed
- [ ] Zoom works to all levels but radar resolution doesn't increse withe zoom (data provider limitation) 

# Weather Radar Card (MapTiler Edition)

A Home Assistant weather radar card powered by the **MapTiler Weather SDK**. This card provides a high-performance, interactive map with continuous radar history and forecast animations, globe/mercator projections, and multiple weather data layers.

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg?style=for-the-badge)](https://github.com/hacs/integration)
![Maintenance](https://img.shields.io/maintenance/yes/2026?style=for-the-badge)


## Description

This card is a complete rewrite of the original Weather Radar Card, moving from legacy tile providers to the modern MapTiler Weather SDK. It offers:
- **Smooth Animations:** Continuous weather loops with history and forecast data.
- **Multiple Layers:** Switch between Radar, Precipitation, Temperature, and Wind.
- **Interactive UI:** Tap-to-switch layers, timeline scrubbing, and zoom/recenter controls.
- **Themed Design:** Automatically matches your Home Assistant theme colors.
- **Flexible Coordinates:** Support for static coordinates or dynamic entity-based locations.

## Options

All options below can be configured using the **Visual Editor**.

| Name | Type | Requirement | Description | Default |
| :--- | :--- | :--- | :--- | :--- |
| `type` | string | **Required** | `custom:weather-radar-card` | - |
| `maptiler_api_key` | string | **Required** | Your MapTiler API key (cloud.maptiler.com) | - |
| `card_title` | string | Optional | Text displayed above the card | - |
| `map_style` | string | Optional | Streets, Dark, Light/Backdrop, Basic, Bright, Topo | `Streets` |
| `default_layer` | string | Optional | `radar`, `precipitation`, `temperature`, `wind` | `radar` |
| `zoom_level` | number | Optional | Initial zoom level (3 to 12) | `6` |
| `hour_format` | string | Optional | `24` or `12` (AM/PM display) | `24` |
| `default_projection`| string | Optional | `globe` (3D) or `mercator` (Flat) | `globe` |
| `center_latitude` | number/string| Optional | Map center (Latitude or Entity ID) | HA Config |
| `center_longitude` | number/string| Optional | Map center (Longitude or Entity ID) | HA Config |
| `marker_latitude` | number/string| Optional | Home marker (Latitude or Entity ID) | `center_latitude` |
| `marker_longitude` | number/string| Optional | Home marker (Longitude or Entity ID) | `center_longitude` |
| `past_duration` | number | Optional | Hours of history to show (Max 8) | `1` |
| `future_duration` | number | Optional | Hours of forecast to show (Max 48) | `1` |
| `animation_speed` | number | Optional | Speed in simulation seconds per real second | `3600` |
| `now_pause_duration`| number | Optional | Seconds to pause the animation at "Now" | `0` |
| `autoplay` | boolean | Optional | Automatically start animation on load | `true` |
| `static_map` | boolean | Optional | Disable all user map interaction | `false` |
| `show_zoom` | boolean | Optional | Show Zoom +/- buttons | `true` |
| `show_marker` | boolean | Optional | Show the home marker | `true` |
| `show_playback` | boolean | Optional | Show play/pause and timeline scrubber | `true` |
| `show_recenter` | boolean | Optional | Show the recenter button | `true` |
| `show_projection` | boolean | Optional | Show the projection toggle button | `true` |
| `height` | string | Optional | CSS height (e.g., `400px`, `50vh`) | auto |
| `width` | string | Optional | CSS width (e.g., `100%`, `500px`) | `100%` |

## Weather Layers

Tapping the **Layer Name overlay** (top-left) on the map opens a menu to switch between:
- **Radar**: Real-time and historical precipitation radar.
- **Precipitation**: Global precipitation forecast.
- **Temperature**: Global temperature map.
- **Wind**: Global wind speed and direction.

## Location Coordinates

You can specify coordinates in three ways:
1. **Numeric**: `-25.567607`
2. **Entity ID**: `"device_tracker.my_phone"` (uses the `latitude` and `longitude` attributes).
3. **Advanced**: `{ "entity": "sensor.my_location", "latitude_attribute": "lat_attr" }`

### Mobile Overrides  (not yet implmented)
You can set `mobile_center_latitude`, etc., to override values specifically when the card is accessed from the Home Assistant mobile app or a mobile browser.

## Installation

### Via HACS
Not yet.

### Manual Installation
If you are not comfortable cloning git repost don't install this yet.

## Changelog
See [CHANGELOG.md](CHANGELOG.md) for full history.
