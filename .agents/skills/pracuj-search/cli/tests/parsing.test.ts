import { describe, expect, test } from "bun:test"
import {
  parseSearchPage,
  parseDetailPage,
  extractNextData,
  findQueryData,
  toCard,
  buildDescription,
  jobageToPeriod,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { normalizeTarget } from "../src/commands/detail.js"

/** Wrap a react-query cache in the __NEXT_DATA__ envelope the site emits. */
function nextDataPage(queries: unknown[]): string {
  const payload = { props: { pageProps: { dehydratedState: { queries } } } }
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    payload,
  )}</script></body></html>`
}

const SEARCH_PAGE = nextDataPage([
  { queryKey: ["seoContent", "Default"], state: { data: { title: "irrelevant" } } },
  {
    queryKey: ["jobOffers", { kw: ["controlling"], pn: 1, rop: 50 }, "Default"],
    state: {
      data: {
        offersTotalCount: 701,
        groupedOffersTotalCount: 538,
        groupedOffers: [
          {
            jobTitle: "Kontroler finansowy (m/k)",
            companyName: "Partex Marking Systems Sp. z o.o.",
            lastPublicated: "2026-08-02T22:00:00Z",
            expirationDate: "2026-09-01T21:59:59Z",
            salaryDisplayText: "",
            isRemoteWorkAllowed: false,
            typesOfContract: ["Umowa o pracę"],
            positionLevels: ["Specjalista / Specjalistka (mid / Regular)"],
            workModes: ["Praca stacjonarna"],
            offers: [
              {
                partitionId: 1005003253,
                offerAbsoluteUri: "https://www.pracuj.pl/praca/kontroler,oferta,1005003253",
                displayWorkplace: "Lubicz Dolny (pow. toruński)",
                isWholePoland: false,
              },
            ],
          },
          {
            jobTitle: "Credit Controller",
            companyName: "Devire",
            lastPublicated: "2026-08-02T06:00:00Z",
            salaryDisplayText: "13 000–15 000 zł brutto / mies.",
            isRemoteWorkAllowed: true,
            offers: [
              {
                partitionId: 1004986216,
                offerAbsoluteUri: "https://www.pracuj.pl/praca/credit,oferta,1004986216",
                displayWorkplace: "Warszawa",
                isWholePoland: false,
              },
              {
                partitionId: 1004986217,
                offerAbsoluteUri: "https://www.pracuj.pl/praca/credit,oferta,1004986217",
                displayWorkplace: "Kraków",
                isWholePoland: false,
              },
            ],
          },
          // Malformed: no offers[] entry, so no id and no URL. Must be skipped.
          { jobTitle: "Ghost role", companyName: "Nowhere", offers: [] },
        ],
      },
    },
  },
])

const DETAIL_PAGE = nextDataPage([
  {
    queryKey: ["jobOffer", "1005003253", "pl"],
    state: {
      data: {
        attributes: {
          jobTitle: "Kontroler finansowy (m/k)",
          displayEmployerName: "Partex Marking Systems Sp. z o.o.",
          salaryDisplayText: "",
          typesOfContract: ["Umowa o pracę"],
          positionLevels: ["Specjalista"],
          workModes: ["Praca stacjonarna"],
          isRemoteWorkAllowed: false,
          workplaces: [{ displayAddress: "Lubicz Dolny", city: "Lubicz Dolny" }],
        },
        publicationDetails: {
          lastPublicated: "2026-08-02T22:00:00Z",
          expirationDate: "2026-09-01T21:59:59Z",
        },
        sections: [
          { sectionType: "responsibilities", title: "Twój zakres obowiązków" },
          { sectionType: "requirements", title: "Nasze wymagania" },
        ],
        textSections: [
          { sectionType: "responsibilities", plainText: "Twój zakres obowiązków, raporty zarządcze" },
          { sectionType: "requirements", plainText: "minimum 5 lat doświadczenia" },
        ],
        aiSummary: "<ul><li>Masz <b>5 lat</b> doświadczenia.</li></ul>",
      },
    },
  },
])

describe("extractNextData / findQueryData", () => {
  test("finds a cache entry by its queryKey head, not by index", () => {
    const next = extractNextData(SEARCH_PAGE)!
    expect(next).not.toBeNull()
    const data = findQueryData(next, "jobOffers") as Record<string, unknown>
    expect(data.offersTotalCount).toBe(701)
  })

  test("returns null when the script tag is absent or malformed", () => {
    expect(extractNextData("<html></html>")).toBeNull()
    expect(
      extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>'),
    ).toBeNull()
  })

  test("returns null for a queryKey that is not present", () => {
    expect(findQueryData(extractNextData(SEARCH_PAGE)!, "nope")).toBeNull()
  })
})

describe("parseSearchPage", () => {
  const parsed = parseSearchPage(SEARCH_PAGE, 1)

  test("keeps the reported total", () => {
    expect(parsed.total).toBe(701)
  })

  test("skips grouped offers with no concrete posting", () => {
    expect(parsed.cards).toHaveLength(2)
  })

  test("maps core fields and takes the id from the first posting", () => {
    expect(parsed.cards[0]).toMatchObject({
      id: "1005003253",
      title: "Kontroler finansowy (m/k)",
      company: "Partex Marking Systems Sp. z o.o.",
      location: "Lubicz Dolny (pow. toruński)",
      date: "2026-08-02",
      deadline: "2026-09-01",
      contractType: "Umowa o pracę",
      remote: false,
    })
  })

  test("treats an empty salary string as no salary", () => {
    expect(parsed.cards[0].salary).toBeNull()
    expect(parsed.cards[1].salary).toBe("13 000–15 000 zł brutto / mies.")
  })

  test("joins the workplaces of a multi-city grouped offer", () => {
    expect(parsed.cards[1].location).toBe("Warszawa, Kraków")
  })

  test("returns empty rather than throwing on a page with no data", () => {
    expect(parseSearchPage("<html></html>", 1)).toMatchObject({ total: null, cards: [] })
  })
})

describe("toCard", () => {
  test("returns null without an offers[] entry", () => {
    expect(toCard({ jobTitle: "X", offers: [] })).toBeNull()
  })
  test("labels a nationwide posting", () => {
    const c = toCard({
      jobTitle: "Remote role",
      offers: [{ partitionId: 1, offerAbsoluteUri: "https://x/y,oferta,1", isWholePoland: true }],
    })
    expect(c?.location).toBe("Cała Polska")
  })
})

describe("buildDescription", () => {
  test("does not repeat a heading the section text already opens with", () => {
    const offer = {
      sections: [{ sectionType: "responsibilities", title: "Twój zakres obowiązków" }],
      textSections: [
        { sectionType: "responsibilities", plainText: "Twój zakres obowiązków, raporty" },
      ],
    }
    const desc = buildDescription(offer)!
    expect(desc.match(/Twój zakres obowiązków/g)).toHaveLength(1)
  })

  test("adds the heading when the text does not carry it", () => {
    const offer = {
      sections: [{ sectionType: "requirements", title: "Nasze wymagania" }],
      textSections: [{ sectionType: "requirements", plainText: "5 lat doświadczenia" }],
    }
    expect(buildDescription(offer)).toBe("Nasze wymagania\n5 lat doświadczenia")
  })

  test("returns null when there are no text sections", () => {
    expect(buildDescription({})).toBeNull()
  })
})

describe("parseDetailPage", () => {
  const job = parseDetailPage(DETAIL_PAGE, "1005003253", "https://www.pracuj.pl/x")!

  test("reads attributes and publication details", () => {
    expect(job).toMatchObject({
      title: "Kontroler finansowy (m/k)",
      company: "Partex Marking Systems Sp. z o.o.",
      location: "Lubicz Dolny",
      date: "2026-08-02",
      deadline: "2026-09-01",
    })
  })

  test("joins the section texts into a description", () => {
    expect(job.description).toContain("raporty zarządcze")
    expect(job.description).toContain("5 lat")
  })

  test("strips HTML out of the AI summary", () => {
    expect(job.summary).toBe("Masz 5 lat doświadczenia.")
  })

  test("returns null when the page carries no jobOffer entry", () => {
    expect(parseDetailPage(nextDataPage([]), "1", "https://x")).toBeNull()
    expect(parseDetailPage("<html></html>", "1", "https://x")).toBeNull()
  })
})

describe("jobageToPeriod", () => {
  test("maps onto the site's own period dictionary", () => {
    expect(jobageToPeriod(1)).toBe(1)
    expect(jobageToPeriod(2)).toBe(3)
    expect(jobageToPeriod(7)).toBe(7)
    expect(jobageToPeriod(10)).toBe(14)
    expect(jobageToPeriod(30)).toBe(30)
  })
  test("drops the filter beyond 30 days", () => {
    expect(jobageToPeriod(60)).toBeNull()
    expect(jobageToPeriod(0)).toBeNull()
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, format: "json" as const }

  test("maps flags onto kw / wp / et / pn", () => {
    const url = buildUrl({ ...base, query: "controlling", location: "Warszawa", jobage: 7, page: 2 })
    expect(url).toContain("kw=controlling")
    expect(url).toContain("wp=Warszawa")
    expect(url).toContain("et=7")
    expect(url).toContain("pn=2")
  })

  test("omits pn on page 1 and et when out of range", () => {
    const url = buildUrl({ ...base, query: "x" })
    expect(url).not.toContain("pn=")
    expect(url).not.toContain("et=")
  })
})

describe("normalizeTarget", () => {
  test("extracts the id from a full offer URL and keeps that URL", () => {
    const t = normalizeTarget("https://www.pracuj.pl/praca/kontroler,oferta,1005003253?s=1")
    expect(t).toMatchObject({ id: "1005003253" })
    expect(t?.url).not.toContain("?")
  })

  test("builds a resolvable URL from a bare id", () => {
    expect(normalizeTarget("1005003253")?.url).toContain(",oferta,1005003253")
  })

  test("rejects unrelated input", () => {
    expect(normalizeTarget("https://example.com")).toBeNull()
    expect(normalizeTarget("abc")).toBeNull()
  })
})
