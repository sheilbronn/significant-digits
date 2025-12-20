// significant.js
// This is a OpenHAB transformation script to reduce incoming values to a unit-dependant, typical number of significant figures
// in the SI unit system plus some other features. It should support all OpenHAB unit types.
// It also covers some special cases for significance, e.g. values around 50Hz, or temperature close to freezing point etc.

// Parameters (optional):
// "precision" : a number of significant figures to round to (used to override the unit specific default, as in ...?precision=3)
// "scale" : a number of decimal places to round to, use like ...?scale=0
// "div" : a divisor to apply to the input value before rounding, use like ...?div=1K oder 1M or 1000 (useful since OpenHAB only supports one transformation at a time)
// "mult" : a multiplier to apply to the input value before rounding, use like ...?mult=1K oder 1M oder 1000 (useful since OpenHAB only supports one transformation at a time)
// "unit" : a unit to force the output to, use like ...?unit=°C (unit=. will remove the unit given in the input)
// "verbose" : one of {t|true|1|yes|y||false|no} to enable or disable logging, use like ...?verbose=true
// "testing" : {t|true|1|yes|y||false|no} to enable or disable testing of new features, use like ...?testing=y
// "skew" : a number to add to the input value before rounding, use like ...?skew=0.5 (e.g. for 0.5 significant figures)

var verboseAsked   = false // if default set to true here, script will always log some details about the transformation
var testingAsked   = false // if default set to true here, script will always support be set to "testing of new features"
var debugEnabled   = false // if default set to true here, script will always log debug messages
var flickerEnabled = false // if default set to true here, output will always have a tiny, random fraction added to distinguish it from the previous value. This helps debugging

var verboseIncreased = false; // if true and verbose is true, then log even more details
var scriptname = "significant.js: "; // will hold the script name for logging
var alwaysLogFinal  = false; // if set to true, always log the final output of the transformation

/* All understood units should be according to: (uunits)
   https://www.openhab.org/docs/concepts/units-of-measurement.html:

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

// Main function called by OpenHAB when the transformation is invoked:
function significantTransform(i, opts = {}) {
    // map the given options (for unit testing or wrapper use) to special variables:
    var verbose   = opts.verbose
    var testing   = opts.testing;
    var si        = opts.si; // Previous: (opts.si === undefined ? true : opts.si);
    var prec      = opts.prec ?? opts.precision;
    var precision = opts.precision ?? prec;
    var scale     = opts.scale
    var unit      = opts.unit
    var div       = opts.div;
    var mult      = opts.mult;
    var skew      = opts.skew;
    var flicker   = opts.flicker;

    let input     = i  // store the incoming value (and optionally unit name) to be transformed
    let unit_i    = "" // will carry the unit name in the input i (if any)
    let strVerb   = "" // will carry the message string for logging
    let matches   = null // will be used for regex matches

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

    // debugit(`input=${input}`);

    // Now parse all the injected parameters from the invocation of the transformation script:

    if (typeof verbose  !== 'undefined') {
        // debugit(` VERBOSE=${verbose}, TYPEOF verbose=${(typeof verbose)}`);
        verboseAsked = !!setDefault(verbose,  isTrue)
        strVerb += ` VERBOSE=${verboseAsked}`; // ` (${type})`
        // debugEnabled = verboseAsked; // only used TEMPORARELY: FIXME
    }
    if (typeof testing !== 'undefined') {
        // debugit(` TESTING=${testing}, TYPEOF testing=${(typeof testing)}`);
        testingAsked = !!setDefault(testing,  isTrue)
        // if (testingAsked) { verboseAsked = true ; }// if testing is asked, then also enable verbose logging
        strVerb += ` TESTING=${testingAsked}`; // ` (${type})`
    }
    if (typeof si !== 'undefined') {
        // debugit(` SI=${si}, TYPEOF si=${(typeof si)}`);
        siAsked = !!setDefault(si, isTrue)
        strVerb += ` SI=${siAsked}`; // + ` (${type})`;
    }

    if (typeof prec !== 'undefined' ) {
        precision = prec // alias prec to precision for backward compatibility
        // debugit(` PREC=${prec}, TYPEOF prec=${(typeof prec)}`);
        // strVerb += "  PREC=" + precisionAsked // // ` (${type})`
    }
    if (typeof precision !== 'undefined' ) {
        // debugit(` PREC=${precision}, TYPEOF precision=${(typeof precision)}`);
        precisionAsked = numOrUndef(precision)
        strVerb += ` PREC=${precisionAsked}`;  // + ` (${type})`
    }
    if (typeof scale !== 'undefined') {
       // debugit(` SCALE=${scale}, TYPEOF scale=${(typeof scale)}`);
        scaleAsked     = numOrUndef(scale)
        strVerb += ` SCALE=${scaleAsked}`; // + ` (${type})`;
    }
    if (typeof skew !== 'undefined') {
        // debugit(` SKEW=${skew}, TYPEOF skew=${(typeof skew)}`);
        skewAsked      = numOrUndef(skew)
        strVerb += ` SKEW=${skewAsked}`; // + ` (${type})`;
    }
    if (typeof div !== 'undefined') {
        // debugit(` DIV=${div}, TYPEOF div=${(typeof div)}, unit=EMPTY`);
        unitAsked = "" // request the output to have no unit
        // split div and check for e.g. "1k", "1K", "1M" and "7G" and "5T" and "8P" and ... and expand them to the corresponding number of bytes

        // parse div: "<number><suffix>"
        matches = String(div).trim().match(/^(\d+(?:\.\d+)?)([A-Za-z]*)$/);
        if (matches) {
            let amount = parseFloat(matches[1]);
            const type = matches[2];

            const SCALE_MAP = {
                "": 1,
                k: 1e3,
                K: 1024,
                ki: 1024,
                M: 1e6,
                Mi: 1024 ** 2,
                G: 1e9,
                Gi: 1024 ** 3,
                T: 1e12,
                Ti: 1024 ** 4,
                P: 1e15,
                Pi: 1024 ** 5,
            };

            if (!Number.isFinite(amount)) {
                warnit(`Bad div amount: "${matches[1]}"`);
                divAsked = undefined;
            } else if (!Object.prototype.hasOwnProperty.call(SCALE_MAP, type)) {
                warnit(`Unknown type: "${type}"`);
                // decide: either ignore the suffix or reject entirely.
                // Here we *ignore suffix* but still use the numeric amount:
                divAsked = amount; // or set undefined to reject
            } else {
                divAsked = amount * SCALE_MAP[type];
            }

            // guard zero (and NaN), regardless of suffix outcome
            if (!Number.isFinite(divAsked) || divAsked === 0) {
                warnit(`DIV is invalid or 0; ignoring to avoid division by zero.`);
                divAsked = undefined;
            }            
        } else {
            logit(`Bad div format: "${div}"`);
        }
        strVerb += ` div=${div} DIV=${divAsked}`;
    }
    if (typeof mult !== 'undefined') {
        // debugit(` MULT=${mult}, TYPEOF mult=${(typeof mult)}`);
        multAsked = numOrUndef(mult)
        strVerb += ` MULT=${multAsked}`;
    }
    if (typeof unit !== 'undefined') {
        // debugit(` UNIT=${unit}, TYPEOF unit=${(typeof unit)}`);
        unitAsked = unit;
        if (unitAsked === "." ) { unitAsked="" ; }
        strVerb += " UNIT=" + unitAsked
    }
    if (typeof flicker !== 'undefined') {
        // debugit(` FLICKER=${flicker}, TYPEOF flicker=${(typeof flicker)}`);
        flickerEnabled=!!setDefault(flicker, isTrue)
        strVerb += ` FLICKER=${flickerEnabled}`;
    }

    // input = "0.0123400" ; // keep some corner cases for testing purposes
    // input = "04.0"
    // input = ".09870"
    // input = "-0.19870"

    // If the input looks like a date-time string, round the time part to the number of significant figures:
    // e.g. "2025-09-27T14:16:28.000+0200"
    const dtregex = /^(\d{4})-([01]\d)-([0123]\d)(T| )([012]\d):([0-5]\d):([0-5]\d)(\.\d{3})([+-]\d{4})$/ // e.g. 2024-10-13T02:30:03.000+0200
    matches = input.match(dtregex) // input is a timestamp with a numeric offset
    debugit(`input=${input}, match date regex: ${(matches ? "YES" : "NO")}`);
    if (matches) {
        const [ , y, mo, d, timesep, hh, mm, ss, dotms, tzoff ] = matches // slice the match into variables
        const ms = parseInt(dotms.slice(1), 10) // ".123" -> 123

        // parse the offset +HHMM / -HHMM to minutes
        const offsetMinutes = (tzoff[0] === '-' ? -1 : 1) * (parseInt(tzoff.slice(1, 3), 10) * 60 + parseInt(tzoff.slice(3, 5), 10))

        // default levels: 0=days, 1=hours, 2=minutes, 3=seconds, 4=milliseconds
        let level = setDefault(scaleAsked, 3)        // your "scale" concept: how deep to include
        level = Math.max(0, Math.min(4, (level|0)))  // clamp to [0..4]

        // local wall time -> UTC epoch ms (treat tzoff as a fixed-offset zone)
        const localUtcMs = Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss, +ms)
        const utcMs = localUtcMs - offsetMinutes * 60 * 1000

        // choose rounding unit in ms
        const unitMs = [24*3600e3, 3600e3, 60e3, 1e3, 1][level] // day, hour, minute, second, millisecond

        // round in UTC
        const roundedUtc = Math.round(utcMs / unitMs) * unitMs

        // convert back to local wall time with the same fixed offset
        const localMs = roundedUtc + offsetMinutes * 60 * 1000

        // read components using UTC getters (we already applied the offset)
        const dLoc = new Date(localMs)
        let out = dLoc.getUTCFullYear() + "-"
                + String(dLoc.getUTCMonth() + 1).padStart(2, "0") + "-"
                + String(dLoc.getUTCDate()).padStart(2, "0") + timesep
                + (level >= 1 ? String(dLoc.getUTCHours()).padStart(2, "0") : "00")
                + ":" + (level >= 2 ? String(dLoc.getUTCMinutes()).padStart(2, "0") : "00")
                + ":" + (level >= 3 ? String(dLoc.getUTCSeconds()).padStart(2, "0") : "00")
                + (level >= 4 ? "." + String(dLoc.getUTCMilliseconds()).padStart(3, "0") : "")
                + tzoff;

        logit(`Input becomes ${out} ${strVerb}`);
        return out // early return with the transformed date-time string
    }    

    var value = parseFloat(input); // parse the value and unit from the input string:
    if (isNaN(value)) {
        logit(`input="${input}" is NaN.`)
        return input // take an early exit for non-numeric values and return the input as is.
    }

    matches = input.match(/\s+(.*)$/)
    if (matches) {
        unit_i = matches[1] // if the input contains a space consider the stuff behind the space as the unit.
    }

    var   origvalue = value  // preserve the original value and unit for later logging and comparison
    const origunit  = unit_i
    var   newvalue  = 0

    if (origvalue>777 && origvalue<778) {
        debugEnabled = true; // only for testing purposes
        verboseAsked = true;
        verboseIncreased = true;
        logit(`DEBUG: 777 is hit. Setting for Debug.  ${strVerb}`);
    }

    // determine the number of significant figures of the input value (i.e. those before AND after the decimal point)
    const parts = (value>0?value:-value).toString().split(".")
    var precisionFound = parts[0].length
    if (parts.length > 1 ) {
        precisionFound += parts[1].length
        if (parts[0] === "0") precisionFound-=0.5 // but special case for input "0.1234..." decrement significant figures by "0.5" (round 0, 0.5, 1, 1.5 and so on)
    }
    debugit(`input: value=${value} ${origunit} (${precisionFound}) ${strVerb}`);

    if (typeof unitAsked !== 'undefined') {
        switch (unit_i) {
            case "MiB":
                value = value * 1024 * 1024
                break
            default:
                break
        }
        logit(`unit: "${unit_i}" > "${unitAsked}" ${strVerb}`);
        unit_i = unitAsked // ignore the unit from input i and take the forced unit
    }

    switch (unit_i) {  // modify precision defaults depending on the unit coming in or asked for (uunits)
    case "K": // Temperature 
        precisionSeeked = (Math.abs(value) < 10) ? 1.5 : 2.5
        logit(`Kelvin is hit: value=${value} ${unit_i} ${strVerb}`);
        break;
    case "°F": 
        if (siAsked) {
            value = (value - 32) * 5 / 9
            unit_i = "°C"
        }
        // fallthrough to Celsius ...
    case "°C":
        precisionSeeked = (Math.abs(value) < 1) ? 0.5 : (Math.abs(value) < 10) ? 1.5 : 2.5
        break;

    // Speed
    case "kn":
        value = value * 1.150779448
        unit_i = "mph"
        // fallthrough to mph ...
    case "mph":    
        precisionSeeked = (Math.abs(value) < 10) ? 1.5 : (Math.abs(value) < 30) ? 1.3 : 1.5
        scaleSeeked = 0
        if (siAsked) {
            // convert mph to km/h (prefer km/h over m/s for typical weather station wind speed):
            value = value * 1.609344
            unit_i = "km/h"
        }
        break
    case "m/s":
        value = value * 3.6
        unit_i = "km/h"
        // fallthrough to km/h ...
    case "km/h":
        precisionSeeked = (Math.abs(value) < 5) ? 1 : (Math.abs(value) < 20) ? 1.5 : 2
        break;
    case "in/h":
        if (siAsked) {
            value = value * 25.4
            unit_i = "mm/h"
        }
        break;

    // Length, Distance, and precipitation
    case "ft":
        value = value * 12
        // fallthrough to in ...
    case "in": 
        unit_i = "in"
        precisionSeeked = 2
        if (! siAsked) {
            break
        }
        value = value * 2.54
        // fallthrough to cm ...
    case "cm": // typical in precipitation
        value = value * 10
        // fallthrough to mm ...
    case "mm": // typical in precipitation
        value = value * 0.001
        precisionSeeked = 2
        // fallthrough to m ...
    case "m": // typical for total precipitation
        if (isBetween(value, 0, 0.08)) { // decrease precision for less than 0.08m, probably precipitation       
            precisionSeeked = 1.5
        } else if (origunit === "m") {
            precisionSeeked = 3 
        }
        unit_i = "m"
        verboseAsked = true; // FIXME later: for testing purposes
        logit(`${unit_i} hit: value=${value} ${unit_i} (ORIG: ${origvalue} ${origunit})  ${strVerb}`);
        break;

    case "h": 
        precisionSeeked = 99
        break    
    case "min": // Time
        precisionSeeked = 4
        break    
    case "s":
        if (Math.abs(value)<1000) {
            precisionSeeked = (Math.abs(value) <= 3) ? 1 : (Math.abs(value) <= 10) ? 0.5 : 1.5
        } else {
            precisionSeeked = 99
            scaleSeeked = -2
        }
        break;
    case "lbs":    // Weight
        if (siAsked) {
            value = value * 0.45359237
            unit_i = "kg"
        }
        break;

    // Pressure: Pa, hPa, mmHg, bar, psi, inHg
    case "inHg":
        value = value * 33.863886666667
        unit_i = "hPa"
        // fallthrough to hPa ...
    case "hPa": // Pressure
        if (unit_i === "hPa") {
            precisionSeeked = (isBetween(value, 1000, 1050) ? 4 : 3) + 0.3 // special case for typical sea level pressure around 1013 hPa
            scaleSeeked = 1
        }
        break
    case "Pa":
        if (unit_i === "Pa") {
            precisionSeeked = (isBetween(value, 100000, 105000) ? 4 : 3) + 0.3 // special case for typical sea level pressure around 101325 Pa
            scaleSeeked = -1
        }
        break

    // Power, Energy
    case "Wh":
    case "VAh":
    case "kWh": 
        scaleSeeked = 1
        break

    case "J":
    case "cal": // Energy: J, Ws, Wh, VAh, varh, cal
        scaleSeeked = 0
        break

    case "rpm":
    case "Hz": // Frequency/Rotation
        precisionSeeked = 2
        if (isBetween(value, 50 - 0.5, 50 + 0.5)) {
            precisionSeeked = 2.2 // special case for 50Hz power line frequency
        }
        break;

    // Electric: V, A, mA, F, C, Ah, S, S/m, H, Ω
    case "A":
    case "kA":
    case "mA":
    case "µA":
    case "nA":
    case "Ah":
    case "mAh":
    case "kAh":
    case "S":
    case "mS":
    case "µS":
    case "Ω":
    case "kΩ":
    case "MΩ":
        precisionSeeked = 2
        break

    case "W":
    case "kW":
    case "MW":
    case "dBm": // Power
        precisionSeeked = (Math.abs(value) < 100) ? 1.5 : 2
        break

    case "W/m²":
    case "µW/cm²":        
        precisionSeeked = (Math.abs(value) < 10) ? 1 : 2
        break

    case "V": // Voltage
        precisionSeeked = 2.3
        break;

    // Volume: l, m³, gal (US)
    // Volumetric flow: l/min, m³/s, m³/min, m³/h, m³/d, gal/min. :
    case "gal": 
        if (siAsked) {
            value = value * 3.78541
            unit_i = "L"
        }
        // fallthrough to liters ...
    case "L":
    case "l":
    case "L/min":
    case "l/min":
    case "L/m":
    case "l/m":
        precisionSeeked = 2
        if (isBetween(Math.abs(value), 10, 300)) { // increase precision for gas pumps measuring small amounts of liters        
            precisionSeeked += 0.2
        }
        break

    // Long distances:
    case "mi":
        if (siAsked) {
            value = value * 1.609344
            unit_i = "km"
        }
        // fallthrough to kilometers ...
    case "km":
        precisionSeeked = 2.5
        break;
    
    case "mg/m³": // Typically for air quality:
    case "µg/m³":
        precisionSeeked = 2.5
        break;

    case "Mbit/s": // Memory sizes and data rates
    case "kbit/s":
    case "bit/s":
    case "Mbit":
    case "kbit":
    case "bit":
    case "TiB":
    case "GiB":
    case "MiB":
    case "KiB":
    case "B":
        precisionSeeked = 2
        break;

    case "ppm":
    case "ppb":
    case "ppt":
    case "dB":
    case "mol":
    case "kat":
        precisionSeeked = 2.5
        break;

    case "%": // Percent
        precisionSeeked = isBetween(Math.abs(value), 3, 87) ? 1.5 : 1.2 // be more precise closer to 0% or 100%
        break;

    case "°": // Angle
        precisionSeeked = 2
        // prec=1: between <45 and >315 degrees -> 0°, between 45 and 135 -> 90°, between 135 and 225 -> 180°, between 225 and 315 -> 270°
        // prec=2: between 337.5 and 22.5 degrees -> 0°, between 22.5 and 67.5 -> 45°, between 67.5 and 112.5 -> 90°, between 112.5 and 157.5 -> 135°
        // prec=3: between 348.75 and 11.25 degrees -> 0°, between 11.25 and 33.75 -> 22.5°, between 33.75 and 56.25 -> 45°, between 56.25 and 78.75 -> 67.5°
        // therefore: prec=1 -> 90° steps, prec=2 -> 45° steps, prec=3 -> 22.5° steps
        // for prec==1 need to divide by 90, round, and multiply by 90, but add
       break;

    default: // Unknown unit -> use a default precision of currently 3 significant figures
        if (unit_i !== "" && (testingAsked || verboseAsked)) {
            warnit(`Unknown input unit: "${unit_i}" ${strVerb}, value=${value}, please contact author and/or set it with unit=${unit_i} parameter.`)
        }
        precisionSeeked = 3
        break
    }

    if (precisionAsked !== undefined ) {
        if (precisionAsked === 0) {
            warnit(`precisionAsked===0, ignoring it.`);
        } else {
            precisionSeeked = 0 + precisionAsked; // if precisionAsked was explicitly given, use it as the number of significant figures to round to instead of the unit-specific default
        }
    }
    if (scaleAsked !== undefined) {
        scaleSeeked = scaleAsked;
    }

    var targetPrecisionSeeked = precisionSeeked;
    var magnitude = undefined;
    var power     = undefined;

    if (skewAsked !== undefined) { // apply the skew if given
        value += skewAsked
    }

    if (unit_i === "°") {  // handle angle values specially
        // 0..360° only, round to 90°, 45°, 22.5° steps
        value = ((value % 360) + 360) % 360 // bring value into range [0..360)
        angledivider = 90 / (Math.floor(precisionSeeked))
        var v = roundTo(value / angledivider, 5) // round to 5 decimal places to avoid rounding errors
        if (precisionSeeked === 1 || precisionSeeked === 2) { // the sectors might be chosen differently....
            newvalue = Math.floor(v + 0.5) * angledivider  // good for odd precisionSeeked (1=90°), more compass-like (2=45°)
        } else {
            newvalue = Math.floor(v) * angledivider  +  (angledivider/2)   // good for even precisionSeeked (2=45°, 4=22.5°)
        }
        newvalue = (newvalue % 360)
        debugit(`Angle: v=${v}, value=${value}° (${compassAngleToDir(value,precisionSeeked)}), newvalue=${newvalue}° (${compassAngleToDir(value,precisionSeeked)}), anglediv=${angledivider} ${strVerb}`);
    } else if (value !== 0) {
        if (divAsked !== undefined) {
            value /= divAsked // apply the divisor if given
            logit(`DIV: divAsked=${divAsked} for ${value} ${unit_i} ${strVerb}`);
        }
        if (multAsked !== undefined) {
            value *= multAsked // apply the multiplier if given
            logit(`MULT: multAsked=${multAsked} for ${value} ${unit_i} ${strVerb}`);
        }
        // debugit(`DIV: divAsked=${divAsked}, SKEW: skewAsked=${skewAsked}, value=${value}, magnitude=${magnitude}, power=${power}, precisionSeeked=${precisionSeeked}, mult=${mult} ${strVerb}`);

        const frac = (precisionSeeked - Math.floor(precisionSeeked)).toPrecision(1) // get the fractional part of precisionSeeked
        debugit(`frac=${frac}, precisionSeeked=${precisionSeeked}`)
        precisionSeeked = Math.floor(precisionSeeked)
        var mult = 1
        if (frac > 0) {
            mult = Math.ceil(1/frac); // x.5 -> 2, x.4 -> 3, x.3 -> 4, x.2 -> 5, x.1 -> 10
            // so x.5 makes mult=2, x.4 makes 3, x.3 makes 4, ... and
            debugit(`precisionSeeked=${precisionSeeked}, mult=${mult}`);
        }
        magnitude = Math.floor(Math.log10(Math.abs(value)))
        power = Math.pow(10, precisionSeeked - magnitude - 1)
         // only for precisionSeeked equals 1
        if ( 1===0 && precisionSeeked === 1 && mult>1 ) {  // if only one significant figure is asked for, then lower values in the second figure are more significant
            // FIXME: might get rid of these special cases and use the general approach below for all cases....

            // use better (smaller) boundaries for lower values
            // 0.5 -> 2 (0;0.5)
            // 0.4 -> 3 (0;0.3;0.6) -> resulting borders : 0.15;0,45;0.80
            // 0.3 -> 4 (0;0.2;0.4;0.7) -> resulting borders : 0.1;0.3;0.55;0.85
            // 0.2 -> 5 (0;0.1;0.3;0.5;0.7) -> resulting borders : 0.05;0.2;0.4;0.6;0.85
            // 0.1 -> 10
            // for testing: for i in 0 $(seq 0 1 9) ; do mp "mqtt/test" "0.${i}" ; mp "mqtt/test" "0.${i}5" ; done
            var aspired = [
                [0, 1],
                [0, 0.5, 1],
                [0, 0.3, 0.6, 1],
                [0, 0.2, 0.4, 0.7, 1],
                [0, 0.1, 0.3, 0.5, 0.7, 1]
            ][mult-1] ;

            var newvalue_1 = Math.floor( value * power )  // the 1 significant digit part....
            var scaledRest = (power * (value - newvalue_1/power)).toFixed(3);
            debugit(`TESTING: magnitude=${magnitude}, power=${power}, scaledRest=${scaledRest}, newvalue_1=${newvalue_1}, value=${value}, mult=${mult}`);
            for (var index=0; aspired[index+1] < scaledRest; index++) {
                // iterate over the aspired until the scaledRest is between aspired[index] and aspired[index+1]
                // testit(`LOOKING: index=${index}, aspired[index]=${aspired[index]}, scaledRest=${scaledRest} ${strVerb}`);
            }
            if ( scaledRest - aspired[index] > aspired[index+1] - scaledRest ) {
                // round up to the higher aspired value
                index++
            }
            debugit(`FOUND for ${scaledRest}: index=${index}, aspired[index]=${aspired[index]}, power=10, newvalue_1=${newvalue_1}`);
            newvalue = (newvalue_1 + aspired[index]) / power;
            newvalue = parseFloat(newvalue.toPrecision(2)); // needed to deal with problems from binary arithmetic
        } else {
            // don't prefer closer aspired for lower values for more significant figures
            newvalue = Math.round(value * power * mult) / mult / power
        }
    }

    newvalue += (testingAsked ? 0.00000003 : 0) // add a very small value to avoid rounding errors in the next step

    if (scaleSeeked !== undefined) { // finally: round the value to "scale" = a given number of decimals
        debugit(`newvalue=${newvalue}, scaleAsked=${scaleAsked} ${strVerb}, scaleSeeked=${scaleSeeked}`);
        newvalue = Math.round(newvalue * 10**scaleSeeked) / 10**scaleSeeked;
    } else { // ... or remove "many same repeated decimals", e.g. xx.77777778 or xx.4444444 or xx.00000001
        // debugit(`newvalue=${newvalue}, precisionSeeked=${precisionSeeked}, power=${power}, mult=${mult} ${strVerb}`);
        let valuestring = newvalue.toString()
        // Match a number with repeated digits at the end (e.g., 123.4566666):
        // catch a case like 1000000.0000000001, too
        matches = valuestring.match(/(\d+)\.(\d\d)(\d)\3+(\d)$/)
        // debugit(`valuestring=${valuestring}, matches=${matches} ${strVerb}`);
        // Check if the matched string has more than 8 characters to ensure it's a significant repeating pattern
        if (matches && matches[0].length > 8) {
            var keep = precisionSeeked - ( matches[1] === "0" ? 0 : matches[1].length ) // keep is the number of decimals to keep
            newvalue = Number(matches[1] + "." + matches[2] + matches[3]).toFixed( Math.max(0,keep) )
            debugit(`${matches[3]} is repeated at the end of ${valuestring}: ${precisionSeeked} : ${matches[1]}.${matches[2]}_${matches[3]}_${matches[4]}, keep=${keep} > ${newvalue} ${strVerb}`);
        } else if (valuestring.length > 9) {
            debugit(`long valuestring=${valuestring} didn't match. CC ${strVerb}`);
        }
    }
    var logMsg = `${origvalue} ${origunit} (${precisionFound}) > ${parseFloat(value.toPrecision(8))} ${unit_i} > ${newvalue} ${unit_i} (${precisionSeeked}/${targetPrecisionSeeked}${scaleSeeked===undefined ? "" : " scale=" + scaleSeeked}) + ${strVerb}`;
    const wasLogged = logit(`FINAL: ${logMsg}`);
    if (!wasLogged && alwaysLogFinal) {
        consolelog(`SIGNIF: ${logMsg}`);
    }    

    const now = new Date()
    if (testingAsked && now.getSeconds() % 5 === 0) {
        logit(`RETURN origvalue: ${origvalue} ${origunit}`)
        return `${origvalue}${origunit ? ` ${origunit}` : ""}`
    }
    if (flickerEnabled) {
        const denom = (typeof power === "number" && isFinite(power) && power !== 0) ? power : 1
        const flickerval = Math.random().toFixed(1) / denom * 0.00001
        return `${newvalue + flickerval}${unit_i ? ` ${unit_i}` : ""}`
    }
    return `${newvalue}${unit_i ? ` ${unit_i}` : ""}` 
}

// -------------------------
// helper functions
// -------------------------

function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isBetween(x, min, max) {
    return x >= min && x <= max;
}

function isTrue(s) {
    if (typeof s === 'undefined' || s === null) return false
    if (s === true || s === false) return s   // handle booleans directly
    s = s.toString().toLowerCase().trim()
    return (s === "t" || s === "true" || s === "yes" || s === "y" || s === "on") || s === "1"
}

function consolelog(s) { // if console.log is not defined, use print
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(s.replace(/\s+/g, ' '))
    } else {
        print(s)
    }
}

// for test and logging support:
function logit(s) {
    const now  = new Date()
    const hour = now.getHours()
    if (hour === 28 || verboseAsked || debugEnabled || testingAsked) { // ... or always at a certain hour to ease retrospective debugging
        consolelog(scriptname + s);
        return true;
    } else {
        return false;
    }
 }

function logitmore(s) { // increased
    if (verboseIncreased || testingAsked) {
        logit(s)
    }
 }

function warnit(s) {
    consolelog(scriptname + "WARNING: " + s)
 }

function debugit(s) {
    // consolelog(`significant.js: ${s} (debugEnabled=${debugEnabled})`);
    if (debugEnabled) {
        consolelog(scriptname + s)
    }
 }

function testit(s) {
    if (testingAsked) {
        consolelog(scriptname + s)
    }
 }

function numOrUndef(x) {
    const n = parseFloat(x);
    return Number.isFinite(n) ? n : undefined;
}

function setDefault(value, defaultValue) { // return defaultValue if it is given and not a function
    if (typeof defaultValue === 'function') {
        return defaultValue(value)
    }
    return (value === undefined) ? defaultValue : value
}

function compassAngleToDir(deg,scale=2) {
    // Convert degrees to compass direction (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW)
    // scale: 1=4 directions, 2=8 directions, 3=16 directions
    const directions = [
        ["N", "E", "S", "W"], // scale=1
        ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], // scale=2
        ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"], // scale=3
        ["N", "NbE", "NNE", "NEbN", "NE", "NEbE", "ENE", "EbN", "E", "EbS", "ESE", "SEbE", "SE", "SEbS", "SSE", "SbE",
         "S", "SbW", "SSW", "SWbS", "SW", "SWbW", "WSW", "WbS", "W", "WbN", "WNW", "NWbW", "NW", "NWbN", "NNW", "NbW"] // scale=4
    ]
    scale = Math.max(1, Math.min(4, (scale|0))) // clamp scale to [1..4]
    const dirs = directions[scale - 1]
    const step = 360 / dirs.length
    deg = ((deg % 360) + 360) % 360 // bring deg into range [0..360)
    const index = Math.floor((deg + step / 2) / step) % dirs.length
    return dirs[index]
}

// -----------------------------------------------------------------------------------------
// openHAB wrapper: preserves transform usage; also lets us pass opts either via *query* or also as *injected vars*
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

  // Pick up injected globals (some transform profiles define them directly)
  var injected = {};
  ['precision','prec','scale','unit','div','mult','skew','si','verbose','testing','flicker'].forEach(k => {
    if (typeof this[k] !== 'undefined') injected[k] = this[k];
    // reset the injected globals to undefined to avoid interference with next invocation
    this[k] = undefined;
  });

  var opts = Object.assign({}, optsFromQuery, injected);
  // consolelog(`significant.js: input=${input}, opts=${JSON.stringify(opts)}`);

  // `input` is provided by openHAB transform runtime
  return significantTransform(input, opts);
})();

// -----------------------------------------------------------------------------------------
// Export for Node.js unit testing (sometimes ignored in openHAB)
// -----------------------------------------------------------------------------------------
// should be commented out during openHAB use (transformation script might return an object otherwise)
/// if (typeof module !== 'undefined') {
///  module.exports = { significantTransform };
/// }