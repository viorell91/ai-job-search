# Market Conventions: Czech Republic, Austria, Poland, Germany

Application norms differ enough between these four markets that the same CV and cover
letter can read as polished in one and careless in another. This file records what
changes per market. Target markets and their priority order live in
[`markets.md`](../../../markets.md); this file is about *how* to apply, not *where*.

**Applies to:** a business-analytics / data / finance search, documents written in English.
The conventions below are market facts, not candidate facts — they hold whatever the role.

---

## The one rule that spans all four

**Documents are in English, everywhere.** That is the standing policy (see `markets.md`
→ Document language policy). It is normal and accepted at international employers,
shared-service centres, consultancies and scale-ups in all four countries.

Where it is *not* automatically safe: a purely local employer advertising only in the
local language, especially in the Austrian and German Mittelstand and Czech/Polish
public sector. There, flag the mismatch to the user before drafting rather than
applying in English and hoping.

**Never imply a language level the profile does not support.** If a posting implies
German-speaking duties and the profile's German is B1, the cover letter should say so
plainly and offer the honest bridge (willingness to continue learning, English-operating
teams). Inventing fluency is the fastest way to fail a first phone screen.

---

## Photo, date of birth, and personal data

This is the biggest divergence from UK/US convention, and it cuts both ways.

| Market | Photo | Date of birth / nationality | Note |
|---|---|---|---|
| 🇨🇿 Czech Republic | Common, not required | Often included | International employers increasingly drop both |
| 🇦🇹 Austria | **Expected** in a traditional `Lebenslauf` | Commonly included | Omitting is fine at international firms, conspicuous at traditional ones |
| 🇵🇱 Poland | Common | Sometimes | GDPR consent clause historically expected (see below) |
| 🇩🇪 Germany | Traditional but **declining** | Declining | Anti-discrimination guidance pushes against both |

**Default for this repo: no photo, no date of birth.** It suits the English-language,
international-employer end of all four markets, and the stock moderncv template is built
that way. Only revisit if the user is targeting a traditional Austrian or German employer
and asks.

**Poland — the GDPR clause.** Polish applications traditionally carried a data-processing
consent sentence. Since GDPR this is *no longer legally required* for a role the employer
is actively recruiting for, and many employers now state their own clause. Do not add one
by default; add it only if the posting explicitly asks for it, and use the employer's own
wording when they supply it.

---

## What to lead with, by market

- **🇨🇿 Czech Republic** — pragmatic and fast-moving. Lead with concrete deliverables and
  tools. Prague and Brno host large shared-service and finance centres for international
  groups; for those, English fluency and cross-border collaboration are the headline, not
  a liability. Notice periods are typically two months and are asked about early.
- **🇵🇱 Poland** — the largest SSC/BPO finance market of the four, much of it operating in
  English, which is why it sits at P2 for a candidate with no German. Lead with process,
  systems and scale (headcount supported, entities, ERP). Contract form is a first-class
  question, not an afterthought.
- **🇦🇹 Austria** — more formal than Czechia, more credential-conscious. Degrees and formal
  titles carry real weight and should be visible near the top. Vienna concentrates HQ and
  shared-service functions. Expect the salary conversation to be explicit, because ads
  must state pay (below). Most postings are German-language, so screen for
  English-operating employers before investing in a tailored application.
- **🇩🇪 Germany** — the most structure-conscious. Completeness and a gapless chronology
  matter more than elsewhere; unexplained gaps get asked about. Certificates and formal
  qualifications are weighted heavily.

---

## Salary expectations

Handle this differently per market, because the information asymmetry differs.

- **🇦🇹 Austria — pay is published.** Austrian law requires job ads to state at least the
  collective-agreement minimum (`kollektivvertragliches Mindestgehalt`). `karriere-at-search`
  surfaces this as `salary` on most results. Treat `ab X` ("from X") as a floor, not an
  offer — the real range is usually above it, and negotiating up from the stated minimum
  is normal and expected.
- **🇨🇿 Czech Republic** — jobs.cz often omits pay; StartupJobs.cz usually states a
  structured monthly CZK range. Use the StartupJobs data as a sanity check on market rate
  even when applying elsewhere.
- **🇵🇱 Poland** — Pracuj.pl frequently states a range, usually monthly gross (`brutto`).
  **Always check the contract form before comparing figures**: a B2B rate and an
  `umowa o pracę` gross salary are not comparable numbers.
- **🇩🇪 Germany** — public postings rarely state pay; Arbeitsagentur usually returns
  `KEINE_ANGABEN`, which the CLI reports as `null`. Expect to research the range
  separately rather than infer it from the ad.

If asked for an expectation in an application form, give an annual gross figure and name
the currency and the contract form assumed.

---

## Contract form: check it before ranking

Do not treat this as fine print. It changes take-home pay, social security, holiday
entitlement and notice entirely.

- **🇨🇿 Czechia** — `pracovní smlouva` (employment contract) vs. work on a trade licence
  (`IČO` / živnostenský list). Many postings offer both; `startupjobs-search` exposes this
  as `collaboration` and `jobscz-search` as `employmentType`.
- **🇵🇱 Poland** — `umowa o pracę` (employment) vs. **B2B** vs. `umowa zlecenie` (mandate).
  B2B headline rates look much higher because they exclude social security, tax handling
  and paid leave. `pracuj-search` exposes this as `contractType`.
- **🇦🇹 / 🇩🇪** — mostly standard employment; the flag worth catching is
  `Arbeitnehmerüberlassung` (temp-work agency placement), which `arbeitsagentur-search`
  exposes as `isTempAgency`. A large share of Arbeitsagentur listings are posted by
  recruiters (`Personalberatung`) rather than the employer.

Surface the contract form in the fit evaluation whenever the portal provides it, and flag
a B2B-only posting explicitly rather than comparing its rate against employment salaries.

---

## Work authorization

`markets.md` holds the candidate's actual status. Two rules:

1. **Fill it in before relying on `/rank`.** Whether a permit is needed materially changes
   fit, and an unfilled placeholder means the scores are guesses.
2. **Never volunteer permit detail in a cover letter unless it is an advantage.** If the
   candidate needs no permit for the market, one clause ("EU citizen, no permit required")
   removes a real employer worry and is worth including. If a permit *would* be needed,
   that is an interview conversation, not an opening-paragraph disclosure.

---

## Cover letter addressing

- **🇦🇹 / 🇩🇪** — formality is expected. Use the named contact with title where the posting
  gives one; `Sehr geehrte Damen und Herren` is the German-language fallback, but since
  documents here are in English, `Dear Hiring Manager` is correct and not impolite.
- **🇨🇿 / 🇵🇱** — less formal. jobs.cz exposes a named contact person on most postings
  (`contact` in `jobscz-search detail`) — use it. A named addressee reliably beats a
  generic one.

Keep to the one-page limit and the `cover.cls` structure in `06-cover-letter-templates.md`
regardless of market.

---

## Quick reference

| | 🇨🇿 CZ | 🇵🇱 PL | 🇦🇹 AT | 🇩🇪 DE |
|---|---|---|---|---|
| Priority | P1 | P2 | P3 | P4 |
| Doc language | English | English | English | English |
| Posting language | Czech + English | Polish + **much English** | German | German |
| Photo by default | no | no | no | no |
| Pay stated in ads | sometimes | often | **yes, by law** | rarely |
| Contract form varies | yes (IČO) | **yes (B2B)** | no | no |
| Named contact available | usually | sometimes | sometimes | rarely |
| Portal skill | `jobscz-search`, `startupjobs-search` | `pracuj-search` | `karriere-at-search` | `arbeitsagentur-search` |
