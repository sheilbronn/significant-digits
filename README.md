# 🌡️ significant.js — Human-Friendly Sensor Values for openHAB

**significant.js** is an **openHAB JavaScript Transformation** script that makes sensor data more readable by **normalizing**, **rounding**, and **converting units** into a *real-world friendly format*. Think of it as a digital eye-roll at values like `6.234567 °C` — which becomes a clean `6.5 °C` or even `6 °C`, depending on context.

It’s built for numeric state values from **weather**, **power**, **air quality**, or other sensors, smoothing out meaningless fluctuations while respecting physical reality.

🧠 Smart enough to:

- Handle typical units (°C, m/s, W, …)
- Reduce irrelevant "flicker"
- Convert between units (e.g., °F → °C, mph → km/h)
- Special-case real-world patterns (e.g., 1000 mbar pressure)

---

## ✨ Features

- **Context-aware rounding** based on units (significant figures)
- Optional **decimal scale rounding** (e.g. to integers)
- Supports **unit forcing or removal** (`unit=°C`, `unit=.`)
- Pre-rounding adjustments: `div=`, `mult=`, `skew=`
- **SI unit conversion** (`si=true`): °F→°C, mph→km/h, etc.
- Handles **date-time strings** (round time depth via `scale`)
- Debug options like **flicker mode** and verbose logging

---

## 📦 Installation (openHAB)

1. Install the **JavaScript Transformation** add-on in openHAB.
2. Place `significant.js` into your transform folder:

   ```bash
   /etc/openhab/transform/significant.js
   ```

---

## ⚙️ Usage

### In an Item definition

```ini
Number:Temperature MyTemp "Temperature [%.1f %unit%]" {
  channel="..."
  [profile="transform:JS",toItemScript="JS:significant.js"]
}
```

### With query parameters

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
| `precision`   | number   | Significant figures (e.g., `2`, `1.5`) |
| `scale`       | number   | Decimal places (e.g., `scale=0` → whole numbers) |
| `div`         | string   | Divide before rounding (`1K`, `1Mi`, etc.) |
| `mult`        | number   | Multiply before rounding |
| `skew`        | number   | Add offset before rounding (e.g. for midpoint rounding) |
| `unit`        | string   | Force output unit (e.g. `°C`, or `.` to remove) |
| `si`          | boolean  | Convert to SI units (default: `true`) |
| `flicker`     | boolean  | Add tiny fraction to help state updates |
| `verbose`     | boolean  | Enable debug logging |
| `testing`     | boolean  | Enable testing mode |

Booleans accept: `true`, `1`, `yes`, `on`, etc.

---

## 🧪 Examples

### 1. Round to 3 significant figures

```ini
JS:significant.js?precision=3
```

### 2. Show only whole numbers

```ini
JS:significant.js?scale=0
```

### 3. Convert mph to km/h

```ini
JS:significant.js?unit=km/h&si=true
```

### 4. Pre-scale the input by 1000

```ini
JS:significant.js?div=1K
```

### 5. Strip the unit

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
- Unknown units fall back to sensible defaults
- “Real-world” rules built in (e.g., round Hz near 50, pressure near 1000 mbar)
- Fractional `precision` values allow halfway rounding (e.g., `1.5` gives x.5)

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