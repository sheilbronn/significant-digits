# README.md changes for openhab-addons (issue #20497)

The following changes are needed in
`bundles/org.openhab.transform.basicprofiles/README.md`
under the **Round Profile** section.

## Round Profile — DateTime support (additions)

Add the following after the existing numeric examples and before the end of the Round Profile section:

---

For `DateTime` items, the `scale` parameter is interpreted as a time unit index and rounding snaps
the value to the nearest boundary of that unit using the specified `mode`.
Truncating to days uses the timezone embedded in the DateTime value (or the system timezone if none is present).

| `scale` | Rounding unit for DateTime |
|:---:|:---|
| 0 | DAYS — truncates/rounds to midnight of the item's timezone |
| 1 | HOURS |
| 2 | MINUTES |
| 3 | SECONDS |
| 4 | MILLISECONDS |

### DateTime Round Profile Example

```ini
// Reduce state updates: snap "last motion" timestamp to the current minute
DateTime lastMotion { channel="xxx" [profile="basic-profiles:round", scale=2, mode="FLOOR"] }

// Find the start of the next full hour
DateTime nextHour   { channel="xxx" [profile="basic-profiles:round", scale=1, mode="CEILING"] }

// Find today's midnight (start of day) in the item's timezone
DateTime today      { channel="xxx" [profile="basic-profiles:round", scale=0, mode="FLOOR"] }
```
