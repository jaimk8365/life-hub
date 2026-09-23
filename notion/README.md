# Jaimi Life OS — Notion build

This folder is the safe, non-personal blueprint for a Notion front-end over Life Hub.

## Design direction

Research notes used for the build:
- keep the home screen focused on **Today**, not every database at once;
- use a warm neutral base with rose/sage/clay accents;
- use gallery cards and imagery for navigation, but tables/lists for action areas;
- keep widgets limited to useful glanceable information;
- keep deeper areas one tap away to reduce dashboard overload.

## Home dashboard

Top: wide seasonal cover + “Jaimi Life OS” + small clock/weather widgets.

First row: **Today**, **This Week**, **Quick Capture**.

Second row: 8 visual navigation cards — Planner, Family, Health, Food, Money, Home, Life Hub, Reset.

Below: Today's top 3, today's tasks, calendar, meals, routines. Everything else is hidden behind its area page.

## Widgets

Recommended: Indify for clock/weather/progress/countdown. Calendar should use Notion Calendar/iCloud rather than a decorative calendar widget. Avoid widgets that duplicate task databases.

## Life Hub integration

Life Hub remains the source of truth for its encrypted/private data. Notion is the planning/control layer. Never commit a Notion token, private Notion page ID, health data, finance data or Apple data to this public repository.

GitHub's normal Notion connection is useful for Issues/PRs, but custom Life Hub records require the Notion API.

## Apple apps

- Apple Calendar: surface via Notion Calendar/iCloud.
- Apple Reminders: keep as the alert/Siri layer. Existing Life Hub reminder tooling can remain in place.
- Apple Notes: quick capture; use Share/Shortcuts for deliberate send-to-Notion flows rather than fragile two-way sync.

## Setup still requiring Jaimi

1. Create/open the destination Notion workspace/page.
2. In Notion Settings → Connections, enable Developer Mode and create an internal connection with only the content permissions needed.
3. Share the destination page with that connection.
4. Store the token outside GitHub (local environment or GitHub Actions secret if server automation is later enabled).
5. Use `life-os-blueprint.json` as the authoritative schema for the workspace builder.

## Privacy

This repository is public. The integration must never send the encrypted Life Hub vault itself into Notion. Only explicitly selected planning records should cross the boundary.
