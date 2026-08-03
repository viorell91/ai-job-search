import { describe, expect, test } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  parseTotalCount,
  normalizeGermanDate,
  ageInDays,
  classifyPills,
  slugify,
  extractJobPostingLd,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { normalizeId } from "../src/commands/detail.js"

// Trimmed from a real karriere.at results page (August 2026).
const SEARCH_FIXTURE = `
<span>1.578 Controlling Jobs</span>
<ol class="m-jobsList">
<li class="m-jobsList__item">
  <h2 class="m-jobsListItem__title">
    <a class="m-jobsListItem__titleLink" href="https://www.karriere.at/jobs/7710443" target="_blank">Risikomanager:in für Risikocontrolling (m/w/d)</a>
  </h2>
  <div class="m-jobsListItem__company">
    <a class="m-jobsListItem__companyName m-jobsListItem__companyName--link" href="/f/hypo">HYPO Ober&#246;sterreich</a>
  </div>
  <span class="m-jobsListItem__date">vor 4 Tagen ver&#246;ffentlicht</span>
  <span class="m-jobsListItem__locations m-jobsListItem__pill">
    <a class="m-jobsListItem__location" data-location="bregenz" href="/jobs/bregenz">Bregenz<span class="m-jobsListItem__location--lastComma">, </span></a>
    <a class="m-jobsListItem__location" data-location="wien" href="/jobs/wien">Wien</a>
  </span>
  <span class="m-jobsListItem__pill">Vollzeit</span>
  <span class="m-jobsListItem__pill"> Homeoffice </span>
  <span class="m-jobsListItem__pill">55.000 &#8364; &#8211; 75.000 &#8364; j&#228;hrlich</span>
</li>
<li class="m-jobsList__item">
  <h2 class="m-jobsListItem__title">
    <a class="m-jobsListItem__titleLink" href="https://www.karriere.at/jobs/10026341">Head of Group Controlling (w/m/d)</a>
  </h2>
  <div class="m-jobsListItem__company">
    <a class="m-jobsListItem__companyName" href="/f/ubm">UBM Development AG</a>
  </div>
  <span class="m-jobsListItem__date">Gestern ver&#246;ffentlicht</span>
  <span class="m-jobsListItem__pill"><a class="m-jobsListItem__location" href="/jobs/wien">Wien</a></span>
  <span class="m-jobsListItem__pill">Teilzeit</span>
</li>
<li class="m-jobsList__item">
  <!-- malformed: no title link, must be skipped -->
  <div class="m-jobsListItem__company"><a class="m-jobsListItem__companyName" href="/f/x">Ghost GmbH</a></div>
</li>
</ol>
`

const DETAIL_FIXTURE = `
<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">{ not valid json </script>
<script type="application/ld+json">{
  "@context":"https://schema.org","@type":"JobPosting",
  "title":"Risikomanager:in (m/w/d)",
  "description":"<h1>Rolle</h1>\\n<p>Quantifizierung<br />ICAAP</p><ul><li>Homeoffice möglich</li></ul>",
  "datePosted":"2026-08-01T05:30:07+02:00",
  "validThrough":"2026-09-30T23:59:59+02:00",
  "employmentType":["FULL_TIME"],
  "jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Linz","addressRegion":"Oberösterreich","addressCountry":"AT"}}],
  "identifier":{"@type":"PropertyValue","name":"karriere.at","value":"7710443"},
  "baseSalary":{"@type":"MonetaryAmount","currency":"EUR","value":{"@type":"QuantitativeValue","unitText":"YEAR","minValue":55000,"maxValue":75000}},
  "hiringOrganization":{"@type":"Organization","name":"HYPO Oberösterreich"}
}</script>
</head><body></body></html>
`

describe("parseJobCards", () => {
  const cards = parseJobCards(SEARCH_FIXTURE, new Date("2026-08-03T12:00:00Z"))

  test("parses well-formed cards and skips the malformed one", () => {
    expect(cards).toHaveLength(2)
  })

  test("extracts id, title and company with entities decoded", () => {
    expect(cards[0]).toMatchObject({
      id: "7710443",
      title: "Risikomanager:in für Risikocontrolling (m/w/d)",
      company: "HYPO Oberösterreich",
    })
  })

  test("joins multiple locations without a stray space before the comma", () => {
    expect(cards[0].location).toBe("Bregenz, Wien")
  })

  test("resolves relative German dates", () => {
    expect(cards[0].date).toBe("2026-07-30")
    expect(cards[1].date).toBe("2026-08-02")
  })

  test("classifies pills into employment type, salary and home office", () => {
    expect(cards[0].employmentType).toBe("Vollzeit")
    expect(cards[0].salary).toContain("55.000")
    expect(cards[0].homeOffice).toBe(true)
    expect(cards[1].homeOffice).toBe(false)
    expect(cards[1].salary).toBeNull()
  })

  test("returns an empty list on junk input", () => {
    expect(parseJobCards("<html><body>nothing</body></html>")).toEqual([])
  })
})

describe("parseTotalCount", () => {
  test("parses a dotted thousands separator", () => {
    expect(parseTotalCount(SEARCH_FIXTURE)).toBe(1578)
  })
  test("returns null when absent", () => {
    expect(parseTotalCount("<p>nope</p>")).toBeNull()
  })
})

describe("extractJobPostingLd", () => {
  test("skips non-JobPosting and malformed blocks to find the right one", () => {
    const ld = extractJobPostingLd(DETAIL_FIXTURE)
    expect(ld).not.toBeNull()
    expect(ld?.title).toBe("Risikomanager:in (m/w/d)")
  })

  test("returns null when there is no JobPosting block", () => {
    expect(extractJobPostingLd("<html></html>")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_FIXTURE, "7710443")

  test("reads the core fields from JSON-LD", () => {
    expect(job).toMatchObject({
      title: "Risikomanager:in (m/w/d)",
      company: "HYPO Oberösterreich",
      location: "Linz",
      region: "Oberösterreich",
      employmentType: "FULL_TIME",
    })
  })

  test("truncates timestamps to plain ISO dates", () => {
    expect(job.date).toBe("2026-08-01")
    expect(job.validThrough).toBe("2026-09-30")
  })

  test("formats the structured salary range", () => {
    expect(job.salary).toBe("55,000–75,000 EUR yearly")
  })

  test("converts the HTML description to text with block breaks", () => {
    expect(job.description).toContain("Quantifizierung")
    expect(job.description).not.toContain("<br")
  })

  test("degrades gracefully when the page has no JSON-LD", () => {
    const empty = parseJobDetail("<html></html>", "1")
    expect(empty.title).toBe("(untitled)")
    expect(empty.url).toBe("https://www.karriere.at/jobs/1")
  })
})

describe("normalizeGermanDate", () => {
  const today = new Date("2026-08-03T12:00:00Z")
  test("handles Heute / Gestern / vor N Tagen", () => {
    expect(normalizeGermanDate("Heute veröffentlicht", today)).toBe("2026-08-03")
    expect(normalizeGermanDate("Gestern veröffentlicht", today)).toBe("2026-08-02")
    expect(normalizeGermanDate("vor 4 Tagen veröffentlicht", today)).toBe("2026-07-30")
  })
  test("handles absolute d.m.yyyy dates", () => {
    expect(normalizeGermanDate("22.7.2026", today)).toBe("2026-07-22")
  })
  test("returns null for anything else", () => {
    expect(normalizeGermanDate("demnächst", today)).toBeNull()
  })
})

describe("ageInDays", () => {
  const today = new Date("2026-08-03T12:00:00Z")
  test("counts whole days back", () => {
    expect(ageInDays("2026-08-03", today)).toBe(0)
    expect(ageInDays("2026-07-30", today)).toBe(4)
  })
  test("returns null for missing or unparseable dates", () => {
    expect(ageInDays(null, today)).toBeNull()
    expect(ageInDays("not-a-date", today)).toBeNull()
  })
})

describe("classifyPills", () => {
  test("prefers the first salary and employment pill it sees", () => {
    const r = classifyPills(["Vollzeit, Teilzeit", "Homeoffice", "ab 4.000 € monatlich"])
    expect(r).toEqual({
      employmentType: "Vollzeit, Teilzeit",
      salary: "ab 4.000 € monatlich",
      homeOffice: true,
    })
  })
  test("ignores empty pills", () => {
    expect(classifyPills(["", "  "])).toEqual({
      employmentType: null,
      salary: null,
      homeOffice: false,
    })
  })
})

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("Financial Analyst")).toBe("financial-analyst")
  })
  test("keeps umlauts (karriere.at slugs are not folded)", () => {
    expect(slugify("Bürokauffrau")).toBe("bürokauffrau")
  })
  test("drops punctuation", () => {
    expect(slugify("Controller (m/w/d)")).toBe("controller-mwd")
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, format: "json" as const }

  test("puts keyword and location in the path", () => {
    expect(buildUrl({ ...base, query: "Financial Analyst", location: "Wien" })).toBe(
      "https://www.karriere.at/jobs/financial-analyst/wien",
    )
  })

  test("works with a keyword alone", () => {
    expect(buildUrl({ ...base, query: "Controlling" })).toBe(
      "https://www.karriere.at/jobs/controlling",
    )
  })

  test("appends page only beyond page 1", () => {
    expect(buildUrl({ ...base, query: "x", page: 2 })).toContain("?page=2")
    expect(buildUrl({ ...base, query: "x" })).not.toContain("page=")
  })
})

describe("normalizeId", () => {
  test("accepts a bare id and a full URL", () => {
    expect(normalizeId("7710443")).toBe("7710443")
    expect(normalizeId("https://www.karriere.at/jobs/7710443")).toBe("7710443")
  })
  test("rejects a search URL with no job id", () => {
    expect(normalizeId("https://www.karriere.at/jobs/controlling")).toBeNull()
  })
})
