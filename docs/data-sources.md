# Data sources

## Problem catalog (`data/seed-problems.json`)

The seed catalog is a manually curated transcription of the **NeetCode 150** list
(https://neetcode.io/practice). Only public, factual metadata is included:

- `slug` — the kebab-case identifier used on leetcode.com (e.g. `two-sum`)
- `title` — the official problem title
- `difficulty` — `easy` | `medium` | `hard`
- `topics` — common algorithmic tags (array, two-pointers, dynamic-programming, …)

We deliberately do **not** scrape leetcode.com (against their Terms of Service).
No problem statements, test cases, or editorial content from LeetCode is stored
here. Each row's `url` points back to the canonical LeetCode page so the user
can read the actual prompt there.

If you want to extend the catalog, edit `data/seed-problems.json` and re-run
`npm run seed` — the loader is idempotent (skips slugs that already exist).

## Attribution

- NeetCode 150 list curated by Navdeep Singh (neetcode.io). Used here as a study
  ordering; titles/slugs are factual references to public LeetCode problems.
