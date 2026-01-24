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
// significant figures in the SI unit system, plus some other features. It supports all known OpenHAB unit types.
// Default of significant figures is 2, but is also modified depending on the unit type (e.g. temperature, speed, frequency, power, pressure, etc.)
// It also foresees slightly higher values for significance in special cases, e.g. values around 50Hz, 
// or a temperature close to the freezing point etc.

// Transformation script parameters (all are optional):
// "precision" : a given number of significant figures to round to (used to override the unit specific defaults), use like ...?precision=3
// "scale" : a number of decimal places to round to: ...?scale=0
// "div" : a divisor to apply to the input value before rounding: ...?div=10 oder 1M or 1000 (useful since OpenHAB only supports one transformation at a time)
// "mult" : a multiplier to apply to the input value before rounding: ...?mult=1K oder 1M oder 1000 (useful since OpenHAB only supports one transformation at a time)
// "unit" : a unit to force the output to: ...?unit=°C (unit=. will remove any unit passed in the input)
// "verbose" : one of {t|true|1|yes|y||false|no} to enable or disable logging: ...?verbose=true
// "testing" : {t|true|1|yes|y||false|no} to enable or disable testing of new features: ...?testing=y
// "skew" : a number to add to the input value before rounding,: ...?skew=0.5 (e.g. for 0.5 significant figures)

// Defaults and global variables:
var verboseAsked     = false; // if default set to true here, script will always log some details about the transformation
var testingAsked     = false; // if default set to true here, script will always support be set to "testing of new features"
var debugEnabled     = false; // if default set to true here, script will always log debug messages
var flickerEnabled   = false; // if default set to true here, output will always have a tiny, random fraction added to distinguish it from the previous value. This helps debugging
var verboseIncreased = false; // if true and verbose is true, then log even more details
var alwaysLogFinal   = false; // if set to true, always log the final output of the transformation (set to true for first timers!)
var debugFinal       = true; // if set to true, log the final output (depending on special cases)

var id = "";                 // an optional id string to identify the invocation in the log messages
var scriptname = "significant.js: "; // will hold the script name for logging
var normalizeVectorGeneric = Object.freeze(["µ", "m", "", "k", "M", "G", "T", "P", "E"]); // generic prefixes for normalization

// Frequently used Math functions:
var abs   = Math.abs;
var min   = Math.min;
var max   = Math.max;
var floor = Math.floor;
var round = Math.round;

// Lookup tables for "nice" borders and middle values for significant figure rounding with fractional precisions:
// when frac=0.5/mult=2 would be 100, 500, 1000.                 OK: 100, 500, 1000           with borders at 300, 700
// when frac=0.4/mult=3 would be 100, 333, 667, 1000.        Better: 100, 300, 600, 1000      with borders at 200, 450, 800
// when frac=0.3/mult=4 would be 100, 250, 500, 750, 1000.   Better: 100, 200, 500, 700, 1000 with borders at 150, 350, 600, 850
// when frac=0.2/mult=5 would be 100, 200, 400, 600, 800, 1000   OK: 100, 200, 400, 600, 800, 1000   with borders at 150, 300, 500, 700, 900
var BORDERS1 = Object.freeze({ // for different precision fractions
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
var BORDERS0 = Object.freeze({ // for precision fractions with a main value of 0
  2: [3, 7.5],
  3: [2, 4.5, 8],
  4: [1.5, 3.5, 6, 8.5],
  5: [1.5, 3,  5, 7, 9]
});
var MIDDLES0 = Object.freeze({
  2: [1, 5, 10],
  3: [1, 3, 6, 10],
  4: [1, 2, 5, 7, 10],
  5: [1, 2, 4, 6, 8, 10]
});

/* All the following openHAB units should be understood: https://www.openhab.org/docs/concepts/units-of-measurement.html (uunits):
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

// Now the main function called by OpenHAB when the transformation is invoked:
function significantTransform(i, opts = {}) {

    // map the given options (for unit testing or wrapper use) to special variables:
    var verbose   = opts.verbose
    var testing   = opts.testing;
    var prec      = opts.prec ?? opts.precision;
    var precision = opts.precision ?? prec;
    var scale     = opts.scale
    var si        = opts.si;
    var unit      = opts.unit
    var div       = opts.div;
    var mult      = opts.mult;
    var skew      = opts.skew;
    var flicker   = opts.flicker;
    // var normalize = false // opts.normalize; // normalization only on demand not yet implemented

    let input     = i.trim()  // store the incoming value (and optionally unit name) to be transformed
    let unit_i    = "" // will carry the unit name in the input i (if any)
    let strVerb   = "" // will carry the message string for logging
    let matches   = null // will be used for regex matches
    id            = opts.id ?? ""; // an optional id string to identify the invocation in the log messages

    // reset on each invocation (prevents cross-call leakage) - FIXME: is this still needed in openHAB 5?
    verboseAsked = false;
    testingAsked = false;
    debugEnabled = false;
    flickerEnabled = false;
    verboseIncreased = false;


    // more vars to carry values of the injected parameters:
    var precisionAsked  = undefined // will carry the requested number of significant figures
    var skewAsked  = undefined  // will carry a requested skew to be applied to the input value after div'iding and before rounding
    var divAsked   = undefined  // a divisor to be applied to the input value before skew adding and before rounding
    var multAsked  = undefined  // a multiplier to be applied to the input value before skew adding and before rounding
    var unitAsked  = undefined  // will carry the requested unit name
    var scaleAsked = undefined  // will carry the requested number of decimal places
    var siAsked    = true  // will carry true if units shall be transformed to SI units (default=true), e.g. °C instead of °F

    // Defaults:
    var scaleSeeked = undefined
    var angledivider = 1 // for rounding angles to 90°, 45°, 22.5° steps
    var precisionSeeked = 2  // 2 is the default for significant figures to round to, if no or unknown unit given
    let precisionFound = 0.5 // will hold the number of significant figures found in the input value, use 0.5 in case of no meaningful figures (also for "0.0")
    let normalizeVector = [ ]; // will hold an array of units for normalization if needed, set to undefined if normalization is to be suppressed

    // function for String(str)[0]
    const l = v => String(v)[0];  //return first character of the string passed in
    const trans = (v, factor, newUnit) => [v * factor, newUnit];
    const fmt = (v, u) => String(v) + (u ? " " + u : "");

    // debugit(`input=${input}`);

    // Now parse all invocation parameters from the script call:
    // verbose, testing, si, prec, precision, scale, div, mult, unit, flicker etc. into their corresponding xyzAsked variables.

    if (verbose != null) {
        verboseAsked = !!setDefault(verbose,  isTrue)
        // add t or f to strVerb depending on verboseAsked
        strVerb += ` VERB=${l(verboseAsked)}`;
        // debugEnabled = verboseAsked; // only used TEMPORARELY for testing purposes
    }
    if (testing != null) {
        testingAsked = !!setDefault(testing,  isTrue)
        // if (testingAsked) { verboseAsked = true ; }// if testing is asked, then also enable verbose logging
        strVerb += ` TEST=${l(testingAsked)}`;
    }
    if (si != null) {
        siAsked = !!setDefault(si, isTrue)
        strVerb += ` SI=${l(siAsked)}`
    }
    if (precision != null || prec != null) { // alias prec to precision for backward compatibility
        precisionAsked = numOrUndef(precision ?? prec)
        strVerb += ` PREC=${precisionAsked}`;
        if (precisionAsked === 0.7) {
            // debugEnabled = true; // only for testing purposes
        }
    }
    if (scale != null) {
        scaleAsked     = numOrUndef(scale)
        strVerb += ` SCALE=${scaleAsked}`;
    }
    if (skew != null) {
        skewAsked      = numOrUndef(skew)
        strVerb += ` SKEW=${skewAsked}`;
    }
    if (div != null) {
        unitAsked = "" // eliminate unit when div is used, since div implies a unit change

        // split div and check for e.g. "1k", "1K", "1M" and "7G" and "5T" and "8P" and ... and expand them to the corresponding number of bytes
        // parse div: "<number><suffix>"
        matches = String(div).trim().match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/) 
        if (matches) { // does div look like a number with an optional suffix?
            const amount = parseFloat(matches[1]);
            const typea  = matches[2];

            const SCALE_MAP = { "": 1, k: 1e3,  K: 1024,  ki: 1024,  M: 1e6, Mi: 1024 ** 2,
                G: 1e9, Gi: 1024 ** 3,  T: 1e12, Ti: 1024 ** 4, P: 1e15, Pi: 1024 ** 5,
            };

            if (!Number.isFinite(amount)) {
                warnit(`BAD div amount: "${matches[1]}"`);
                divAsked = undefined;
            } else if (!Object.prototype.hasOwnProperty.call(SCALE_MAP, typea)) {
                warnit(`UNKNOWN div unit: "${typea}"`);
                // decide: either ignore the suffix or reject entirely.
                // Here we *ignore suffix* but still use the numeric amount:
                divAsked = amount; // or set undefined to reject
            } else {
                divAsked = amount * SCALE_MAP[typea];
                // verboseAsked = debugEnabled = true; // FIXME: only for testing purposes
                logit(`Parsed div: amount=${amount} typea="${typea}" => divAsked=${divAsked}`);
            }

            // guard zero (and NaN), regardless of suffix outcome
            if (!Number.isFinite(divAsked) || divAsked === 0) {
                warnit(`INVALID DIV value or 0; ignoring it to avoid division by zero.`);
                divAsked = undefined;
            }
        } else {
            logit(`Bad div format: "${div}"`);
        }
        strVerb += ` div=${div} DIV=${divAsked}`;
    }
    if (mult != null) {
        // debugit(` MULT=${mult}`);
        multAsked = numOrUndef(mult)
        strVerb += ` MULT=${multAsked}`
    }
    if (unit != null) {
        // debugit(` UNIT=${unit}`);
        unitAsked = unit
        strVerb += ` UNIT=${unitAsked}`
    }
    if (flicker != null) {
        // debugit(` FLICKER=${flicker}`);
        flickerEnabled=!!setDefault(flicker, isTrue)
        strVerb += ` FLICK=${l(flickerEnabled)}`;
    }

    // input = "0.0123400" ; // keep some strange corner cases for testing purposes
    // input = "04.0"
    // input = ".09870"
    // input = "-0.19870"

    // If the input looks like a DATE-TIME string: scale the time part to a number of significant time parts (days, hours, minutes, seconds, ...):
    // e.g. "2025-09-27T14:16:00.000+0200"
    const dtregex = /^(\d{4})-([01]\d)-([0123]\d)(T| )([012]\d):([0-5]\d):([0-5]\d)(\.\d{3})([+-]\d{4})$/ // e.g. 2024-10-13T02:30:03.000+0200   
    matches = input.match(dtregex);
    if (matches) { // input is a timestamp with a numeric offset
        const [ , yy, mo, dd, timesep, hh, mm, ss, dotms, tzoffset ] = matches // slice the matches into variables
        const ms = parseInt(dotms.slice(1), 10)  // ".123" -> 123

        // parse the offset +HHMM / -HHMM to minutes
        const offsetMinutes = (tzoffset[0] === '-' ? -1 : 1) * (parseInt(tzoffset.slice(1, 3), 10) * 60 + parseInt(tzoffset.slice(3, 5), 10))

        // default time-date scale levels in significant.js: 0=days, 1=hours, 2=minutes, 3=seconds, 4=milliseconds
        scaleAsked = clamp(scaleAsked ?? 3, [0, 4])  // clamp scaleAsked to [0..4] with a default scale of 3

        const localUtcMs = Date.UTC(+yy, +mo - 1, +dd, +hh, +mm, +ss, +ms) // local wall time -> UTC epoch ms (treat tzoffset as a fixed-offset zone)
        const utcMs      = localUtcMs - offsetMinutes * 60 * 1000
        const unitMs     = [24*3600e3, 3600e3, 60e3, 1e3, 1][scaleAsked] // choose rounding unit: day, hour, minute, second, millisecond
        const roundedUtc = round(utcMs / unitMs) * unitMs // round in UTC, not in local wall time
        const localMs    = roundedUtc + offsetMinutes * 60 * 1000 // convert back to local wall time with the same fixed offset
        const dLoc = new Date(localMs)
        // now read components using UTC getters (we already applied the offset):
        let output =                   `${dLoc.getUTCFullYear()    }` + "-"
            +                          `${dLoc.getUTCMonth() + 1   }`.padStart(2, "0")  + "-"
            +                          `${dLoc.getUTCDate()        }`.padStart(2, "0")  + timesep
            + (scaleAsked < 1 ? "00" : `${dLoc.getUTCHours()       }`.padStart(2, "0")) + ":"
            + (scaleAsked < 2 ? "00" : `${dLoc.getUTCMinutes()     }`.padStart(2, "0")) + ":"
            + (scaleAsked < 3 ? "00" : `${dLoc.getUTCSeconds()     }`.padStart(2, "0"))
            // + (scaleAsked < 4 ? ""  : `.${dLoc.getUTCMilliseconds()}`.padStart(3, "0"))
            + (scaleAsked < 4 ? "" : "." + String(dLoc.getUTCMilliseconds()).padStart(3, "0"))
            + tzoffset;

        if (input !== output || alwaysLogFinal || debugFinal || verboseAsked) {
            // log only differences between input and output date-time strings and differing string suffixes of input and output
            logit(`DATE-TIME: ${input} -> ${output}: ${suffixDiff(input, output).aSuffix}  ${strVerb}`);
        }
        return output // early return with the transformed date-time string
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
        if (! matches) { // special case for ranges like "0-1", "1-2", "2-3"
            logit(`FINAL: "${input}" is NaN.`)
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

        if (value>777 && value<778 && value===6.777) { // debug trigger value
            debugEnabled = true; // only for testing purposes
            verboseAsked = true;
            verboseIncreased = true;
            logit(`DEBUG: 777 is hit. Setting for Debug.  ${strVerb}`);
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
            precisionSeeked = (abs(value)<3) ? 1.3 : isWithin(value, [190, 215]) ? 3 : 2.5
            break
        }
        [value, unit_i] = trans(value-32, 5/9, "°C") ; // convert and fallthrough to °C ...
    case "°C":
        precisionSeeked = (abs(value) < 1) ? 0.7 : (abs(value) < 10) ? 1.5 : 2.5
        break;
    case "K":
        precisionSeeked  = max(-1, magniTude(value)) // more significant figures for higher temperatures
        precisionSeeked  = clamp(precisionSeeked, [1, 3]) // clamp it to 1..3
        precisionSeeked += isWithin(value, [0, 10], [273, 2], [273+98, 3]) ? 0.7 : 0 // increase prec for special cases around water freezing and boiling point
        logit(`Kelvin hit: value=${value} ${unit_i} precSeeked=${precisionSeeked} ${strVerb}`);
        break;

    // Speed
    case "kn":
        [ value, unit_i ] = trans(value, 1.15078, "mph"); // convert kn to mph
    case "mph":
        precisionSeeked = (abs(value) < 10) ? 1.5 : (abs(value) < 30) ? 1.3 : 1.5
        scaleSeeked = 0
        if (siAsked) {
            [ value, unit_i ] = trans(value, 1.609344, "km/h") ; // convert mph to km/h (prefer km/h over m/s for typical weather station wind speed)
        }
        break
    case "m/s":
        [ value, unit_i ] = trans(value, 3.6, "km/h") ; // fallthrough to km/h ...
    case "km/h":
        precisionSeeked = (abs(value) < 5) ? 1 : (abs(value) < 20) ? 1.5 : 2
        break;
    case "in/h":
        if (siAsked) {
            [ value, unit_i ] = trans(value, 25.4, "mm/h") ; // convert in/h to mm/h
        }
        break;

    // Length, distance, and precipitation
    case "yd":
        [ value, unit_i ] = trans(value, 3, "ft") ; // convert yd to ft
    case "ft":
        [ value, unit_i ] = trans(value, 12, "in") ; // fallthrough to in ...
    case "in":
        if (! siAsked) {
            precisionSeeked = 2
            break
        }
        [ value, unit_i ] = trans(value, 2.54, "cm") ; // fallthrough to cm ...
    case "cm": // typical for precipitation
        [ value, unit_i ] = trans(value, 10, "mm") ; // fallthrough to mm ...
    case "mm": // typical for precipitation
        precisionSeeked = isWithin(value, [0, 80]) ? 1.7 : 2 // decrease precision for less than 80mm, probably precipitation
        // logit(`mm hit: value=${value} ${unit_i} (ORIG: ${origValue} ${origUnit})  ${strVerb}`);
        break;
    case "m": // typical for total precipitation
        precisionSeeked = isWithin(value, [0, 0.08]) ? 1.5 : 3 // decrease precision for less than 0.08m, probably precipitation
        normalizeVector = [ "µ", "m", "", "k" ];
        logit(`${unit_i} hit: value=${value} ${unit_i} (ORIG: ${origValue} ${origUnit})  ${strVerb}`);
        break;

    // Durations:
    case "h":
        precisionSeeked = 99
        break
    case "min": // Time
        precisionSeeked = magniTude(value) + 1 // precision starts 1 for 1-digit values, 2 for 2-digit values, etc.
        precisionSeeked -= abs(value) > 12*60 ? 1 : 0 // reduce precision by 1 for values > 12 hours
        break
    case "s":
        // if (verboseAsked) { debugEnabled = true; } // FIXME: only for testing purposes
        normalizeVector = [ "µ", "m", "" ];
        if (abs(value)<1000) {
            precisionSeeked = 1.5
        } else {
            precisionSeeked = 99
            scaleSeeked = -2
        }
        break

    // Weights:
    case "lbs":
        if (! siAsked) {
            precisionSeeked = (abs(value) < 10) ? 1.8 : (abs(value) < 100) ? 2.8 : (abs(value) < 400) ? 3.8 : 3
            break
        }
        [ value, unit_i ] = trans(value, 0.4536, "kg") ; // convert lbs to kg and fallthrough to kg ...
    case "kg":    // Weight
        const av =  abs(value)
        precisionSeeked = (av<10) ? 1.8 : (av<100) ? 2.8 : (av<200) ? 3.8 : 3
        scaleSeeked = 1
        break

    // Pressure units: Pa, hPa, mmHg, mbar, psi, inHg, bar,
    case "psi":
    case "inHg":
    case "mmHg":
        if (! siAsked) {
            switch (unit_i) {
            case "psi":
                precisionSeeked = isWithin(value, [14.7, 0.7]) ? 3.5 : 3 // special case for typical atmospheric pressure around 14.7 psi
                break
            case "inHg":
                precisionSeeked = isWithin(value, [30, 1.5]) ? 3.5 : 3 // special case for typical pressure around 30 inHg
                break
            case "mmHg":
                precisionSeeked = isWithin(value, [750, 770]) ? 3.5 : 3 // special case for typical pressure around 760 mmHg
                break
            default:
                precisionSeeked = 3
                break
            }
            break
        }
        // convert to SI and fallthrough to hPa ...
    case "mbar":
    case "hPa": // Pressure
        switch (unit_i) {
        case "psi": // psi -> hPa
            [ value, unit_i ] = trans(value, 68.94757, "hPa") ; // exact factor: 1 psi = 68.94757293168 hPa
            break
        case "inHg": // inHg -> hPa
            [ value, unit_i ] = trans(value, 33.86386, "hPa") ; // exact factor: 1 inHg = 33.86388157895 hPa
            break
        case "mmHg": // mmHg -> hPa
            [ value, unit_i ] = trans(value, 1.33322, "hPa") ; // exact factor: 1 mmHg = 1.3332236842105263 hPa
            break
        }
        precisionSeeked = isWithin(value, [800, 1000])     ? 3.5 : isWithin(value, [1000, 1050]) ? 4.5 : 3 // special case for typical pressure around 1000 hPa
        break
    case "Pa": // Pressure
        precisionSeeked = isWithin(value, [80000, 100000]) ? 3.5 : isWithin(value, [100000, 105000]) ? 4.5 : 3 // special case for typical pressure around 100000 Pa
        break
    case "bar":
        precisionSeeked = isWithin(value, [0.8, 1])        ? 3.5 : isWithin(value, [1, 1.05]) ? 4.5 : 3 // special case for typical pressure around 1 bar
        break

    // Power, Energy: Ws, Wh, VAh
    case "Wh":
    case "VAh":
        normalizeVector = normalizeVectorGeneric
    case "kWh":
        precisionSeeked = magniTude(value) + 1.5; // precision is 1 for 1-digit values, 2 for 2-digit values, etc.
        if (unit_i === "Wh") precisionSeeked -= 3; // reduce precision by 3 for Wh
        precisionSeeked = max(1.5, precisionSeeked) // .. but at least 1.5
        scaleSeeked = 1
        break

    case "J":
    case "cal": // Energy: J, varh, cal
        normalizeVector = normalizeVectorGeneric
        scaleSeeked = 0
        break

    case "rpm": // Rotation
        precisionSeeked = 3
        break
    case "Hz": // Frequency/Rotation
        normalizeVector = normalizeVectorGeneric;
        precisionSeeked = isWithin(value, [50, 0.3], [60, 0.2], [400, 10]) ? 2.8 : 2 // higher precision for power line frequency
        break;

    // Electric: V, A, mA, F, C, Ah, S, S/m, H, Ω
    case "A":
    case "Ah":
    case "Ω":
        normalizeVector = normalizeVectorGeneric;
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
    case "kΩ":
    case "MΩ":
        precisionSeeked = 2
        break

    case "W": // Power
        normalizeVector = normalizeVectorGeneric;
    case "kW":
    case "MW":
    case "dBm":
        precisionSeeked = (abs(value) < 100) ? 1.5 : 2
        break

    case "W/m²": // Irradiance/Intensity
    case "µW/cm²":
        precisionSeeked = (abs(value) < 10) ? 1.5 : 1.8
        break

    case "V": // Voltage
        normalizeVector = normalizeVectorGeneric;
        precisionSeeked = isWithin(value, [110, 5], [230, 20], [400, 40]) ? 2.8 : 2.7
        break;

    // Volume: l, m³, gal (US)
    // Volumetric flow: l/min, m³/s, m³/min, m³/h, m³/d, gal/min. :
    case "gal":
    case "gal/min":
        if (! siAsked) {
            precisionSeeked = 2.8
            break
        }
        [ value, unit_i ] = trans(value, 3.7854, unit_i.replace("gal", "l")) ; // exact factor: 1 gal (US) = 3.785411784 liters
    case "l":
    case "l/min":
    case "m³":
    case "m³/s":
    case "m³/min":
    case "m³/h":
    case "m³/d":
        precisionSeeked = (unit_i==="l" && isWithin(value, [8, 300])) ? 3 : 2.8 // special case for typical volume around 8..300 liters (e.g. fuel tank)
        break

    case "mi": // Long distances
        if (siAsked) {
            [ value, unit_i ] = trans(value, 1.609344, "km") ; // exact factor: 1 mi = 1.609344 km
        }
        // fallthrough to kilometers and use same default precision ...
    case "km":
        precisionSeeked = 2.5 // use same default for mi and km
        break;

    case "mg/m³": // Typical for air quality
    case "µg/m³":
        precisionSeeked = 2.5
        break;

    case "Mbit/s": // Data rates
    case "kbit/s":
    case "bit/s":
        precisionSeeked = 2
        normalizeVector = undefined; // don't normalize data rates
        break;
    case "Mbit": // Memory sizes
    case "kbit":
    case "bit":
    case "TiB":
    case "GiB":
    case "MiB":
    case "KiB":
    case "B":
        debugFinal = false; // FIXME: do not always log final if div with SCALING is used, to avoid log flooding with swap size logging
        precisionSeeked = 2
        normalizeVector = undefined; // don't normalize memory sizes
        break;

    case "ppm":
    case "ppb":
    case "ppt":
    case "dB":
    case "mol":
    case "kat":
        precisionSeeked = 2.5
        break;

    case "percent":
        unit_i = "%"; // treat option unit "percent" as "%" too - avoids problem with URL encoding of "%"
    case "%": // Percent
        precisionSeeked = isWithin(value, [0, 4], [87, 102]) ? 1.2 : 1.5 // be more precise closer to 0% or to 100%
        normalizeVector = undefined; // don't normalize percentages
        // logit(`Percent hit: value=${value} ${unit_i}  ${strVerb}`);
        break;

    case "°": // Angle
        precisionSeeked = 2
        normalizeVector = undefined; // don't normalize angles
        // prec=1: between <45 and >315 degrees -> 0°, between 45 and 135 -> 90°, between 135 and 225 -> 180°, between 225 and 315 -> 270°
        // prec=2: between 337.5 and 22.5 degrees -> 0°, between 22.5 and 67.5 -> 45°, between 67.5 and 112.5 -> 90°, between 112.5 and 157.5 -> 135°
        // prec=3: between 348.75 and 11.25 degrees -> 0°, between 11.25 and 33.75 -> 22.5°, between 33.75 and 56.25 -> 45°, between 56.25 and 78.75 -> 67.5°
        // therefore: prec=1 -> 90° steps, prec=2 -> 45° steps, prec=3 -> 22.5° steps
        // for prec==1 need to divide by 90, round, and multiply by 90, but add
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
            warnit(`precisionAsked===0, ignoring it.`);
        } else {
            precisionSeeked = precisionAsked; // use precisionAsked instead of any unit-specific defaults
        }
    }
    if (scaleAsked != null) {
        scaleSeeked = scaleAsked;
    }

    var targetPrecisionSeeked = precisionSeeked;
    finalUnit = unit_i
    value += (skewAsked ?? 0)  // ... also apply any skew, if given

    if (unit_i === "°") {  // handle angle values specially/differently:
        // 0..360° only, round to 90°, 45°, 22.5° steps
        value = ((value % 360) + 360) % 360 // normalize value into range [0..360)
        angledivider = 90 / floor(precisionSeeked)
        var v = roundTo(value / angledivider, 5) // round to 5 decimal places to avoid rounding errors
        if (precisionSeeked === 1 || precisionSeeked === 2) { // the sectors might be chosen differently....
            newValue = floor(v+0.5) * angledivider  // good for odd precisionSeeked (1=90°), more compass-like (2=45°)
        } else {
            newValue = floor(  v  ) * angledivider  +  (angledivider/2)   // good for even precisionSeeked (2=45°, 4=22.5°)
        }
        newValue = newValue % 360
        debugit(`Angle: v=${v}, value=${value}° (${compassAngleToDir(value,precisionSeeked)}), newValue=${newValue}° (${compassAngleToDir(value,precisionSeeked)}), anglediv=${angledivider} ${strVerb}`);
    } else if (value === 0) {
        debugFinal = false; // avoid logging final zero values unless verboseAsked
    } else {
        if (divAsked != null) {
            value /= divAsked // apply the divisor if given
            logit(`DIV: divAsked=${divAsked} for value=${value} unit=${unit_i} ${strVerb}`);
        }
        if (multAsked != null) {
            value *= multAsked // apply the multiplier if given
            logit(`MULT: multAsked=${multAsked} for value=${value} unit=${unit_i} ${strVerb}`);
        }

        // Now take care of all the significant figure rounding!
        var frac = roundTo(precisionSeeked - floor(precisionSeeked), 1) // split off the fractional part from the precisionSeeked (1 digit)
        precisionSeeked = floor(precisionSeeked)
        var magnit = undefined;
        var power  = undefined;
        magnit = magniTude(value)  // magnitude is 0 for 1-9, 1 for 10-99, 2 for 100-999 and so on....
        power = Math.pow(10, magnit - precisionSeeked + 1) // when prec=1: power is 100 for prec=2 and value=349 (magnit=2)
        debugit(`=== value=${value} ${unit_i} Seeked=${precisionSeeked} AND Found=${precisionFound}, magnit=${magnit} power=${power} frac=${frac} ${strVerb}`);
        if (frac > 0 && precisionFound > precisionSeeked) {
            if (frac === 0.9 || frac===0.1 ) { warnit(`prec is ${precisionSeeked} + 0.9, same as prec=${precisionSeeked+1}, consider using integer precisions only.`); }
            var rounded = 0
            debugit(` == Rounding value=${value} with frac=${frac}, precisionSeeked=${precisionSeeked} ${strVerb}`);
            frac = Number( frac>0.5 ? (1.0-frac) : frac) // .toFixed(1) // make symmetric: 0.6 -> 0.4, 0.7 -> 0.3 ..., avoid floating point issues by toFixed(1)
            frac = roundTo(frac, 1) // avoid floating point issues
            let mult = clamp(Math.ceil(1/frac), [2, 5]) // mult is 2 for frac=0.5, 3 for frac=0.4, 4 for frac=0.3, 5 for frac=0.2
            let sign = value<0 ? -1 : 1
            // debugit(`  frac=${frac} -> mult=${mult}`);
            newValue = sign * floor(abs(value) / power) * power // cut off to the integer part with the given precision
            let normalizedvalue = sign * (value-newValue) / Math.pow(10, magnit - precisionSeeked)  // normalize the value to be between 1 and 10
            debugit(` normalizedvalue=${normalizedvalue} (value=${value}, newValue=${newValue}, sign=${sign})`);

            // taking a certain mult, iterate the borders to find the right one:
            let borders = BORDERS0[mult]; // borders for values for main figures equal to 0
            let middles = MIDDLES0[mult];
            if (abs(newValue) < 1e-12) { // FIXME: treat rounding errors as 0
                // now distinguish the corner cases of not putting unneeded figures to a newValue that already has enough significant figures
                debugit(` newValue=${newValue}: Choosing BORDERS0/MIDDLES0`);
            } else {
                borders = BORDERS1[mult];  // for precision fractions with a main value different from 0
                middles = MIDDLES1[mult];
                debugit(` newValue=${newValue}: Choosing BORDERS1/middles1`);
            }
            let i = 0;
            debugit(` Finding rounded value for normalizedvalue=${normalizedvalue}, mult=${mult} (frac=${frac}) in borders=${borders}`);
            while (i < borders.length && normalizedvalue > borders[i]) i++;
            rounded = middles[i]
            newValue = toPrec(newValue + sign * rounded * Math.pow(10, magnit - precisionSeeked), precisionSeeked+1)
            debugit(` ROUNDED=${rounded} into newValue=${newValue} BECAUSE border[${i}]=${i === 0 ? 0 : borders[i-1]} for mult=${mult} (frac=${frac}) : i=${i}`);
        } else {
            newValue = toPrec(value, precisionSeeked)
        }
        let scale3 = Math.trunc(magniTude(newValue)/3)
        if (scale3 !== 0 && normalizeVector != null) { // magnitude could even be 1 larger...
            // convert number to scientific notation and back to avoid signalling unneeded significant figures
            // only normalize with multiples of 3 and use the normalizeVector if given:
            // debugEnabled = true; // FIXME: only for testing purposes

            let magnit = magniTude(newValue)
            let baseUnitIndex = normalizeVector.indexOf("") // find the index of the (empty) base unit in the normalizeVector
            if (normalizeVector[scale3+baseUnitIndex]) {
                newValue = newValue / Math.pow(10, 3*scale3)
                finalUnit = normalizeVector[scale3+baseUnitIndex] + unit_i
                // debugit(` NORMALIZE: scale3=${scale3} * 3 applied to magnit=${magnit}: newValue=${newValue} finalUnit=${finalUnit}`);
                scale3=0 // since we chose the fitting unit
            } else {
                // debugit(` NORMALIZE SKIPPED: scale3=${scale3}*3 NOT applied to magnit=${magnit}: no entry in normalizeVector=${normalizeVector}`);
            }
            newValue = newValue.toExponential( min( precisionFound, Math.ceil(precisionSeeked+frac))-1)  // newValue as string in scientific notation with precisionFound significant figures
            // NO MORE calculations possible here >> BE CAREFUL, since newValue IS now a STRING! <<

            // remove unnecessary stuff in the fractional part:
            newValue = newValue.replace(/\.0+e/, "e") // trailing .0+ before the 'e'
            newValue = newValue.replace(/(\.\d*?[1-9])0+e/, "$1e") // remove trailing zeros before the 'e'
            newValue = newValue.replace(/[eE]\+0$/, "") // any e+0 at the end
            debugit(` CUT figures: magnitude=${magnit} > precisionSeeked=${precisionSeeked}, converted newValue=${newValue} finalUnit=${finalUnit}`);
        } else {
            // debugit(` No cutting of extra significant figures: precisionFound=${precisionFound} >= precisionSeeked=${precisionSeeked}`);
            newValue += testingAsked ? Number.EPSILON : 0 // add a very small value to avoid rounding errors in the next step
            if (flickerEnabled) {
                const denom = (Number.isFinite(power) && power !== 0) ? power : 1;
                const flickerAmount = (Math.round(Math.random() * 100) / 100) * 0.0001 / denom;
                logit(`FLICKER: denom=${denom}, flickerAmount=${flickerAmount}: origValue=${fmt(origValue, origUnit)} -> newValue=${fmt(newValue, unit_i)} ${strVerb}`);
                newValue += flickerAmount;
            }
        }
        debugit(` newValue=${newValue}, precisionSeeked=${precisionSeeked}  ${strVerb}`);
    }

    var logMsg = `${input} (${precisionFound}) > ${parseFloat(value.toPrecision(8))} ${unit_i} > ${fmt(newValue, finalUnit)} (${precisionSeeked}/${targetPrecisionSeeked}${scaleSeeked===undefined ? "" : " scale=" + scaleSeeked})  ${strVerb}`;
    if (! logit(`FINAL: ${logMsg}`) && (alwaysLogFinal || debugFinal)) {
        consolelog(`SIGNF: ${logMsg}`)
    }

    if (testingAsked && new Date().getSeconds() % 5 === 0) { // at every full 5 seconds, return the original value for testing purposes
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

// isWithin(): check if value is within any of the given ranges (inclusive) - ranges can be given as [min, max] or as [center, halfwidth]
function isWithin(value, ...ranges) {
    if (!Number.isFinite(value)) return false;
    return ranges.some(([a, b]) => {
        if (a<=b) {
            return a <= value && value <= b; // range is [min, max]
        } else {
            return a-b <= value && value <= a+b; // range is [center - halfwidth, center + halfwidth]
        }
    });
}

// clamp(): clamp a number x to the range [min, max]
function clamp(x, [minVal, maxVal]) {
    return Math.min(maxVal, Math.max(minVal, x))
}

// roundTo(): round a number x to a given number of decimals (return a number)
function roundTo(x, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(x * factor) / factor;
}

// toPrec(): round a number x to a given number of significant figures (return a number)
function toPrec(x, sigfigs) {
    if (x === 0) return 0;
    const magnit = magniTude(x);
    const factor = Math.pow(10, sigfigs - magnit - 1);
    return Math.round(x * factor) / factor;
}

// magniTude(): return the order magnitude of a number x (-1 for 0.1..0.9, 0 for 1..9, 1 for 10..99, 2 for 100..999, etc.)
function magniTude(x) {
    if (x === 0) return 0;
    return Math.floor(Math.log10(Math.abs(x)));
}

// isTrue(): interpret a given string as boolean true/false, and return the boolean value
function isTrue(s) {
    if (s == null) return false
    if (s === true || s === false) return s   // handle booleans directly
    s = String(s ?? "").toLowerCase().trim()
    return (s === "t" || s === "true" || s === "yes" || s === "y" || s === "on" || s === "1")
}

// consolelog(): log to console.log if available, otherwise use JS print()
function consolelog(s) {
    const str = String(s ?? "").replace(/\s+/g, ' ').replace(/:/, `${id}:`); // normalize spaces and add any id to the log message
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

// setDefault(): return defaultValue if value is undefined; if defaultValue is a function, call it with the value
function setDefault(value, defaultValue) {
    return typeof defaultValue === 'function' ?  defaultValue(value)  :  (value !== undefined) ? value : defaultValue;
}

// compassAngleToDir(): convert degrees to compass direction: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW
function compassAngleToDir(deg, scale = 2) {
    // scale: 1=4 directions, 2=8 directions, 3=16 directions, 4=32 directions
    const directions = [
        ["N", "E", "S", "W"],  // scale=1
        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], // scale=2
        ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"], // scale=3
        ["N", "NbE", "NNE", "NEbN", "NE", "NEbE", "ENE", "EbN",
         "E", "EbS", "ESE", "SEbE", "SE", "SEbS", "SSE", "SbE",
         "S", "SbW", "SSW", "SWbS", "SW", "SWbW", "WSW", "WbS",
         "W", "WbN", "WNW", "NWbW", "NW", "NWbN", "NNW", "NbW"] // scale=4
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
  ['precision','prec','scale','unit','div','mult','skew','si','verbose', 'testing', 'flicker', 'id'].forEach(k => {
    if (this[k] != null) injected[k] = this[k];
    this[k] = undefined; // reset the injected globals to undefined to avoid interference with next invocation
  });

  // `input` is injected by the openHAB transform runtime
  var opts = Object.assign({}, optsFromQuery, injected);

  // consolelog(`significant.js: input=${input}, opts=${JSON.stringify(opts)}`);
  return significantTransform(input, opts);
})();

// -----------------------------------------------------------------------------------------
// Export for Node.js unit testing (sometimes ignored in openHAB)
// -----------------------------------------------------------------------------------------
// should be commented out during openHAB use (transformation script might return an object otherwise)
/// if (typeof module !== "undefined" && module && typeof module.exports !== "undefined") {
///  module.exports = { significantTransform };
/// }