# Borderville admin Worker

`index.mjs` is the existing Cloudflare Worker source supplied from the dashboard.
The `.mjs` extension keeps its ES module export compatible with this repository's
CommonJS scripts. The imported code has not been changed or deployed.

## Current routes

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/` | Admin menu |
| GET | `/match-entry` | Match-entry form and JSON payload preview |
| GET | `/api/players` | Read Airtable players, omit excluded players and sort by name |
| GET | `/subs`, `/players` | Coming-soon pages |

There is no match-saving endpoint yet. Reviewing a match only displays the data;
it does not create match or goal records in Airtable.

## Cloudflare settings

The Worker reads `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` from `env`. Keep their
values in Cloudflare's existing secret settings; do not add them to source code.
The Players table ID matches the one used in `scripts/aggregate.js`.

This folder stores the source alongside the website. It is not connected to
automatic deployment. Before configuring deployment, use the existing Worker's
name, compatibility settings and bindings from Cloudflare so changes target the
correct Worker. Once deployment is configured, keep this source and its
configuration as the maintained versions rather than editing both copies.
