# 🌡️ significant.js — Human-friendly Sensor Values for openHAB

**significant.js** is an **openHAB JavaScript Transformation** script that makes sensor data more readable by **normalizing**, **rounding**, and **converting units** into a more *real-world friendly format*.  You can see it as a filter for unnecessary precision: 6.34 °C becomes a more sensible 6.5 °C, or even 6 °C, depending on your context and your preferences.

It’s built for numeric state values such as from **temperature**, **humidity**, **power**, **date/time values**, **air quality**, and other environmental sensors, smoothing out meaningless fluctuations while respecting physical reality.

🧠 Smart enough to:

- Handle all known openHAB units (°C, m/s, W, mph, hPa, … → see [list of UoM's](https://www.openhab.org/docs/concepts/units-of-measurement.html))
- Reduce irrelevant "flicker"
- Convert between units (e.g., °F → °C, mph → km/h, in → cm, …)
- Special-case around important real-world values (e.g., 1000 mbar pressures, 0° C, 50 Hz, 110 V, 220 V, ...)

---

## ✨ Features

- **Context-aware rounding** based on units (significant figures)
- Optional **decimal scale rounding** (e.g. to integers)
- Supports **unit forcing or removal** (`unit=°C`, `unit=.`)
- Pre-rounding adjustments: `div=`, `mult=`, `skew=`
- Optional **SI unit conversion** (`si=true`): °F→°C, mph→km/h, etc.
- Handles **date-time values** (with `scale=2` for minutes (0=days, 1=hours, 2=minutes, 3=seconds, and 4=milliseconds)
- Handles **angle values** in the sense of "quadrants/octants" and returns the middle of the quadrant/octant etc. (catering for wind directions, such as NO or SSW)
- Adapts the **dimension** of the unit to indicate the amount of significant figures visually, e.g. 1025506 Wh become 1.03 MWh for 3 significant digits and 1026 kWh for 4 digits.
- Converts **textual intervals** to numbers ( "1-2" → 1.5, "3-5" → 4, as needed for e.g. [dwdpollen](https://www.openhab.org/addons/bindings/dwdpollenflug)
- Debug options like **flicker mode** and verbose logging

---

## 📦 Installation (openHAB)

1. Install the [**JavaScript Scripting Addon**](https://www.openhab.org/addons/automation/jsscripting) add-on from the Addon Store in your openHAB web interface.
2. Download `significant.js` into your transform folder - usually:

   ```bash
   /etc/openhab/transform/significant.js
   ```

---

## ⚙️ Usage

### In an Item definition

```ini
Number:Temperature MyTemp "Temperature [%.1f %unit%]" {
  channel="…"
  [profile="transform:JS",toItemScript="JS:significant.js"]
}
```

### With transformation parameters

```ini
...
[profile="transform:JS",toItemScript="JS:significant.js?precision=2.5&unit=°C&si=true"]
...
```

✅ Use the `?key=value` query string to control the behavior.

---

## 🛠️ Parameters

| Parameter     | Type     | Description |
|---------------|----------|-------------|
| `precision`   | number   | Forced number of significant figures (e.g., `2`) (With fractions, e.g. 2.7 for rounding to nm.0, nm.3, nm.7 n(m+1).0) |
| `scale`       | number   | Forced number of max. decimal places (e.g., `scale=0` → whole numbers) |
| `div`         | string   | Divide by number before rounding (`1K`, `1Mi`, etc.) |
| `mult`        | number   | Multiply by number before rounding |
| `skew`        | number   | Add offset before rounding (e.g. for midpoint rounding) |
| `unit`        | string   | Force output unit (e.g. `°C`, or `.` to remove any) |
| `si`          | boolean  | Convert to SI units (default: `true`) |
| `flicker`     | boolean  | Add a tiny fraction to encourage state updates for debugging |
| `verbose`     | boolean  | Enable debug logging |
| `testing`     | boolean  | Enable testing mode |

Valid Booleans are: `true`, `t`, `1`, `yes`, `y`, `on` for **true**, and everything else for **false**.

---

## 🧪 Examples

### 0. Round any sensor value to a sensible amount significant figures (default: 2)

```ini
JS:significant.js
```

### 1. Round to 2 significant figures (e.g. 25 °C instead 25,2 °C)

```ini
JS:significant.js?precision=2
```

### 2. Show only whole numbers

```ini
JS:significant.js?scale=0
```

### 3. Mark incoming values with the unit °C (e.g. for MQTT temperature sensors)

```ini
JS:significant.js?unit=°C
```

### 4. Pre-scale the input by 1000

```ini
JS:significant.js?div=1K
```

### 5. Strip any unit

```ini
JS:significant.js?unit=.
```

### 6. Round a date-time string to minutes

```ini
JS:significant.js?scale=2
```

Input: `2025-09-27T14:16:28.000+0200` → Rounds to `14:16`

---

## 📓 Design Notes

- Works best with inputs like `"12.34"` or `"12.34 °C"`
- Precision count falls back to sensible defaults; three digits for a missing unit
- Higher default precision around important real-world values, e.g. 50 Hz, 980 mbar, 0 °C etc.
- Fractional `precision` values allow halfway rounding (e.g., `1.5` gives x.5)
- This script might work on openHAB 4.X, too - haven't tried - feedback welcome!

---

## 🧑‍💻 Development & Testing

The file contains a CommonJS export block (commented out) to allow optional **Node.js testing**. Uncomment it if you want to run unit tests outside of openHAB.

---

## 🤝 Contributing

Pull requests and issues are welcome — especially for:

- New openHAB units
- Smarter default rules per sensor type
- Additional SI conversions

Please include:

- Example input/output
- openHAB version/runtime
- Expected behavior

---

## 📜 License

GPL-3.0-or-later
