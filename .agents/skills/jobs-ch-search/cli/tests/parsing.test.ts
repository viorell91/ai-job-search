import { describe, expect, test } from "bun:test"
import {
  extractLdJson,
  parseCardMeta,
  parseJobCards,
  parseJobDetail,
  htmlToText,
  jobageParam,
  normalizeId,
} from "../src/helpers.js"

/** A miniature stand-in for a jobs.ch search page: ld+json plus two cards. */
function searchFixture(): string {
  const ld = [
    { "@context": "https://schema.org", "@type": "WebSite", name: "jobs.ch" },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "JobPosting",
            title: "Data Scientist/ML Engineer",
            identifier: { "@type": "PropertyValue", value: "5cd10373-7316-426d-bc44-8b84a0b59a1d" },
            datePosted: "2026-07-20T13:32:10+02:00",
            employmentType: "Festanstellung",
            hiringOrganization: { "@type": "Organization", name: "Schweizerische Nationalbank", sameAs: "https://www.snb.ch/" },
            // No addressLocality — must fall back to the rendered card.
            jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "CH" } },
            url: "https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/",
          },
        },
        {
          "@type": "ListItem",
          position: 2,
          item: {
            "@type": "JobPosting",
            title: "Senior AI Engineer (w/m/d)",
            identifier: { "@type": "PropertyValue", value: "e8f00166-e837-462a-b646-498358695fbf" },
            datePosted: "2026-07-28T09:00:00+02:00",
            hiringOrganization: { "@type": "Organization", name: "Acme AG" },
            jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Basel", addressCountry: "CH" } },
            url: "https://www.jobs.ch/de/stellenangebote/detail/e8f00166-e837-462a-b646-498358695fbf/",
          },
        },
      ],
    },
  ]

  // NOTE: the `<!-- -->` between label and colon is not decoration — jobs.ch is
  // React-server-rendered and React separates adjacent text nodes with an empty
  // comment, so the live markup really is `Arbeitsort<!-- -->:`. An earlier
  // version of this fixture omitted it, the unit tests passed, and the live run
  // returned a null location for every card. Keep it.
  const card = (id: string, place: string, pensum: string) => `
    <a data-cy="job-link" id="vacancy-link-${id}" href="/de/stellenangebote/detail/${id}/">
      <div data-cy="vacancy-serp-item">
        <div data-cy="serp-item-${id}"><p>Vor 2 Wochen</p></div>
        <div><span class="pos_absolute w_1px">Arbeitsort<!-- -->:</span><p class="textStyle_caption1">${place}</p></div>
        <div><span class="pos_absolute w_1px">Pensum<!-- -->:</span><p class="textStyle_caption1">${pensum}</p></div>
      </div>
    </a>`

  return `<html><head>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    </head><body>
    ${card("5cd10373-7316-426d-bc44-8b84a0b59a1d", "Z&#252;rich", "80 – 100%")}
    ${card("e8f00166-e837-462a-b646-498358695fbf", "Basel", "100%")}
    </body></html>`
}

describe("extractLdJson", () => {
  test("collects objects from array and object blocks", () => {
    const html = `
      <script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script>
      <script type="application/ld+json">{"@type":"C"}</script>`
    expect(extractLdJson(html).map((o) => o["@type"])).toEqual(["A", "B", "C"])
  })

  test("a malformed block does not discard the good ones", () => {
    const html = `
      <script type="application/ld+json">{ this is not json </script>
      <script type="application/ld+json">{"@type":"Good"}</script>`
    expect(extractLdJson(html).map((o) => o["@type"])).toEqual(["Good"])
  })
})

describe("parseCardMeta", () => {
  test("maps job id to its label/value pairs and decodes entities", () => {
    const meta = parseCardMeta(searchFixture())
    expect(meta.get("5cd10373-7316-426d-bc44-8b84a0b59a1d")).toEqual({
      arbeitsort: "Zürich",
      pensum: "80 – 100%",
    })
  })

  test("does not bleed values from the following card", () => {
    const meta = parseCardMeta(searchFixture())
    expect(meta.get("e8f00166-e837-462a-b646-498358695fbf")?.arbeitsort).toBe("Basel")
  })
})

describe("parseJobCards", () => {
  const cards = parseJobCards(searchFixture())

  test("returns one card per ItemList entry", () => {
    expect(cards).toHaveLength(2)
  })

  test("maps the schema.org fields the portal contract requires", () => {
    expect(cards[0]).toMatchObject({
      id: "5cd10373-7316-426d-bc44-8b84a0b59a1d",
      title: "Data Scientist/ML Engineer",
      company: "Schweizerische Nationalbank",
      date: "2026-07-20T13:32:10+02:00",
      employmentType: "Festanstellung",
      url: "https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/",
    })
  })

  test("falls back to the rendered card when ld+json omits the city", () => {
    expect(cards[0].location).toBe("Zürich")
    expect(cards[0].workload).toBe("80 – 100%")
  })

  test("prefers addressLocality when ld+json does carry it", () => {
    expect(cards[1].location).toBe("Basel")
  })

  test("missing values are null, never omitted", () => {
    expect(cards[1].employmentType).toBeNull()
    expect(cards[1].companyUrl).toBeNull()
    expect("workload" in cards[1]).toBe(true)
  })

  test("a page with no ItemList yields an empty array rather than throwing", () => {
    expect(parseJobCards("<html><body>nothing here</body></html>")).toEqual([])
  })
})

describe("parseJobDetail", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Data Scientist/ML Engineer",
    description: "<p>Erste Zeile</p><ul><li>Punkt eins</li><li>Punkt zwei</li></ul>",
    identifier: { "@type": "PropertyValue", value: "5cd10373-7316-426d-bc44-8b84a0b59a1d" },
    datePosted: "2026-07-20T13:32:10+02:00",
    employmentType: "Festanstellung",
    workHours: "33.6 - 42 hours/week",
    employmentUnit: { "@type": "Organization", name: "Fachverantwortung" },
    hiringOrganization: { "@type": "Organization", name: "Schweizerische Nationalbank" },
    jobLocation: { "@type": "Place", address: { addressRegion: "Zürich", addressCountry: "CH" } },
    url: "https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/",
    potentialAction: {
      "@type": "ApplyAction",
      target: { "@type": "EntryPoint", urlTemplate: "https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/apply" },
    },
  })}</script></html>`

  test("extracts the posting into the detail shape", () => {
    const job = parseJobDetail(html, "fallback")!
    expect(job.title).toBe("Data Scientist/ML Engineer")
    expect(job.company).toBe("Schweizerische Nationalbank")
    expect(job.workHours).toBe("33.6 - 42 hours/week")
    expect(job.department).toBe("Fachverantwortung")
    expect(job.applyUrl).toContain("/apply")
  })

  test("falls back to addressRegion when there is no locality", () => {
    expect(parseJobDetail(html, "fallback")!.location).toBe("Zürich")
  })

  test("renders the HTML description as readable text with list breaks", () => {
    const desc = parseJobDetail(html, "fallback")!.description!
    expect(desc).toContain("Erste Zeile")
    expect(desc).toContain("• Punkt eins")
    expect(desc).not.toContain("<")
  })

  test("returns null when the page carries no JobPosting", () => {
    expect(parseJobDetail("<html></html>", "x")).toBeNull()
  })
})

describe("htmlToText", () => {
  test("decodes entities and collapses blank runs", () => {
    expect(htmlToText("<p>caf&#233;</p><p></p><p>bar</p>")).toBe("café\n\nbar")
  })
})

describe("jobageParam", () => {
  test("passes a plain day count through", () => {
    expect(jobageParam(7)).toBe("7")
  })
  test("returns null for the sentinel and for nonsense", () => {
    expect(jobageParam(9999)).toBeNull()
    expect(jobageParam(0)).toBeNull()
    expect(jobageParam(-3)).toBeNull()
  })
})

describe("normalizeId", () => {
  test("accepts a bare UUID", () => {
    expect(normalizeId("5cd10373-7316-426d-bc44-8b84a0b59a1d")).toBe(
      "5cd10373-7316-426d-bc44-8b84a0b59a1d",
    )
  })
  test("accepts a full detail URL", () => {
    expect(
      normalizeId("https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/"),
    ).toBe("5cd10373-7316-426d-bc44-8b84a0b59a1d")
  })
  test("rejects a non-UUID", () => {
    expect(normalizeId("12345")).toBeNull()
  })
})
