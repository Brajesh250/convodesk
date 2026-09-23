# Incident log

Blameless postmortems of real production bugs. Copy the template for each incident, newest first.
The goal is to show _how_ a problem was found, understood and prevented, not just that it was fixed.

---

## Template

### INC-000 — <one-line summary>

| Field       | Value                                          |
| ----------- | ---------------------------------------------- |
| Date        | YYYY-MM-DD                                     |
| Duration    | e.g. 42 min (detected 10:05 → resolved 10:47)  |
| Severity    | SEV1 (outage) · SEV2 (degraded) · SEV3 (minor) |
| Detected by | UptimeRobot alert / user report / logs / CI    |
| Author      |                                                |

**Impact.** Who was affected and how (e.g. "web widget messages were not delivered to the inbox for 3 tenants").

**Timeline** (IST).

- HH:MM — first signal
- HH:MM — investigation started
- HH:MM — mitigation applied
- HH:MM — resolved

**Root cause.** The actual technical reason. Link the commit, log lines (with `requestId`) or metrics.

**Why it wasn't caught earlier.** Missing test? Free-tier behaviour we didn't model? Missing alert?

**Resolution.** What fixed it.

**Action items.**

- [ ] Regression test: …
- [ ] Monitoring/alert: …
- [ ] Doc/ADR update: …

**Lessons.** One or two sentences you could say in an interview.
