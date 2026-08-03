import { describe, expect, test } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  parseTotalCount,
  normalizeCzechDate,
  parseStatusLabel,
  jobageToDateParam,
  localitySlug,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { normalizeId } from "../src/commands/detail.js"

// Markup below is trimmed from a real jobs.cz results page (August 2026),
// keeping every attribute the parser anchors on.
const SEARCH_FIXTURE = `
<p>Našli jsme <strong>152</strong> nabídek</p>
<article class="SearchResultCard">
  <header class="SearchResultCard__header">
    <h2 data-test-ad-title="HEAD OF CONTROLLING CZ" class="SearchResultCard__title">
      <a data-jobad-id="2001351910" data-link="jd-detail"
         href="https://www.jobs.cz/rpd/2001351910/?searchId=abc&amp;rps=233"
         class="link-primary SearchResultCard__titleLink">HEAD OF CONTROLLING CZ</a>
    </h2>
    <div data-test-ad-status="default" class="SearchResultCard__status">30.&nbsp;července</div>
  </header>
  <ul>
    <li class="SearchResultCard__footerItem"><svg></svg><span translate="no">NEEDle, s.r.o.</span></li>
    <li data-test="serp-locality" class="SearchResultCard__footerItem"><svg></svg>Moravskoslezský kraj</li>
  </ul>
</article>
<article class="SearchResultCard">
  <header class="SearchResultCard__header">
    <h2 data-test-ad-title="Finanční analytik / Controller (m/ž)" class="SearchResultCard__title">
      <a data-jobad-id="2001323929" href="https://www.jobs.cz/rpd/2001323929/"
         class="link-primary SearchResultCard__titleLink">Finanční analytik</a>
    </h2>
    <div data-test-ad-status="default" class="SearchResultCard__status">dnes</div>
  </header>
  <ul>
    <li class="SearchResultCard__footerItem"><span translate="no">Alza.cz a.s.</span></li>
    <li data-test="serp-locality" class="SearchResultCard__footerItem">Praha</li>
  </ul>
</article>
<article class="SearchResultCard">
  <header class="SearchResultCard__header">
    <h2 data-test-ad-title="Senior Consultant" class="SearchResultCard__title">
      <a data-jobad-id="2001111111" href="https://www.jobs.cz/rpd/2001111111/"
         class="link-primary SearchResultCard__titleLink">Senior Consultant</a>
    </h2>
    <div data-test-ad-status="ending" class="SearchResultCard__status">Končí za 3 dny</div>
  </header>
  <ul>
    <li class="SearchResultCard__footerItem"><span translate="no">Deloitte</span></li>
    <li data-test="serp-locality" class="SearchResultCard__footerItem">Praha</li>
  </ul>
</article>
<article class="SearchResultCard">
  <header class="SearchResultCard__header">
    <h2 data-test-ad-title="Treasury Specialist" class="SearchResultCard__title">
      <a data-jobad-id="2001222222" href="https://www.jobs.cz/rpd/2001222222/"
         class="link-primary SearchResultCard__titleLink">Treasury Specialist</a>
    </h2>
    <div data-test-ad-status="promo" class="SearchResultCard__status">Příležitost dne</div>
  </header>
  <ul>
    <li class="SearchResultCard__footerItem"><span translate="no">ČSOB</span></li>
    <li data-test="serp-locality" class="SearchResultCard__footerItem">Praha</li>
  </ul>
</article>
<article class="SearchResultCard">
  <!-- malformed: no job id, must be skipped without breaking the rest -->
  <h2 data-test-ad-title="Broken card">no anchor here</h2>
</article>
`

const DETAIL_FIXTURE = `
<h1 class="typography-heading">HEAD OF CONTROLLING CZ</h1>
<div class="IconWithText" data-test="jd-info-item"><svg></svg>Společnost NEEDle, s.r.o.</div>
<div class="IconWithText" data-test="jd-info-item"><svg></svg>80 000 – 110 000 Kč / měsíc</div>
<div class="IconWithText" data-test="jd-info-item"><svg></svg>Plný úvazek</div>
<a data-test="jd-info-location" href="https://www.mapy.cz/?q=x" class="link-secondary">Moravskoslezský kraj</a>
<div class="mb-900" data-test="jd-header-text"><p>Farkasova International is a&nbsp;leading executive search firm.</p></div>
<div data-test="jd-body-richtext"><p>Vedení controllingu.</p><ul><li>Reporting</li><li>Forecasting</li></ul></div>
<div><a data-test="jd-contact-company" href="https://www.jobs.cz/jof/2001351910/">Kristýna Macounová</a></div>
<footer>site footer</footer>
`

describe("parseJobCards", () => {
  const cards = parseJobCards(SEARCH_FIXTURE, new Date("2026-08-03T12:00:00Z"))

  test("parses every well-formed card and skips malformed ones", () => {
    expect(cards).toHaveLength(4)
  })

  test("extracts id, title, company, location", () => {
    expect(cards[0]).toMatchObject({
      id: "2001351910",
      title: "HEAD OF CONTROLLING CZ",
      company: "NEEDle, s.r.o.",
      location: "Moravskoslezský kraj",
    })
  })

  test("strips tracking params from the detail URL", () => {
    expect(cards[0].url).toBe("https://www.jobs.cz/rpd/2001351910/")
  })

  test("decodes entities in attribute-sourced titles", () => {
    expect(cards[1].title).toBe("Finanční analytik / Controller (m/ž)")
  })

  test("normalises Czech dates to ISO", () => {
    expect(cards[0].date).toBe("2026-07-30")
    expect(cards[1].date).toBe("2026-08-03")
  })

  test("reads a deadline label as a deadline, not a posting date", () => {
    expect(cards[2]).toMatchObject({ title: "Senior Consultant", date: null, deadline: "2026-08-06" })
  })

  test("treats the promo badge as neither a date nor a deadline", () => {
    expect(cards[3]).toMatchObject({ title: "Treasury Specialist", date: null, deadline: null })
  })

  test("returns an empty list rather than throwing on junk input", () => {
    expect(parseJobCards("<html><body>nothing here</body></html>")).toEqual([])
  })
})

describe("parseTotalCount", () => {
  test("reads the reported match count", () => {
    expect(parseTotalCount(SEARCH_FIXTURE)).toBe(152)
  })
  test("returns null when absent", () => {
    expect(parseTotalCount("<p>no count</p>")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_FIXTURE, "2001351910")

  test("extracts the title from h1", () => {
    expect(job.title).toBe("HEAD OF CONTROLLING CZ")
  })

  test("strips the 'Společnost' label off the company name", () => {
    expect(job.company).toBe("NEEDle, s.r.o.")
  })

  test("picks up location, salary and employment type", () => {
    expect(job.location).toBe("Moravskoslezský kraj")
    expect(job.salary).toContain("Kč")
    expect(job.employmentType).toContain("úvazek")
  })

  test("joins intro and body into the description", () => {
    expect(job.description).toContain("executive search firm")
    expect(job.description).toContain("Reporting")
  })

  test("does not leak the site footer into the description", () => {
    expect(job.description).not.toContain("site footer")
  })

  test("captures the contact person", () => {
    expect(job.contact).toBe("Kristýna Macounová")
  })
})

describe("normalizeCzechDate", () => {
  const today = new Date("2026-08-03T12:00:00Z")

  test("handles dnes and včera", () => {
    expect(normalizeCzechDate("dnes", today)).toBe("2026-08-03")
    expect(normalizeCzechDate("včera", today)).toBe("2026-08-02")
  })

  test("handles genitive month names with and without diacritics", () => {
    expect(normalizeCzechDate("30. července", today)).toBe("2026-07-30")
    expect(normalizeCzechDate("1. cervence", today)).toBe("2026-07-01")
  })

  test("rolls a future month back to last year", () => {
    expect(normalizeCzechDate("15. prosince", today)).toBe("2025-12-15")
  })

  test("strips the Aktualizováno / Přidáno prefixes", () => {
    expect(normalizeCzechDate("Aktualizováno včera", today)).toBe("2026-08-02")
    expect(normalizeCzechDate("Přidáno dnes", today)).toBe("2026-08-03")
    expect(normalizeCzechDate("Aktualizováno 28. července", today)).toBe("2026-07-28")
  })

  test("returns null rather than a non-date string", () => {
    expect(normalizeCzechDate("někdy brzy", today)).toBeNull()
  })
})

describe("parseStatusLabel", () => {
  const today = new Date("2026-08-03T12:00:00Z")

  test("splits deadlines out of the shared status slot", () => {
    expect(parseStatusLabel("Končí za 3 dny", today)).toEqual({ date: null, deadline: "2026-08-06" })
    expect(parseStatusLabel("Končí za 1 den", today)).toEqual({ date: null, deadline: "2026-08-04" })
  })

  test("treats an hours-away deadline as closing today", () => {
    expect(parseStatusLabel("Končí za 22 hodin", today)).toEqual({ date: null, deadline: "2026-08-03" })
  })

  test("ignores the promo badge entirely", () => {
    expect(parseStatusLabel("Příležitost dne", today)).toEqual({ date: null, deadline: null })
  })

  test("still reads plain posting dates", () => {
    expect(parseStatusLabel("27. července", today)).toEqual({ date: "2026-07-27", deadline: null })
  })
})

describe("jobageToDateParam", () => {
  test("maps days onto the three buckets the site accepts", () => {
    expect(jobageToDateParam(1)).toBe("24h")
    expect(jobageToDateParam(3)).toBe("3d")
    expect(jobageToDateParam(7)).toBe("7d")
  })

  test("drops the filter outside the supported range", () => {
    // The site silently ignores unsupported values and returns everything —
    // omitting the parameter makes that explicit instead of pretending to filter.
    expect(jobageToDateParam(30)).toBeNull()
    expect(jobageToDateParam(0)).toBeNull()
  })
})

describe("localitySlug", () => {
  test("folds diacritics and hyphenates", () => {
    expect(localitySlug("Praha")).toBe("praha")
    expect(localitySlug("České Budějovice")).toBe("ceske-budejovice")
    expect(localitySlug("Ceske Budejovice")).toBe("ceske-budejovice")
    expect(localitySlug("Ústí nad Labem")).toBe("usti-nad-labem")
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, format: "json" as const }

  test("puts locality in the path, not the query string", () => {
    expect(buildUrl({ ...base, query: "controlling", location: "Praha" })).toBe(
      "https://www.jobs.cz/prace/praha/?q%5B%5D=controlling",
    )
  })

  test("omits locality when not given", () => {
    expect(buildUrl({ ...base, query: "controlling" })).toBe(
      "https://www.jobs.cz/prace/?q%5B%5D=controlling",
    )
  })

  test("adds date and page when relevant", () => {
    const url = buildUrl({ ...base, query: "x", jobage: 7, page: 2 })
    expect(url).toContain("date=7d")
    expect(url).toContain("page=2")
  })

  test("omits page=1", () => {
    expect(buildUrl({ ...base, query: "x" })).not.toContain("page=")
  })
})

describe("normalizeId", () => {
  test("accepts a bare id", () => {
    expect(normalizeId("2001351910")).toBe("2001351910")
  })
  test("accepts rpd and jof URLs", () => {
    expect(normalizeId("https://www.jobs.cz/rpd/2001351910/?searchId=x")).toBe("2001351910")
    expect(normalizeId("https://www.jobs.cz/jof/2001351910/")).toBe("2001351910")
  })
  test("rejects input with no id", () => {
    expect(normalizeId("https://www.jobs.cz/prace/praha/")).toBeNull()
  })
})
