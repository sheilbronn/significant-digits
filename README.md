# 🌡️ significant.js — Human-friendly Sensor Values for openHAB

**significant.js** is an **openHAB JavaScript Transformation** script that makes sensor data more readable by **normalizing**, **rounding**, and **converting units** into a more *real-world friendly format*.  You can see it as a filter for unnecessary precision: 6.34 °C should become a more sensible 6.5 °C, or even 6 °C, depending on your preferences and your context.

It’s built for numeric state values such as from **temperature**, **humidity**, **power**, **air quality**, and other environmental sensors, smoothing out meaningless fluctuations while respecting physical reality. But it also works for **percentages** and **date/time values**.

🧠 Smart enough to:

- Handle all known openHAB units (°C, m/s, W, mph, hPa, s, … → see [list of UoM's](https://www.openhab.org/docs/concepts/units-of-measurement.html))
- Reduce irrelevant "flicker"
- Convert between units (e.g., °F → °C, mph → km/h, in → cm, …)
- Higher precision defaults around some important real-world values (i.e. 1000 mbar pressures, 0° C, 50 Hz, 110 V, 220 V, ...)
- Handles [SI units](https://en.wikipedia.org/wiki/International_System_of_Units) as well as [Imperial units](https://en.wikipedia.org/wiki/Imperial_and_US_customary_measurement_systems).

---

## ✨ Features

- **Context-aware rounding**, based on units (significant figures)
- Optional **decimal scale rounding** (e.g. to integers)
- Supports **unit forcing or removal** (`unit=°C`, `unit=.`)
- Pre-rounding adjustments: `div=`, `mult=`, `offset=`
- Optional **SI unit conversion** (`si=true`): °F→°C, mph→km/h, etc.
- Handles **date-time values** (with `scale=2` for minutes (0=days, 1=hours, 2=minutes, 3=seconds, and 4=milliseconds). Fractional values are also supported, e.g. 2.5 for multiples of 30 seconds)
- Handles **angle values** in the sense of sectors such as "quadrants/octants" and returns the middle of the sector etc. (catering for wind directions, such as NO or SSW)
- Adapts the **dimension** of the unit to indicate the amount of significant figures visually, e.g. 1025506 Wh become 1.03 MWh for 3 significant digits and 1026 kWh for 4 digits.
- Converts **textual intervals** to numbers ( "1-2" → 1.5, "3-5" → 4, as needed for e.g. [dwdpollen](https://www.openhab.org/addons/bindings/dwdpollenflug)
- Debug options like **flicker mode** and verbose logging.

---

## 📦 Installation (openHAB)

1. First, install the [**JavaScript Scripting Addon**](https://www.openhab.org/addons/automation/jsscripting) add-on from the Addon Store in your openHAB web interface.
2. Download `significant.js` into your transform folder - usually here:

   ```bash
   /etc/openhab/transform/significant.js
   ```
   There should be no need to restart openHAB.
4. Alternative: This script is also directly available one the OpenHAB Add-on Marketplace as [Significant Digits](https://community.openhab.org/t/significant-digits/168792). You still need to install the JavaScript Scripting Addon, however.

---

## ⚙️ Usage

### In an Item definition

```ini
Number:Temperature MyTemp "Temperature [%.1f %unit%]" {
  channel="…"
  [profile="transform:JS",toItemScript="JS:significant.js?precision=1.3"]
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
| `div`         | string   | Divide by number before rounding (`1K`, `1Mi`, etc.)    |
| `mult`        | number   | Multiply by number before rounding                      |
| `offset`      | number   | Add an offset after dividing/multiplying and before rounding (e.g. for midpoint rounding) |
| `unit`        | string   | Force output unit (e.g. `°C`, or `.` to remove any)     |
| `si`          | boolean  | Convert to SI units (default: `true`)                   |
| `flicker`     | boolean  | Add a tiny fraction to generate state updates for debugging |
| `verbose`     | boolean  | Enable debug logging |
| `testing`     | boolean  | Enable testing mode  |

Valid Booleans are: `true`, `t`, `1`, `yes`, `y`, `on` for **true**, and everything else is **false**.

---

## 🧪 Examples

### 0. Round any sensor value to a sensible amount of significant figures (default: 2)

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

### 4. Pre-scale the input by 1000 and add an offset of +10

```ini
JS:significant.js?div=1K&offset=10
```

### 5. Strip any unit

```ini
JS:significant.js?unit=.
```

### 6. Round a date-time string to multiples of 30 seconds

```ini
JS:significant.js?scale=2.5
```

Input: `2025-09-27T14:16:28.000+0200` → rounds to `2025-09-27T14:16:30.000+0200`

---

## 📓 Design Notes

- Works best with inputs like `"12.34"` or `"12.34 °C"`
- Precision count falls back to sensible defaults: two digits (~1%) for a value having no unit
- Higher default precision around important real-world values, e.g. 50 Hz, 980 mbar, 0 °C etc.
- Fractional `precision` values allow halfway rounding (e.g., `1.5` gives x.5)
- This script might work on old openHAB 4.X, too - haven't tried - feedback welcome!

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
