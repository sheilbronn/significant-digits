// significant.js
//
// Copyright (C) 2024,2025,2026  Stephen Heilbronner
//
// This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or // (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.

// significant.js is a OpenHAB transformation script to reduce incoming values to a unit-dependant, home-automation typical number of
// significant figures in the SI unit system, plus some other features. The general default number of significant figures is 2, but is adapted 
// depending on the concrete OpenHAB unit type (e.g. temperature, speed, frequency, power, pressure, etc.)
// It also foresees a slightly higher number for significance around special values, e.g. around 0 °C, 100 °C, 100 °F, 220 V, 50 Hz etc.

// These script parameters are supported (all optional):
// "precision" : force a given number of significant figures to round to (=override the unit specific default), use like ...?precision=3
// "scale"     : a number of decimal places to round to: ...?scale=0
// "div"       : a divisor to apply to the input value before rounding: ...?div=10 oder 1M or 1000 (useful since OpenHAB only supports one transformation at a time)
// "mult"      : a multiplier to apply to the input value before rounding: ...?mult=1K oder 1M oder 1000 (similar to div)
// "unit"      : a unit to force the output to: ...?unit=°C (unit=. will remove any unit passed in the input)
// "verbose"   : one of {t|true|1|yes|y||false|no} to enable or disable logging: ...?verbose=true
// "testing"   : {t|true|1|yes|y||false|no} to enable or disable testing of new features: ...?testing=y
// "offset"    : a number to add to the input value before rounding,: ...?offset=0.5

// Not implemented (yet):
// "mode"    : specify the rounding mode (e.g. "up", "down", "half-up", "half-down", "half-even", etc.) for the significant figure rounding, half-up is the default for now

// Some global variables:
var verboseAsked     = false; // if default set to true here, script will always log some details about the transformation
var testingAsked     = false; // if default set to true here, script will always support be set to "testing of new features"
var debugEnabled     = false; // if default set to true here, script will always log debug messages
var verboseIncreased = false; // if true and verbose is true, then log even more details

var ident         = "";                 // an optional ident string to identify the invocation in the log messages
var scriptname = "significant.js: "; // will hold the script name for logging
var genericUnitPrefixes = Object.freeze(["n", "µ", "m", "", "k", "M", "G", "T", "P", "E", "Z", "Y", "R", "Q"]); // generic prefixes for normalization
var SCALE_AMOUNT_MAP = Object.freeze({
    "": 1, k: 1e3, K: 1024, ki: 1024, M: 1e6, Mi: 1024 ** 2, G: 1e9, Gi: 1024 ** 3, T: 1e12, Ti: 1024 ** 4, P: 1e15, Pi: 1024 ** 5,
});
var DATE_TIME_SCALE_MAP = new Map([
    ["paddings", [4, 2, 2, 2, 2, 2, 3]],
    ["steps", new Map([               // for fractional of ...
        [-3, [1, 1,  2,  3,  4,  6]], // years, e.g. to 5y, 4y, 3y, 2y steps
        [-2, [1, 1,  5,  8, 10, 15]], // months, e.g. to 6m, 4m, 3m, 2m steps
        [-1, [1, 1,  2,  2,  3,  3]], // days, e.g. to 2d, 3d, 4d, 5d, 6d, 7d, 8d, 9d steps
        [0,  [1, 2,  4,  6,  8, 12]], // hours, e.g. to 12h, 8h, 6h, 4h, 2h steps
        [1,  [1, 5, 10, 15, 20, 30]], // minutes, e.g. to 30min, 20min, 15min, 10min, 5min steps
        [2,  [1, 5, 10, 15, 20, 30]], // seconds, e.g. to 30s, 20s, 15s, 10s, 5s steps
        [3,  [1, 100, 125, 250, 333, 500]] // milliseconds, e.g. to 500ms, 333ms, 250ms, 125ms, 100ms steps
    ])],
]);

// Lookup tables for "nice" borders and middle values for significant figure rounding with fractional precisions:
// when frac=0.5/mult=2 would be 100, 500, 1000.                 OK: 100, 500, 1000           with borders at 300, 700
// when frac=0.4/mult=3 would be 100, 333, 667, 1000.        Better: 100, 300, 600, 1000      with borders at 200, 450, 800
// when frac=0.3/mult=4 would be 100, 250, 500, 750, 1000.   Better: 100, 200, 500, 700, 1000 with borders at 150, 350, 600, 850
// when frac=0.2/mult=5 would be 100, 200, 400, 600, 800, 1000   OK: 100, 200, 400, 600, 800, 1000   with borders at 150, 300, 500, 700, 900
var BORDERS1 = Object.freeze({ // for different precision fractions, i.e. a main (=integer) value larger than 0
  2: [2.5, 7.5],
  3: [1.5, 4.5, 8],
  4: [1, 3.5, 6, 8.5],
  5: [1, 3,  5, 7, 9]
 });
var MIDDLES1 = Object.freeze({
  2: [0, 5, 10],
  3: [0, 3, 6, 10],
  4: [0, 2, 5, 7, 10],
  5: [0, 2, 4, 6, 8, 10]
 });
var BORDERS0 = Object.freeze({ // for precision fractions with a main (=integer) value of 0
  2: [3, 7.5],
  3: [2, 4.5, 8],
  4: [1.5, 3.5, 6, 8.5],
  5: [1.5, 3  , 5, 7, 9]
 });
var MIDDLES0 = Object.freeze({
  2: [1, 5, 10],
  3: [1, 3, 6, 10],
  4: [1, 2, 5, 7, 10],
  5: [1, 2, 4, 6, 8, 10]
 });

/* All the following openHAB units should be understood: 
https://www.openhab.org/docs/concepts/units-of-measurement.html (uunits):
Acceleration: m/s²
Amount of substance: mol, °dH
Angle: rad, °, ' (arc-min), '' (arc-sec)
Area: m²
Areal density: DU
Catalytic activity: kat
Data amount: bit, B, o
Data rate: bit/s, Mbit/s
Density: g/m³, kg/m³
Dimensionless: one, %, ppm, dB
Electric: V, A, mA, F, C, Ah, S, S/m, H, Ω
Energy: J, Ws, Wh, VAh, varh, cal, kWh
Force: N
Frequency/Rotation: Hz, rpm
Illuminance: lx
Irradiance/Intensity: W/m², µW/cm²
Length: m (plus cm, mm, etc.)
Luminous: lm, cd
Magnetic: Wb, T
Mass: g, kg, lb (see imperial below)
Power: W, kW, VA, var, dBm
Pressure: Pa, hPa, mmHg, bar, psi, inHg
Radioactivity / radiation: Bq, Gy, Sv, Ci
Solid angle: sr
Speed: m/s, km/h, mph, kn
Temperature: K, °C, °F, color-temp: mired / MK⁻¹ (aka mirek)
Time: s, min, h, d, week, y
Volume: l, m³, gal (US)
Volumetric flow: l/min, m³/s, m³/min, m³/h, m³/d, gal/min.

Imperial base symbols (also understood):
in, ft, yd, ch, fur, mi, lea, gr (mass), inHg, psi, mph, °F, gal (US), gal/min.

Prefixes:
All metric prefixes (mA, cm, kW, …) and binary prefixes (kiB, MiB, …) are supported—just prepend the symbol.
*/

// Frequently used Math functions:
var { abs, min, max, floor, round } = Math;

// Now the main function called by OpenHAB when the transformation is invoked:
function significantTransformed(i, opts = {}) {

    let input   = String(i ?? "").trim(); // store the incoming value (and optionally unit name) to be transformed
    let unit_i  = ""   // will carry the unit name in the input i (if any)
    let strVerb = ""   // will carry the message string for logging
    let matches = null // will be used for regex matches
 
    // reset on each invocation (prevents cross-call leakage) - FIXME: check whether this is still needed in openHAB 5?
    verboseAsked = false;
    testingAsked = false;
    debugEnabled = false;
    verboseIncreased = false;

    // more vars to carry values of the injected parameters:
    var precisionAsked  = undefined // will carry the requested number of significant figures
    var offsetAsked  = undefined  // will carry a requested offset to be applied to the input value after div'iding and before rounding
    var divAsked   = undefined  // will carry a divisor to be applied to the input value before offset adding and before rounding
    var multAsked  = undefined  // will carry a multiplier to be applied to the input value before offset adding and before rounding
    var unitAsked  = undefined  // will carry the requested unit name
    var scaleAsked = undefined  // will carry the requested number of decimal places
    var siAsked    = true       // will carry true if units shall be transformed to SI units (default=true), e.g. °C instead of °F
    var flickerEnabled   = false; // if default set to true here, output will always have a tiny, small random value added to distinguish it from the previous value. This helps debugging
    var dryRunAsked  = false;   // if set to true, the script will not return the transformed value but rather the input value and log the would-be transformation result for testing purposes

    // Defaults:
    var scaleSeeked = undefined
    var angledivider = 1 // for rounding angles to 90°, 45°, 22.5° steps
    var precisionSeeked = 2  // 2 is the default for significant figures to round to, if no or unknown unit given
    let precisionFound = 0.5 // will hold the number of significant figures found in the input value, use 0.5 in case of no meaningful figures (also for "0.0")
    let unitPrefixes = [ ]; // will hold an array of units for normalization if needed, set to undefined if normalization is to be suppressed
    var alwaysLogFinal   = false; // if set to true, always log the final output of the transformation (set this to true for first timers!)

    // helper functions:
    const l = v => String(v)[0];  //return first character of the string passed in
    const transpose = (v, factor, newUnit) => [v * factor, newUnit];
    const fmt = (v, u) => String(v) + (u ? " " + u : "");
    const parseAndTrace = (raw, parser, label, rawLabel, valueFormatter = v => v) => {
        if (raw == null) return undefined;
        const parsed = parser(raw, label);
        const tracedValue = valueFormatter(parsed);
        strVerb += rawLabel ? ` ${rawLabel}=${raw} ${label.toUpperCase()}=${tracedValue}` : ` ${label.toUpperCase()}=${tracedValue}`;
        return parsed;
    };
    const FIVEPERCENT = 1.5; // 1.5 significant digits for a precision of 5% (e.g. for speed, power, pressure, etc.)
    const ONEPERCENT  = 2; // 2 significant digits for a precision of 1% 
    const HALFPERCENT = ONEPERCENT + 0.5; // 2.5 significant digits for a precision of 0.5% 
    const ONEPROMILLE = ONEPERCENT + 1  ; // 3 significant digits for a precision of 0.1%

    // debugit(`input=${input}`);

    // Now parse all invocation parameters from the script call:
    // ident          = opts.ident ?? ""; // an optional ident string to better identify the invocation in the log messages
    const parseBool = v => !!setDefault(v, isTrue);
    ident = parseAndTrace(opts.id, v => v, "ident")
    verboseAsked   = parseAndTrace(opts.verbose, parseBool, "verb",   undefined, l) ?? verboseAsked;
    testingAsked   = parseAndTrace(opts.testing, parseBool, "test",   undefined, l) ?? testingAsked;
    dryRunAsked    = parseAndTrace(opts.dryRun,  parseBool, "dryrun", undefined, l) ?? dryRunAsked;
    siAsked        = parseAndTrace(opts.si,      parseBool, "si",     undefined, l) ?? siAsked;
    flickerEnabled = parseAndTrace(opts.flicker, parseBool, "flick",  undefined, l) ?? flickerEnabled;

    precisionAsked = parseAndTrace(opts.precision, numOrUndef, "prec")  ?? precisionAsked; // alias prec to precision for backward compatibility
    scaleAsked  = parseAndTrace(opts.scale,     numOrUndef, "scale") ?? scaleAsked;
    offsetAsked = parseAndTrace(opts.offset ?? opts.skew, numOrUndef, "offset"); // backward compatibility: skew renamed to offset, but still supported
    divAsked    = parseAndTrace(opts.div,  parseScaledNumber, "div", "div");
    multAsked   = parseAndTrace(opts.mult, parseScaledNumber, "mult");
    unitAsked   = parseAndTrace(opts.unit, v => v, "unit"); // if a unit is explicitly given, then force it, even if div or mult are present

    // if (ident != null) logit(`ident=:${ident}:${opts.ident}:${strVerb}:`); // log the parsed parameters with the ident for better traceability
    // if (testingAsked) { verboseAsked = true ; }// if testing is asked, then also enable verbose logging

    // Special case: If the input matches a DATE-TIME string: scale the time part to a number of *significant time parts *
    // (days, hours, minutes, seconds, ...), e.g. "2025-09-27T14:16:00.000+0200" or "2025-09-27T14:16:12.20+0200"
    const dtregex = /^(\d{4})-([01]\d)-([0123]\d)(T| )([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{1,3})([+-]\d{4})$/ // e.g. 2024-10-13T02:30:03.000+0200 or 2024-10-13T02:30:03.20+0200
    matches = input.match(dtregex);
    if (matches) { // input is a timestamp with a numeric offset
        if (precisionAsked !== undefined) { // n.b. only scale= is considered, not prec=. Warn if prec is set!
            logit(`WARNING: precision=${precisionAsked} is currently ignored for DATE-TIME input, use scale=0..4 to specify the number of time parts to keep (0=days, 1=hours, 2=minutes, 3=seconds, 4=milliseconds). ${strVerb}`);
        }
        // debugEnabled = true; // only for testing purposes

        const [ , yy, mo, dd, , hh, mm, ss, dotms, tzoffset ] = matches // slice the matches into the time parts
        const ms = parseInt(dotms.slice(1).padEnd(3, "0"), 10)  // ".2" -> 200, ".20" -> 200, ".123" -> 123

        // time-date scale levels are: 0=days, 1=hours, 2=minutes, 3=seconds, 4=milliseconds
        scaleAsked = clamp(scaleAsked ?? 3, [0, 4])  // clamp scaleAsked to [0..4] with a default of 3
        const [scaleFloor, frac] = splitScaleValue(scaleAsked)
        debugit(`  DATE-TIME INPUT: scaleAsked=${scaleAsked} > scaleFloor=${scaleFloor}, frac=${frac}`);
        const step = DATE_TIME_SCALE_MAP.get("steps").get(scaleFloor)?.[round(frac * 10)] ?? 1

        // Divide the (fake, UTC'ed) time by (roundingUnitMs*step size), round and multiply it back. 
        // Rounds the local time to the desired step size
        // without having to deal with the complexities of calendar arithmetic for months and years.
        const roundingUnitMs = [24 * 3600 * 1e3, 3600 * 1e3, 60 * 1e3, 1e3, 1][Math.ceil(scaleAsked)] // choose rounding unit: day, hour, minute, second, millisecond
        const timeMs = Date.UTC(+yy, +mo - 1, +dd, +hh, +mm, +ss, +ms) // local wall time -> UTC epoch ms (treat tzoffset as a fixed-offset zone)
        const roundedTime = round(timeMs / (step * roundingUnitMs)) * (step * roundingUnitMs)
        const output = new Date(roundedTime).toISOString().replace("Z", tzoffset)
     
        var logMsg = `${input} > ${output}  stringdiff=${suffixDiff(input, output).aSuffix}  ${strVerb}`;
        if ( !logit(`FINAL: ${logMsg}`) && alwaysLogFinal) {
            consolelog(`SIGNF: ${logMsg} ${dryRunAsked ? "(DRYRUN)" : ""}`);
        }

        return dryRunAsked ? input : output // early return for a (transformed) date-time string
    }
    debugit(`input=${input}, match date regex: ${(matches ? "YES" : "NO")}`);
    
    // Now, parse the value from the input value (and the unit if any):
    var value = parseFloat(input);
    var origValue = 0
    var newValue  = 0
    var origUnit  = ""
    var finalUnit  = ""
    if (isNaN(value)) { // check for special cases of NaN or non-numeric input, such as "0-1", "1-2", etc.
        // treat special input cases "0-1", "1-2", "2-3" as midpoints, e.g. as from https://www.openhab.org/addons/bindings/dwdpollenflug
        matches = input.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/)
        if (!matches) { // special case for ranges like "0-1", "1-2", "2-3"
            warnit(`FINAL: "${input}" is NaN.`)
            return input // take an early exit for NaN non-numeric values, and return the whole input as is.
        }
        value = (parseFloat(matches[1]) + parseFloat(matches[2])) / 2  // ... and no unit allowed in this case
        logit(`input="${input}" treated as midpoint value ${value}.`)
        origValue = matches[1] + "-" + matches[2]
    } else {
        matches = input.match(/\s+(.*)$/)
        if (matches) { // consider the stuff behind a space to be the unit.
            unit_i = matches[1]
            origUnit = unit_i
        }
        origValue = value // preserve original value for later logging and comparison, FIXME: should be saved before parseFloat

        // if (value>777 && value<778 && value===6.777) { // trigger debugging
        if (isWithin(value, [6.776, 6.777], [328000, 0])) {
            debugEnabled = true; // only for testing purposes
            verboseAsked = true;
            verboseIncreased = true;
            logit(`  DEBUG: ${value} triggers debugging.  ${strVerb}`);
        }
    }

    // Now determine the number of significant figures of the original INPUT value (i.e. those figures before AND after the decimal point):

    // extract to m the first numeric token: supports "12.3 °C", "-.0450", "1.20e3", etc.
    const m = input.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)
    if (!m) {
        return input;  // this should not happen, since we parsed a float before
    }

    const mant = m[0].split(/[eE]/)[0].replace(/^[+-]/, ""); // mantissa, no sign
    let digits = mant.replace(".", ""); // for counting digits

    if (/[1-9]/.test(digits)) {  // this should be the normal case:
        precisionFound = digits.replace(/^0+/, "").length
    }
    debugit(`input: origValue=${origValue} ${origUnit} (${precisionFound}) ${strVerb}`);

    // Now deal with the requested modifications of the input value before rounding:
    if ( unitAsked != null) {
        if (unitAsked === "" || unitAsked === ".") {
            value *= {KiB:1024, MiB:1024**2, GiB:1024**3, TiB:1024**4, PiB:1024**5}[unit_i] ?? 1 // convert common IEC units to bytes (no unit).
        }
        logit(` unit: "${unit_i || "(none)"}" > "${unitAsked || "(none)"}"  ${strVerb}`) ;
        unit_i = (unitAsked === ".") ? "" : unitAsked ;  // force unit
    }

    // Now the main part: Modify precision defaults depending on the unit coming in or asked for:
    switch (unit_i) {
    case "°F": // Temperature
        if (!siAsked) {
            precisionSeeked = (abs(value)<3) ? 1.3 : isWithin(value, [190, 215]) ? ONEPROMILLE : HALFPERCENT
            break
        }
        [value, unit_i] = transpose(value-32, 5/9, "°C") ; // convert and fallthrough to °C ...
    case "°C":
        // precisionSeeked = (abs(value) < 1) ? 0.3 : (abs(value) < 10) ? 1.5 : isWithin(value, [100, 120], [36, 42]) ? 3 : HALFPERCENT
        precisionSeeked = isWithin(value, [100, 120], [36, 42]) ? ONEPROMILLE : (abs(value) < 10) ? max(magniTude(value), 1.5) : HALFPERCENT
        scaleSeeked = (abs(value) < 0.1) ? 2 : (abs(value) < 2) ? 1 : 0
        break;
    case "K":
        precisionSeeked  = max(-1, magniTude(value)) // more significant figures for higher temperatures
        precisionSeeked  = clamp(precisionSeeked, [1, 3]) // clamp it to 1..3
        precisionSeeked += isWithin(value, [0, 10], [273, 2], [273+98, 3], 0.7)  // increase prec for special cases around water freezing and boiling point
        logit(`Kelvin hit: value=${value} ${unit_i} precSeeked=${precisionSeeked} ${strVerb}`);
        break;

    // Speed
    case "kn":
        [ value, unit_i ] = transpose(value, 1.15078, "mph"); // convert kn to mph
    case "mph":
        // precisionSeeked = (abs(value) < 10) ? 1.5 : (abs(value) < 30) ? 1.3 : 1.5
        precisionSeeked = 1.5 + isWithin(value, [10, 30], 0.2) 
        scaleSeeked = 0
        if (siAsked) {
            [ value, unit_i ] = transpose(value, 1.609344, "km/h") ; // convert mph to km/h (prefer km/h over m/s for typical weather station wind speed)
        }
        break
    case "m/s":
        [ value, unit_i ] = transpose(value, 3.6, "km/h") ; // fallthrough to km/h ...
    case "km/h":
        precisionSeeked = (abs(value) < 5) ? 1 : (abs(value) < 20) ? FIVEPERCENT : ONEPERCENT
        break;
    case "in/h":
        if (siAsked) {
            [ value, unit_i ] = transpose(value, 25.4, "mm/h") ; // convert in/h to mm/h
        }
        break;

    // Length, distance, and precipitation
    case "yd":
        [ value, unit_i ] = transpose(value,  3, "ft") ; // convert yd to ft
    case "ft":
        [ value, unit_i ] = transpose(value, 12, "in") ; // fallthrough to in ...
    case "in":
        if (! siAsked) {
            precisionSeeked = ONEPERCENT
            break
        }
        [ value, unit_i ] = transpose(value, 2.54, "cm") ; // fallthrough to cm ...
    case "cm": // typical for precipitation
        [ value, unit_i ] = transpose(value, 10, "mm") ; // fallthrough to mm ...
    case "mm": // typical for precipitation
        precisionSeeked = ONEPERCENT - isWithin(value, [0, 80], 0.2); // a little less precision when <80mm, probably precipitation
        break;
    case "m": // typical for total precipitation
        precisionSeeked = isWithin(value, [0, 0.08]) ? FIVEPERCENT : HALFPERCENT// decrease precision for less than 0.08m, probably precipitation
        unitPrefixes = [ "µ", "m", "", "k" ]; // limit the normalization vector for m to µ, m, k (no need for larger units for length in home automation)
        logit(`${unit_i} hit: value=${value} ${unit_i} (ORIG: ${origValue} ${origUnit})  ${strVerb}`);
        break;

    // Durations:
    case "d":
    case "h":
        precisionSeeked = 99
        break
    case "min": // Time
        precisionSeeked  = magniTude(value, +1)  // precision starts 1 for 1-digit values, 2 for 2-digit values, etc.
        precisionSeeked -= (abs(value) > 12*60) ? 1 : 0 // reduce precision by 1 for values > 12 hours
        break
    case "s":
        // if (verboseAsked) { debugEnabled = true; } // enable only for testing purposes
        unitPrefixes = [ "n", "µ", "m", "" ]; // limit the normalization vector for s to µ, m, (no need for larger units for time in home automation)
        if (isWithin(value, [1, 1000])) {
            precisionSeeked = FIVEPERCENT // typical for song lengths running on Amazon Echo
        } else {
            precisionSeeked = min( ONEPERCENT, magniTude(value))// precision starts at 2 for <1 and 3 for >1000
        }
        break

    // Weights: lb, kg, g
    case "lb":
    case "lbs": // support both "lb" and "lbs" for pounds, since both might be used
        if (! siAsked) {
            precisionSeeked = (abs(value) < 400) ? magniTude(value, +1.8) : ONEPROMILLE  // more significant figures for higher weights, but reduce precision for very high weights 
            break
        }
        [ value, unit_i ] = transpose(value, 0.4536, "kg") ; // convert lbs to kg and fallthrough to kg ...
    case "kg":
        // special consideartion for body weights
        precisionSeeked = (abs(value) < 200) ? magniTude(value, +1.8) : ONEPROMILLE  // more significant figures for higher weights, but reduce precision for very high weights
        scaleSeeked = 1
        break
    case "g":
        unitPrefixes = genericUnitPrefixes
        precisionSeeked = (abs(value) < 1000) ? magniTude(value, -0.2) : ONEPROMILLE  // more significant figures for higher weights, but reduce precision for very high weights
        break

    // Pressures: Pa, hPa, mmHg, mbar, psi, inHg, bar,
    case "psi":
    case "inHg":
    case "mmHg":
        if (! siAsked) {
            precisionSeeked = ONEPROMILLE
            switch (unit_i) {
            case "psi":
                precisionSeeked += isWithin(value, [14.7, 0.7], 0.5)  // more precision around typical atmospheric pressure at sea level (14.7 psi) for weather station pressure readings in imperial units, but not for higher pressures such as car tire pressure at around 30-35 psi
                break
            case "inHg":
                precisionSeeked += isWithin(value, [30,  1.5], 0.5)  // more precision for athmospheric pressure
                break
            case "mmHg":
                precisionSeeked += isWithin(value, [760, 10], 0.5) // more precision for typical atmospheric pressure around 760 mmHg
                break
            }
            break
        }
        // convert to SI and fallthrough to hPa ...
    case "mbar":
    case "hPa": // Pressure
        switch (unit_i) {
        case "psi": // psi -> hPa
            [ value, unit_i ] = transpose(value, 68.94757, "hPa") ; // exact factor: 1 psi = 68.94757293168 hPa
            break
        case "inHg": // inHg -> hPa
            [ value, unit_i ] = transpose(value, 33.86386, "hPa") ; // exact factor: 1 inHg = 33.86388157895 hPa
            break
        case "mmHg": // mmHg -> hPa
            [ value, unit_i ] = transpose(value, 1.33322,  "hPa") ; // exact factor: 1 mmHg = 1.3332236842105263 hPa
            break
        }
        precisionSeeked = isWithin(value, [800, 1050]) ? magniTude(value, +1.5) : ONEPROMILLE // special case for typical pressure around 1000 hPa, but reduce precision for higher pressures such as car tire pressure at around 200-300 kPa (2000-3000 hPa)
        break
    case "Pa": // Pressure
        precisionSeeked = isWithin(value, [80000, 105000]) ? magniTude(value, -0.5) : ONEPROMILLE // special case for typical pressure around 100000 Pa, but reduce precision for higher pressures such as car tire pressure at around 200-300 kPa (200000-300000 Pa)
        break
    case "bar":
        precisionSeeked = isWithin(value, [0.8, 1.05]) ? magniTude(value, +3.5) : ONEPROMILLE // special case for typical pressure around 1 bar, but reduce precision for higher pressures such as car tire pressure at around 2-3 bar
        break

    // Power, Energy: Ws, Wh, VAh
    case "Wh":
    case "VAh":
        unitPrefixes = genericUnitPrefixes
        // normalizeVector = [ "n", "µ", "m", "", "k" ]; // limit the normalization vector for energy to Wh and kWh (no need for larger units for energy in home automation)
        // examples from AVM DECT energy meter: 821312 Wh
        // fallthrough to kWh to reduce precision for Wh
    case "kWh":
        precisionSeeked = magniTude(value, +1.3); // default precision is 1.3 for 1-digit values, 2.3 for 2-digit values, etc.
        if (unit_i === "Wh") precisionSeeked -= 2; // reduce precision by 2 for Wh
        precisionSeeked = max(FIVEPERCENT, precisionSeeked) // .. but at least 5%
        scaleSeeked = 1
        break

    case "J":
    case "cal": // Energy: J, varh, cal
        unitPrefixes = genericUnitPrefixes
        scaleSeeked = 0
        break

    case "rpm": // Rotation
        precisionSeeked = 3
        break
    case "Hz": // Frequency/Rotation
        unitPrefixes = genericUnitPrefixes;
        precisionSeeked = ONEPERCENT + isWithin(value, [50, 0.3], [60, 0.2], [400, 10], 0.8) // higher precision for power line frequency
        break;

    // Electric: V, A, mA, F, C, Ah, S, S/m, H, Ω
    case "A":
    case "Ah":
    case "Ω":
        unitPrefixes = genericUnitPrefixes;
    case "kA":
    case "mA":
    case "µA":
    case "nA":
    case "mAh":
    case "kAh":
    case "mS":
    case "µS":
    case "S": // Conductance
    case "S/m": // Conductance density
    case "C": // Electric charge
    case "F": // Capacitance
    case "H": // Inductance
    case "Wb": // Magnetic flux
    case "kΩ":
    case "MΩ":
    case "Gy":
    case "Sv":
        precisionSeeked = ONEPERCENT
        break

    case "W": // Power
        unitPrefixes = genericUnitPrefixes;
    case "kW":
    case "MW":
    case "dBm":
        precisionSeeked = (abs(value) < 100) ? FIVEPERCENT : ONEPERCENT
        break

    case "W/m²": // Irradiance/Intensity
        unitPrefixes = genericUnitPrefixes;
    case "µW/cm²":
        precisionSeeked = FIVEPERCENT + isWithin(value, [0, 10], +0.3) // higher precision for typical irradiance values around 10 µW/cm² (e.g. for solar radiation on a cloudy day) and around 100 µW/cm² (e.g. for solar radiation on a sunny day)
        break

    case "V": // Voltage
        unitPrefixes = genericUnitPrefixes;
        precisionSeeked = 2.7 + isWithin(value, [110, 5], [230, 20], [400, 40], +0.1)
        // consolelog(`Voltage hit: value=${value} ${unit_i} isWithin=${isWithin(value, [110, 5], [230, 20], [400, 40], +0.1)} ${roundTo(2.7+0.1, 5)}`);
        break;

    // Volume: l, m³, gal (US)
    // Volumetric flow: l/min, m³/s, m³/min, m³/h, m³/d, gal/min. :
    case "gal":
    case "gal/min":
        if (! siAsked) {
            precisionSeeked = 2.8
            break
        }
        [ value, unit_i ] = transpose(value, 3.7854, unit_i.replace("gal", "l")) ; // exact factor: 1 gal (US) = 3.785411784 liters
    case "l":
    case "l/min":
    case "m³":
    case "m³/s":
    case "m³/min":
    case "m³/h":
    case "m³/d":
        precisionSeeked = (unit_i==="l" && isWithin(value, [8, 500])) ? ONEPROMILLE : 2.8 // special case for typical volume around 8..300 liters (e.g. fuel tank)
        break

    case "mi": // Long distances
        if (siAsked) {
            [ value, unit_i ] = transpose(value, 1.609344, "km") ; // exact factor: 1 mi = 1.609344 km
        }
        // fallthrough to kilometers and use same default precision ...
    case "km":
        precisionSeeked = HALFPERCENT // use same default for mi and km
        break;

    case "mg/m³": // Typical for air quality
    case "µg/m³":
        precisionSeeked = HALFPERCENT
        break;

    case "Mbit/s": // Data rates
    case "kbit/s":
    case "bit/s":
        precisionSeeked = ONEPERCENT
        unitPrefixes = undefined; // don't normalize data rates
        break;
    case "Mbit": // Memory sizes
    case "kbit":
    case "bit":
    case "TiB":
    case "GiB":
    case "MiB":
    case "KiB":
    case "B":
        alwaysLogFinal = false; // FIXME: do not always log final (unless verboseAsked) if div with SCALING is used, to avoid log flooding with swap size logging
        precisionSeeked = ONEPERCENT
        unitPrefixes = undefined; // don't normalize memory sizes
        break;

    case "ppm":
    case "ppb":
    case "ppt":
    case "dB":
    case "mol":
    case "kat":
        precisionSeeked = HALFPERCENT
        break;

    case "percent":
        unit_i = "%"; // treat option unit "percent" as "%" too - might avoid problems with the URL encoding of "%"
    case "%": // Percent
        precisionSeeked = FIVEPERCENT + isWithin(value, [0, 5], [89, 102], +0.3) // be more precise closer to 0% or to 100%
        unitPrefixes = undefined; // don't normalize percentages
        break;

    case "°": // Angle
        precisionSeeked = 2
        unitPrefixes = undefined; // don't normalize angles
        break;

    default: // Unknown unit -> use the default precision defined above
        // precisionSeeked = 2 was set above as default
        if (unit_i !== "" && (testingAsked || verboseAsked)) {
            warnit(`Unknown input unit: "${unit_i}" ${strVerb}, value=${value} prec=${precisionSeeked}/${precisionAsked}, please contact author and/or set it with unit=${unit_i} parameter.`)
        }
        break
    }

    if (precisionAsked != null ) {
        if (precisionAsked === 0) {
            warnit(`Requested precisionAsked is 0, ignoring it.`);
        } else {
            precisionSeeked = precisionAsked; // use precisionAsked instead of any unit-specific defaults
        }
    }
    if (scaleAsked != null) {
        scaleSeeked = scaleAsked;
    }

    precisionSeeked = roundTo(precisionSeeked, 5) // needed to avoid 2.7 + 0.1 = 2.8000003. Rounding to 5 decimal places should prevent floating point issues.
    var targetPrecisionSeeked = precisionSeeked;
    finalUnit = unit_i
    value += (offsetAsked ?? 0)  // ... also apply any offset, if given

    if (unit_i === "°") {  // handle angle value more in terms of quadrants, not in the sense of significant figures, since angles are often more meaningful when rounded to 90°, 45°, 22.5° steps, etc. depending on the precisionSeeked (1, 2, 3, etc.) and not in terms of significant digits.
        value = ((value % 360) + 360) % 360 // normalize into [0,360): adding 360 handles negative angles
        // prec=1: 90°; 315    <-> 45    --> 0°, 45 <-> 135 --> 90°, 135 <-> 225 --> 180°, 225 <-> 315 --> 270°
        // prec=2: 45°: 337.5  <-> 22.5  --> 0°, 22.5  <-> 67.5  --> 45°,   67.5  <-> 112.5 --> 90°,  112.5 <-> 157.5 --> 135°
        // prec=3: 30°: 345    <-> 15    --> 0°, 15    <-> 45    --> 30°,   45    <->  75   --> 45°,   75   <-> 105   --> 90°, 105   <-> 135   --> 120°, 135   <-> 165   --> 135°, 165   <-> 195   --> 180°, 195   <-> 225   --> 210°, 225   <-> 255   --> 225°, 255   <-> 285   --> 270°, 285   <-> 315   --> 300°, 315   <-> 345   --> 315°
        // prec=4:22.5: 348.75 <-> 11.25 --> 0°, 11.25 <-> 33.75 --> 22.5°, 33.75 <-> 56.25 --> 45°, 56.25 <-> 78.75 --> 67.5°
        // prec=5: 15°: 352.5  <-> 7.5   --> 0°, 7.5   <-> 22.5  --> 15°, 22.5  <-> 37.5  --> 30°, 37.5  <-> 52.5  --> 45°, 52.5  <-> 67.5  --> 60°, 67.5  <-> 82.5  --> 75°, 82.5  <-> 97.5 --> 90°, ... and so on, with steps of (180/prec)° and borders at (360/(2*prec))° + n*(360/prec)°
        // prec=6:11,25°: 354.375 <-> 5.625 --> 0°, 5.625 <-> 16.875 --> 11.25°, 16.875 <-> 28.125 --> 22.5°, 28.125 <-> 39.375 --> 33.75°, ... and so on, with steps of (180/prec)° and borders at (360/(2*prec))° + n*(360/prec)°
        // therefore: prec=1 -> 90° steps, prec=2 -> 45° steps, prec=3 -> 22.5° steps
        // for prec==1 need to divide by 90, round, and multiply by 90, but add
        // angledivider = 90 / floor(precisionSeeked)
        angledivider = [ 90, 45, 30, 22.5, 15, 11.25 ][floor(precisionSeeked) - 1] ?? 45 // fallback to 22.5 steps for precisionSeeked > 5
        var v = roundTo(value / angledivider, 5) // round to 5 decimal places to avoid rounding errors
        if (precisionSeeked < 5) { // wind rose/for larger sectors chosen differently....
            newValue = floor(v+0.5) * angledivider  // good for odd precisionSeeked (1=90°), more compass-like (2=45°)
        } else {
            newValue = floor(  v  ) * angledivider  +  (angledivider/2)   // good for even precisionSeeked (2=45°, 4=22.5°)
        }
        newValue = newValue % 360 // normalize into range [0..360)
        debugit(`Angle: v=${v}, value=${value}° (${compassAngleToDir(value,precisionSeeked)}), newValue=${newValue}° (${compassAngleToDir(newValue,precisionSeeked)}), anglediv=${angledivider} ${strVerb}`);
    } else if (value === 0) {
        alwaysLogFinal = false || verboseAsked; // avoid logging final zero values,  unless verboseAsked
    } else { // all other units: round to significant figures with the given precisionSeeked, and apply any scaling if needed
        if (divAsked != null) {
            value /= divAsked // apply the divisor if given
            logit(`DIV: divAsked=${divAsked} for new value=${value} unit=${unit_i} ${strVerb}`);
        }
        if (multAsked != null) {
            value *= multAsked // apply the multiplier if given
            logit(`MULT: multAsked=${multAsked} for new value=${value} unit=${unit_i} ${strVerb}`);
        }

        // Now take care of all the significant figure rounding...
        var [precisionSeeked, frac] = splitScaleValue(precisionSeeked) // split any fractional part from the precisionSeeked (1 digit)
        var magnit = magniTude(value)  // magnitude is 0 for 1-9, 1 for 10-99, 2 for 100-999 and so on....
        var power = Math.pow(10, magnit - precisionSeeked + 1) // when prec=1: power is 100 for prec=2 and value=349 (magnit=2)
        debugit(`=== value=${value} ${unit_i} Seeked=${precisionSeeked} AND Found=${precisionFound}, magnit=${magnit} power=${power} frac=${frac} ${strVerb}`);
        // ... and do the magic for the fractional part in precisionSeeked:
        if (frac > 0 && precisionFound > precisionSeeked) {
            if (frac === 0.1) {
                warnit(`Requested precision ${precisionSeeked} + 0.1, same as prec=${precisionSeeked + 1}, consider using integer precisions only.`);
            }            
            debugit(` == Rounding value=${value} with frac=${frac}, precisionSeeked=${precisionSeeked} ${strVerb}`);
            let mult = clamp(Math.ceil(1/frac), [2, 5]) // mult is 2 for frac=0.5, 3 for frac=0.4, 4 for frac=0.3, 5 for frac=0.2
            let sign = Math.sign(value)
            newValue = sign * floor(abs(value) / power) * power // cut off to the integer part with the given precision
            let normalizedvalue = sign * (value-newValue) / Math.pow(10, magnit - precisionSeeked)  // normalize the value to be between 1 and 10
            debugit(` normalizedvalue=${normalizedvalue} (value=${value}, newValue=${newValue}, sign=${sign})`);

            // for a certain mult: iterate the borders to find the right border for the normalized value, and then use the corresponding middle value as the rounded part to add to the newValue:
            let borders = BORDERS0[mult]; // initialize borders for values for main figures equal to 0
            let middles = MIDDLES0[mult];
            if (abs(newValue) < 1e-10) { // treat any rounding errors as 0
                // Distinguish the case where the main rounded part is effectively zero from non-zero values.
                debugit(` newValue=${newValue}: Choose MIDDLES0`);
            } else {
                borders = BORDERS1[mult];  // for precision fractions with a main value different from 0
                middles = MIDDLES1[mult];
                debugit(` newValue=${newValue}: Choose MIDDLES1`);
            }
            let i = 0;
            debugit(` Finding rounded value for normalizedvalue=${normalizedvalue}, mult=${mult} (frac=${frac}) in borders=${borders}`);
            while (i < borders.length && normalizedvalue > borders[i]) 
                i++;
            const rounded = middles[i]
            newValue = newValue + sign * rounded * Math.pow(10, magnit - precisionSeeked) // add the rounded part to the newValue
            newValue = Number(newValue.toPrecision(precisionSeeked+1))
            debugit(` ROUNDED=${rounded} for newValue=${newValue} BECAUSE border[${i}]=${i === 0 ? 0 : borders[i-1]} for mult=${mult} (frac=${frac}) i=${i}`);
        } else {
            newValue = Number(value.toPrecision(precisionSeeked)) // use toPrecision to round to the given number of significant figures, but convert back to Number to avoid trailing zeros
            // debugit(` No rounding, just toPrecision(${value},${precisionSeeked}) > newValue=${newValue} ${strVerb}`);
        }

        // might scale the unit by changing the dimension...
        // FIXME: really scale 1276540 Wh to 1.2765 MWh?  Wouldn't 1276.5 kWh be nicer for readability?
        let scale3 = Math.trunc(magniTude(newValue)/3)
        if (scale3 !== 0 && unitPrefixes != null) { // magnitude could even be 1 larger...
            // convert number to scientific notation and back to avoid signalling unneeded significant figures
            // only normalize with multiples of 3 and use the normalizeVector if given:
            // debugEnabled = true; // FIXME: enable only for testing purposes

            let magnit = magniTude(newValue)
            let baseUnitIndex = unitPrefixes.indexOf("") // find the index of the (empty) base unit in the normalizeVector
            if (unitPrefixes[baseUnitIndex + scale3]) {
                // adapt value and unit dimension according to the amount of scale3
                newValue = newValue / Math.pow(10, 3*scale3)
                finalUnit = unitPrefixes[baseUnitIndex + scale3] + unit_i
                if (scaleSeeked != null) { // covers the case where scaleSeeked is 0 or undefined
                    scaleSeeked += 3*scale3 // adapt scaleSeeked according to the amount of scaling applied, since the number is now smaller and needs less decimals
                }
                debugit(` NORMALIZE: scale3=${scale3} * 3 applied to magnit=${magnit}: newValue=${newValue} finalUnit=${finalUnit}`);
                scale3=0 // since we chose the fitting unit
            } else {
                debugit(` NORMALIZE SKIPPED: scale3=${scale3}*3 NOT applied to magnit=${magnit}: no entry in normalizeVector=${unitPrefixes}`);

                let movedecimals = min( precisionFound, Math.ceil(precisionSeeked+frac)) - 0
                newValue = newValue.toExponential( movedecimals )  // newValue as string in scientific notation with precisionFound significant figures
                
                // NO MORE calculations possible here >> BE CAREFUL, since newValue now becomes a STRING!
                // remove unnecessary stuff in the fractional part:
                newValue = newValue.replace(/\.0+e/, "e") // trailing .0+ before the 'e'
                newValue = newValue.replace(/(\.\d*?[1-9])0+e/, "$1e") // trailing zeros before the 'e'
                newValue = newValue.replace(/[eE]\+0$/, "") // any e+0 at the end
                debugit(` CUT figures: magnitude=${magnit}, precisionSeeked=${precisionSeeked} > newValue=${newValue} finalUnit=${finalUnit}`);
                scaleSeeked = null;  // Ignore any scaleSeeked, since we already cut the number to the right amount of significant figures
                // do not apply any more scaling, since newValue is now a string with the right number of significant figures, and scaling would add unneeded zeros again
            }
        } else {
            // debugit(` No cutting of extra significant figures: precisionFound=${precisionFound} >= precisionSeeked=${precisionSeeked}`);
            newValue += testingAsked ? Number.EPSILON : 0 // add a very small value to avoid rounding errors in the next step
            if (flickerEnabled) {
                const denom = (Number.isFinite(power) && power !== 0) ? power : 1;
                const flickerAmount = (round(Math.random() * 100) / 100) * 0.0001 / denom;
                logit(`FLICKER: denom=${denom}, flickerAmount=${flickerAmount}: origValue=${fmt(origValue, origUnit)} -> newValue=${fmt(newValue, unit_i)} ${strVerb}`);
                newValue += flickerAmount;
            }
        }
        if (scaleSeeked != null) {
            // logit(`SCALE: roundTo(newValue=${newValue}, scaleSeeked=${scaleSeeked})`);
            newValue = roundTo(newValue, scaleSeeked)
            // logit(`SCALE: scaleSeeked=${scaleSeeked} resulted in newValue=${newValue} unit=${unit_i} ${strVerb}`);
        }
        debugit(` newValue=${newValue}, precisionSeeked=${precisionSeeked}  ${strVerb}`);
    }

    var logMsg = `${input} (${precisionFound}) > ${parseFloat(value.toPrecision(8))} ${unit_i} > ${fmt(newValue, finalUnit)} (${targetPrecisionSeeked}${scaleSeeked===undefined ? "" : " sc=" + scaleSeeked})  ${strVerb}`;
    if ( !logit(`FINAL: ${logMsg}`) && alwaysLogFinal) {
        consolelog(`SIGNF: ${logMsg} ${dryRunAsked ? "(DRYRUN)" : ""}`);
    }

    if (dryRunAsked || (testingAsked && new Date().getSeconds() % 5 === 0)) { // at every full 5 seconds, return the original value for testing purposes
        const out = fmt(origValue, origUnit);
        logit(`RETURNing origValue: ${out}`);
        return out;
    }
    return fmt(newValue, finalUnit);
}

// -------------------------
// helper functions
// -------------------------

// suffixDiff(): return the differing suffixes of two strings a and b
function suffixDiff(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");

  let pos = 0;
  while (pos < min(a.length, b.length) && a[pos] === b[pos]) pos++; // find position of first differing character

  return { aSuffix: a.slice(pos), bSuffix: b.slice(pos) };
}

// isWithin(): check if value is within any of the given ranges - ranges can be given as [min, max) or as [center, halfwidth]
// if last element of the parameter list is not an array, it shall be the return value for true and 0 for false.
// A range will be interpreted as [0, range) for positive values and (range, 0] for negative values
function isWithin(value, ...ranges) {
    if (!Number.isFinite(value)) return false;
    let returnValue = null; // default return value for true if no numeric return value is given in the ranges

    if (ranges.length > 0 && !Array.isArray(ranges[ranges.length - 1])) {
        returnValue = ranges.pop(); // use last element as return value for true and 0 for false
    }
    const hasMatch = ranges.some(([a, b]) => {
        if (a <= b) { // default return value is true for values in the range [min, max) and false otherwise
            return (a <= value && value < b)
        } else {
            return (a-b <= value && value <= a+b); // range is [center - halfwidth, center + halfwidth]
        }
    });
    return returnValue === null ? hasMatch : (hasMatch ? returnValue : 0);
}

// clamp(): clamp a number x to the range [min, max]
function clamp(x, [minVal, maxVal]) {
    return min(maxVal, max(minVal, x))
}

// roundTo(): round a number x to a given number of decimals (return a number)
function roundTo(x, decimals) {
    const factor = 10 ** decimals;
    return round(x * factor) / factor; // if necessary, add NUMBER.EPSILON to x
}

// magniTude(): return the order magnitude of any number x (-1 for 0.1..0.9, 0 for 1..9, 1 for 10..99, 2 for 100..999, etc.)
// second, optional parameter a to be added to result before returning
function magniTude(x, a = 0) {
    if (x === 0) return a;
    return floor(Math.log10(abs(x))) + a;
}

// isTrue(): interpret a given string as boolean true/false, and return the boolean value
function isTrue(s) {
    if (s === null || s === undefined) return false
    if (s === true || s === false) return s   // handle booleans directly
    s = String(s ?? "").toLowerCase().trim()
    return (s === "t" || s === "true" || s === "yes" || s === "y" || s === "on" || s === "1")
}

// consolelog(): log to console.log if available, otherwise use JS print()
function consolelog(s) {
    const str = `${ident ? ident + ": " : ""}` + String(s ?? "").replace(/\s+/g, ' '); // normalize spaces and add any id to the log message
    if (typeof console !== "undefined" && console && typeof console.log === "function") {
        console.log(str);
    } else if (typeof print === "function") {
        print(`${scriptname ?? "significant.js: "}${str}`);
    }
}

// logit(): log only, if verbose or debug is enabled
function logit(s) {
    const now  = new Date()
    const hour = now.getHours()
    if (hour === 28 || verboseAsked || debugEnabled || testingAsked) { // ... or always at a certain hour to ease retrospective debugging
        consolelog(`${s}`)
        return true;
    } else {
        return false;
    }
 }

function logitmore(s) { // increased logging
    if (verboseIncreased || testingAsked) {
        logit(s)
    }
 }

// warnit(): log a warning message
function warnit(s) {
    consolelog(`WARNING: ` + s)
 }

function debugit(s) {
    // consolelog(`significant.js: ${s} (debugEnabled=${debugEnabled})`);
    if (debugEnabled) {
        consolelog(`${s}`)
    }
 }

function testit(s) {
    if (testingAsked) {
        consolelog(`${s}`)
    }
 }

// numOrUndef(): parse a number, then return it or undefined if it is not a valid finite number
function numOrUndef(x) {
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : undefined;
}

// parseScaledNumber(): parse "<number><suffix>" where suffix is a metric/binary shorthand like k, K, M, Mi, ...
function parseScaledNumber(raw, label) {
    const text = String(raw ?? "").trim();
    const matches = text.match(/^([+-]?\d+(?:\.\d+)?)([A-Za-z]*)$/);
    let parsed;

    if (matches) {
        const amount = parseFloat(matches[1]);
        const typea = matches[2];

        if (!Object.prototype.hasOwnProperty.call(SCALE_AMOUNT_MAP, typea)) {
            warnit(`UNKNOWN ${label} unit: "${typea}"; ignoring ${raw}.`);
            parsed = undefined;
        } else {
            parsed = amount * SCALE_AMOUNT_MAP[typea];
            logit(`Parsed: ${label} amount=${amount} typea="${typea}" => ${label}Asked=${parsed}`);
        }
    } else {
        parsed = numOrUndef(raw);
        if (parsed == null) {
            warnit(`Bad ${label} format: "${raw}"; ignoring it.`);
            return undefined; // early return — avoids double-warning from the guard below
        }
    }

    if (parsed === 0 && label === "div") {
        warnit(`INVALID ${String(label).toUpperCase()} value 0; ignoring it.`);
        return undefined;
    }

    return parsed;
}

// setDefault(): return defaultValue if value is undefined; if defaultValue is a function, call it with the value
function setDefault(value, defaultValue) {
    return typeof defaultValue === 'function' ?  defaultValue(value)  :  (value !== undefined) ? value : defaultValue;
}

// splitScaleValue(): split a scale value into its integer and fractional part, 
// and mirror the fractional part at 0.5 if it islarger than 0.5 to get nicer rounding steps (e.g. 1, 2, 5, 10) for the fractional part than for values close to 1 (e.g. 0.8 with steps 1, 4, 6, 8)
function splitScaleValue(scaleval) {
    var frac = roundTo(scaleval - floor(scaleval), 1)
    frac = frac > 0.5 ? roundTo(1 - frac, 1) : frac; // mirror the fractional part at 0.5 if larger
    scaleval = floor(scaleval)
    return [ scaleval, frac  ];
}

// compassAngleToDir(): convert degrees to compass direction: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW
function compassAngleToDir(deg, scale = 2) {
    // scale: 1=4 directions, 2=8 directions, 3=16 directions, 4=32 directions
    const directions = [
        ["N", "E", "S", "W"],  // scale=1
        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], // scale=2
        ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"], // scale=3
        ["N", "NbE", "NNE", "NEbN", "NE", "NEbE", "ENE", "EbN", // scale=4
         "E", "EbS", "ESE", "SEbE", "SE", "SEbS", "SSE", "SbE",
         "S", "SbW", "SSW", "SWbS", "SW", "SWbW", "WSW", "WbS",
         "W", "WbN", "WNW", "NWbW", "NW", "NWbN", "NNW", "NbW"]
    ];

    scale = clamp(scale ?? 1, [1, 4]);
    const dirs = directions[scale - 1];
    const step = 360 / dirs.length;

    deg = ((deg % 360) + 360) % 360;
    const index = floor((deg + step / 2) / step) % dirs.length;
    return dirs[index];
}

// -----------------------------------------------------------------------------------------
// openHAB wrapper: preserves transform usage; also lets us pass opts either via *query*, or also as *injected vars*
// -----------------------------------------------------------------------------------------
(function () {
  // Try to parse as query options (e.g. significant.js?precision=1.5&scale=1)
  var query = (typeof __scriptName === 'string' && __scriptName.split('?')[1]) || '';
  var optsFromQuery = {};
  if (query) {
    scriptname = `${__scriptName.split('?')[1]}: `; // for logging
    consolelog(scriptname + __scriptName.split('?')[0])
    query.split('&').forEach(p => {
      var [k, v] = p.split('=');
      if (k) optsFromQuery[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }

  // Pick up any injected globals (some transform profiles define them directly)
  var injected = {};
  var option_keys = ['precision', 'prec', 'scale', 'unit', 'div', 'mult', 'offset', 'skew', 'si', 'verbose', 'testing', 'flicker', 'dryRun', 'id', 'ident']
  option_keys.forEach(k => {
    if (this[k] != null) injected[k] = this[k];
    // if (this[k] != undefined) consolelog(`PARAM: ${k} ===> ${this[k]}`);
    this[k] = undefined; // reset the injected globals to undefined to avoid interference with next invocation
  });

  // `input` is injected by the openHAB transform runtime
  var opts = Object.assign({}, optsFromQuery, injected);

  // consolelog(`significant.js: input=${input}, opts=${JSON.stringify(opts)}`);
  return significantTransformed(input, opts);
})();

// -----------------------------------------------------------------------------------------
// Export for Node.js unit testing (sometimes ignored in openHAB)
// -----------------------------------------------------------------------------------------
// should be commented out during openHAB use (transformation script might return an object otherwise)
/// if (typeof module !== "undefined" && module && typeof module.exports !== "undefined") {
///  module.exports = { significantTransformed };
/// }