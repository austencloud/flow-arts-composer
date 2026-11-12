# Honest visitor numbers

PostHog showed 368 visitors in the 30 days before 2026-11-09: about 190
one-page crawler hits (Singapore, Beijing, Hong Kong, Ashburn, US with no city,
landing on `/atlas` and translated guide pages), about 39 Chicago profiles of
Austen and his agents, and about 136 outside people. **The headline: outside
people active on 2 or more days, per week.** A second day means they came back.

## What gets left out, and why

**Crawler sessions.** One rule, `CRAWLER_SESSION_RULE` in
`src/lib/server/analytics/crawler-sessions.ts`, read by the triage queries in
`session-triage-queries.ts` and the admin pulse. A session is a crawler when
it has exactly 1 `$pageview`, no event with `$is_identified` true, a last-event
`$browser_language` of `zh-cn` (lowercased, `_` read as `-`), and a first
pageview `$referring_domain` that is empty or `$direct`. It catches only the
zh-CN readers; English-browser Ashburn and no-city US hits still count.

**Austen and his agents.** An admin's identify sets person properties
`is_admin: true` and `is_internal: true` (`services/posthog.ts`). The browser
remembers it (`internal-browser.ts`), and every later event from it carries
the super property `is_internal: true`, signed out too; it is registered again
after `posthog.reset()`. Agent browsers send no events (`agent-browser.ts`).
The two admin account ids and `agent-` distinct ids are dropped by
`pulseProdFilter` in `src/lib/server/analytics/hogql-shared.ts`.

**Dev hosts.** Dev builds capture nothing; `pulseProdFilter` also drops them.

## PostHog project setting

Project settings, "Filter out internal and test users". PostHog keeps an event
only when every condition holds:

| Property type | Property      | Operator   | Value                 |
| ------------- | ------------- | ---------- | --------------------- |
| Event         | `is_internal` | is not set | (none)                |
| Person        | `is_internal` | is not set | (none)                |
| Person        | `is_admin`    | is not     | `true`                |
| Event         | `$host`       | is not     | `dev.tkaflowarts.com` |

The project filter cannot express "a session with one pageview"; crawlers,
admin ids and `agent-` ids are left to the HogQL. `localhost` stays out of the
table because the Android app serves from it (Capacitor `androidScheme`).

## HogQL: the headline

Paste into a SQL insight. Weeks start on Monday.

```sql
SELECT week, count() AS outside_people_2plus_days
FROM (
  SELECT toStartOfWeek(timestamp, 1) AS week, person_id, uniqExact(toDate(timestamp)) AS active_days
  FROM events
  WHERE timestamp > now() - interval 12 week
    AND properties.$host IN ('tkaflowarts.com', 'www.tkaflowarts.com')
    AND coalesce(toString(properties.is_internal), '') != 'true'
    AND coalesce(toString(person.properties.is_internal), '') != 'true'
    AND coalesce(toString(person.properties.is_admin), '') != 'true'
    AND distinct_id NOT IN ('PBp3GSBO6igCKPwJyLZNmVEmamI3', '8IKsYlGhWxbZDd4ss1bnEZS5eBB3')
    AND distinct_id NOT LIKE 'agent-%'
    AND "$session_id" NOT IN (
      SELECT "$session_id" FROM events
      WHERE timestamp > now() - interval 12 week AND "$session_id" != ''
      GROUP BY "$session_id"
      HAVING countIf(event = '$pageview') = 1
        AND maxIf(1, toString(properties."$is_identified") IN ('true', '1')) = 0
        AND replaceAll(lower(coalesce(argMax(properties."$browser_language", timestamp), '')), '_', '-') = 'zh-cn'
        AND coalesce(argMinIf(properties."$referring_domain", timestamp, event = '$pageview'), '') IN ('', '$direct')
    )
  GROUP BY week, person_id HAVING active_days >= 2
)
GROUP BY week ORDER BY week
```

## HogQL: people who kept something

```sql
SELECT toStartOfWeek(timestamp, 1) AS week,
       uniqExact(person_id) AS people_who_kept,
       uniqExactIf(person_id, properties.kind = 'library_save') AS saved, uniqExactIf(person_id, properties.kind = 'export') AS exported,
       uniqExactIf(person_id, properties.kind = 'share') AS shared, uniqExactIf(person_id, properties.kind = 'publish') AS published
FROM events
WHERE event = 'sequence_kept' AND timestamp > now() - interval 12 week
  AND properties.$host IN ('tkaflowarts.com', 'www.tkaflowarts.com')
  AND coalesce(toString(properties.is_internal), '') != 'true'
  AND coalesce(toString(person.properties.is_internal), '') != 'true'
  AND coalesce(toString(person.properties.is_admin), '') != 'true'
  AND distinct_id NOT IN ('PBp3GSBO6igCKPwJyLZNmVEmamI3', '8IKsYlGhWxbZDd4ss1bnEZS5eBB3')
  AND distinct_id NOT LIKE 'agent-%'
GROUP BY week ORDER BY week
```

`sequence_kept` is sent after the action went through, never on autosave. Its
`kind` is `library_save` (guests included), `export` (image, video, card,
choreo sheet PDF), `share` (copy link, native share) or `publish`.

## Tagging links posted outside the app

Clickable links go to `https://tkaflowarts.com/sequence/<CODE>` or the home
page, tagged in lowercase with `_` like the in-app tags in
`src/lib/shared/share/domain/outbound-link.ts` (`app_share`, `copy_link`).

| Where                | `utm_source` | `utm_medium` | `utm_campaign` | Example                                                                                                |
| -------------------- | ------------ | ------------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| Instagram bio        | `instagram`  | `bio`        | `profile`      | `https://tkaflowarts.com/?utm_source=instagram&utm_medium=bio&utm_campaign=profile`                    |
| Instagram story link | `instagram`  | `story`      | post name      | `https://tkaflowarts.com/sequence/A1F8?utm_source=instagram&utm_medium=story&utm_campaign=level3`      |
| Facebook post        | `facebook`   | `post`       | post name      | `https://tkaflowarts.com/sequence/A1F8?utm_source=facebook&utm_medium=post&utm_campaign=level3`        |
| Email                | `email`      | `newsletter` | send name      | `https://tkaflowarts.com/sequence/A1F8?utm_source=email&utm_medium=newsletter&utm_campaign=nov_update` |
| Printed QR           | none         | none         | none           | `https://tka.run/A1F8`, bare                                                                           |

Instagram captions are not clickable. A code typed from a caption
(`tka.run/A1F8`) carries no tag and no referrer and counts as a card scan.

**Why `tka.run` and QR links stay bare.** A tag on `tka.run/<code>` would
survive the hop (`cloudflare/workers/shortcode-redirect.js` copies every query
parameter onto `/q/<code>`, which reads only its own keys). But `/q/` is the
card-scan route and counts a first visit as a physical scan; it cannot tell a
camera from a click (`src/lib/shared/qr/utils/scan-detection.ts`, and the note
above `buildPostLink` in `src/lib/shared/share/services/post-handoff.ts`).
