# significant.js

An **openHAB JavaScript Transformation** script that normalizes and rounds incoming numeric state strings to a *unit-dependent, typical* number of significant figures (and/or a fixed decimal scale). It is designed for values that often come from sensors (weather, power, air quality, etc.) and aims to produce “human-friendly” numbers while staying consistent.

It also includes a few special cases (e.g., typical sea-level pressure ranges, near 50 Hz, temperature around freezing) and can optionally convert certain imperial/alternative units to SI-friendly ones.

Example items:

```ini
Number:Temperature My_Outside_Temp "My Temperature [%.1f %unit%]" {
   channel="mqtt:topic:openhab:mine:temp" [profile="transform:JS",toItemScript="significant.js"]
  }

Number:Speed Zugspitze_WindSpeed "Zugspitze Windspeed [%.0f %unit%]"  {
  channel="weathercompany:weather-observations:myaccount:zugspitze:currentWindSpeed" [profile="transform:JS",toItemScript="significant.js?precision=1.5"]
}
```

---

## Features

- **Unit-aware rounding** (significant figures) for many openHAB UoM units
- Optional **fixed decimal rounding** via `scale`
- Optional **unit forcing / unit removal** (`unit=°C`, `unit=.`)
- Optional **pre-scaling** before rounding:
  - `div=...` (supports suffixes like `K`, `M`, `Mi`, `Gi`, …)
  - `mult=...`
  - `skew=...` (add offset before rounding)
- Optional conversion to SI-friendly units when `si=true` (e.g., °F → °C, mph → km/h)
- Special handling for **date-time strings** like `2025-09-27T14:16:28.000+0200` (rounds time depth using `scale`)
- Optional **flicker mode** to add a tiny fraction (debugging / forcing updates)

---

## Installation (openHAB)

1. Ensure the **JavaScript Transformation** add-on is installed in openHAB.
2. Copy `significant.js` into your openHAB transform directory:

   - Typical path:
     - `/etc/openhab/transform/significant.js`

---

## Usage

Use it like any JS transformation:

### In an Item definition (example)

```ini
Number:Temperature MyTemp "Temperature [%.1f %unit%]" { channel="...", stateTransformation="JS:significant.js" }
```

### With query parameters

```ini
stateTransformation="JS:significant.js?precision=3"
stateTransformation="JS:significant.js?scale=0"
stateTransformation="JS:significant.js?unit=°C&si=true"
stateTransformation="JS:significant.js?div=1K"
```

> The script reads parameters from the `?key=value&...` part of the transform call.

---
    
## Parameters

All parameters are optional.

| Parameter | Type | Meaning |
|---|---:|---|
| `precision` (or `prec`) | number | Number of **significant figures** to round to. Overrides unit defaults. Supports fractional steps like `1.5`. |
| `scale` | number | Round to a **fixed number of decimal places** (e.g., `scale=0` → integers). |
| `div` | number/string | Divide value before rounding. Supports suffixes like `1K`, `1M`, `1Mi`, `1Gi`, ... |
| `mult` | number | Multiply value before rounding. |
| `skew` | number | Add offset before rounding (after div/mult). Useful for “half-step” behavior. |
| `unit` | string | Force output unit (e.g., `unit=°C`). Use `unit=.` to **remove** units. |
| `si` | bool | Enable/disable conversions to SI-friendly units (default is `true` in the script logic). |
| `verbose` | bool | Enable extra logging. |
| `testing` | bool | Enable testing behavior / additional logs. |
| `flicker` | bool | Adds a tiny random fraction to help distinguish successive values. |

Boolean values accept: `t`, `true`, `1`, `yes`, `y`, `on` (case-insensitive).

---

## Examples

### 1) Force 3 significant figures
```text
JS:significant.js?precision=3
```

### 2) Always show integer output
```text
JS:significant.js?scale=0
```

### 3) Convert mph → km/h (if `si=true`) and round nicely
```text
JS:significant.js?si=true
```

### 4) Divide first (useful if you can only apply one transform in openHAB)
```text
JS:significant.js?div=10
JS:significant.js?div=1K
JS:significant.js?div=1Mi
```

### 5) Remove any unit from the input
```text
JS:significant.js?unit=.
```

### 6) Date-time rounding by depth using `scale`

Input:
```text
2025-09-27T14:16:28.000+0200
```

Transform:
```text
JS:significant.js?scale=2
```

Effect (conceptually): keeps up to “minutes” precision, rounds deeper parts accordingly.

---

## Notes / Design

- The script expects numeric inputs in a form openHAB commonly produces, e.g.:
  - `"12.34"` or `"12.34 °C"` (unit after a space)
- Unknown units fall back to a reasonable default (and may log a warning if verbose/testing is enabled).
- Some conversions are intentionally “pragmatic” for dashboards (e.g., wind speed prefers `km/h` over `m/s`).

---

## Development / Testing

The file contains an (optional) CommonJS export block for Node.js unit testing, which is commented out for openHAB usage. If you want to unit test it in Node, you can temporarily enable that export.

---

## Contributing

Issues and PRs are welcome—especially for:
- Missing openHAB units
- Better default precision rules for specific sensor types
- Additional safe conversions

Please include:
- example inputs (with units)
- expected output
- your openHAB version/runtime details

## License

GPL-3.0-or-later
