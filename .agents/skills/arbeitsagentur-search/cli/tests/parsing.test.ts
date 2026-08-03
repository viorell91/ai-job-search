import { describe, expect, test } from "bun:test"
import {
  parseSearchResponse,
  parseJobDetail,
  toCard,
  encodeRefnr,
  jobageToPublishedSince,
  workTimeCode,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { normalizeId } from "../src/commands/detail.js"

// Trimmed from real API responses (August 2026).
const SEARCH_BODY = {
  maxErgebnisse: 540,
  page: 1,
  size: 2,
  stellenangebote: [
    {
      beruf: "Leiter/in - Controlling",
      titel: "Leitung Controlling (m/w/d)",
      refnr: "12288-4871151490-S",
      arbeitsort: { plz: "12043", ort: "Berlin", region: "Berlin", land: "Deutschland" },
      arbeitgeber: "Iventa Austria",
      aktuelleVeroeffentlichungsdatum: "2026-07-01",
      eintrittsdatum: "2026-07-31",
      externeUrl: "https://www.persy.jobs/persy/l/job-j5iw3-b",
    },
    {
      beruf: "Betriebswirt/in - Controlling",
      titel: "Controlling (m/w/d)",
      refnr: "10001-1001465523-S",
      arbeitsort: { plz: "10623", ort: "Berlin", region: "Berlin", land: "Deutschland" },
      arbeitgeber: "Musterfirma GmbH",
      aktuelleVeroeffentlichungsdatum: "2026-07-28",
      // The API emits the *string* "null" here rather than a JSON null.
      externeUrl: "null",
    },
    { titel: "", refnr: "" },
  ],
}

const DETAIL_BODY = {
  stellenangebotsart: "ARBEIT",
  stellenangebotsTitel: "Leitung Controlling (m/w/d)",
  stellenangebotsBeschreibung: "Stellenbeschreibung: Iventa wurde exklusiv beauftragt.",
  arbeitszeitVollzeit: "True",
  arbeitszeitTeilzeitFlexibel: "False",
  arbeitszeitSchichtNachtWochenende: "False",
  istGeringfuegigeBeschaeftigung: "False",
  eintrittszeitraum: { von: "2026-07-31" },
  verguetungsangabe: "KEINE_ANGABEN",
  vertragsdauer: "UNBEFRISTET",
  stellenlokationen: [
    { adresse: { plz: "12043", ort: "Berlin", region: "BERLIN", land: "DEUTSCHLAND" } },
  ],
  homeofficemoeglich: "False",
  istArbeitnehmerUeberlassung: "False",
  datumErsteVeroeffentlichung: "2026-07-01",
  externeURL: "https://www.persy.jobs/persy/l/job-j5iw3-b",
  hauptberuf: "Leiter/in - Controlling",
  firma: "Iventa Austria",
  referenznummer: "12288-4871151490-S",
}

// The live v6 payload (2026-08-03). Search rotated v4 -> v6 with every field
// renamed, the results array renamed `stellenangebote` -> `ergebnisliste`, and
// booleans changed from the strings "True"/"False" to real JSON booleans.
const SEARCH_BODY_V6 = {
  maxErgebnisse: 553,
  page: 1,
  size: 2,
  ergebnisliste: [
    {
      stellenangebotsart: "ARBEIT",
      stellenangebotsTitel: "Leitung Controlling (m/w/d)",
      hauptberuf: "Leiter/in - Controlling",
      firma: "Iventa Austria",
      referenznummer: "12288-4871151490-S",
      arbeitszeitVollzeit: true,
      eintrittszeitraum: { von: "2026-07-31" },
      vertragsdauer: "UNBEFRISTET",
      stellenlokationen: [
        { adresse: { plz: "12043", ort: "Berlin", region: "BERLIN", land: "DEUTSCHLAND" } },
      ],
      homeofficemoeglich: false,
      datumErsteVeroeffentlichung: "2026-07-01",
      externeURL: "https://www.persy.jobs/persy/l/job-j5iw3-b",
    },
  ],
}

describe("parseSearchResponse (v6 payload)", () => {
  const parsed = parseSearchResponse(SEARCH_BODY_V6, 1)

  test("reads the renamed ergebnisliste array", () => {
    expect(parsed.cards).toHaveLength(1)
    expect(parsed.total).toBe(553)
  })

  test("maps every renamed field", () => {
    expect(parsed.cards[0]).toMatchObject({
      id: "12288-4871151490-S",
      title: "Leitung Controlling (m/w/d)",
      company: "Iventa Austria",
      occupation: "Leiter/in - Controlling",
      date: "2026-07-01",
      startDate: "2026-07-31",
    })
  })

  test("reads the address out of the nested stellenlokationen array", () => {
    expect(parsed.cards[0].location).toBe("12043 Berlin")
  })

  test("reads the recased externeURL", () => {
    expect(parsed.cards[0].externalUrl).toContain("persy.jobs")
  })
})

describe("parseSearchResponse", () => {
  const parsed = parseSearchResponse(SEARCH_BODY, 1)

  test("keeps the reported total", () => {
    expect(parsed.total).toBe(540)
  })

  test("drops entries with no id or title", () => {
    expect(parsed.cards).toHaveLength(2)
  })

  test("maps the core fields", () => {
    expect(parsed.cards[0]).toMatchObject({
      id: "12288-4871151490-S",
      title: "Leitung Controlling (m/w/d)",
      company: "Iventa Austria",
      date: "2026-07-01",
      occupation: "Leiter/in - Controlling",
      startDate: "2026-07-31",
    })
  })

  test("builds a browsable portal URL from the reference number", () => {
    expect(parsed.cards[0].url).toBe(
      "https://www.arbeitsagentur.de/jobsuche/jobdetail/12288-4871151490-S",
    )
  })

  test('treats the literal string "null" as no external URL', () => {
    expect(parsed.cards[1].externalUrl).toBeNull()
    expect(parsed.cards[0].externalUrl).toContain("persy.jobs")
  })

  test("collapses city+region duplication into one location", () => {
    // region "Berlin" duplicates the city, so the postcode form is used instead.
    expect(parsed.cards[0].location).toBe("12043 Berlin")
  })

  test("survives a body with no offers at all", () => {
    expect(parseSearchResponse({}, 1)).toMatchObject({ total: null, cards: [] })
    expect(parseSearchResponse(null, 1).cards).toEqual([])
  })
})

describe("toCard", () => {
  test("returns null when the reference number is missing", () => {
    expect(toCard({ titel: "No refnr" })).toBeNull()
  })
  test("falls back to the occupation when titel is absent", () => {
    expect(toCard({ refnr: "X-1", beruf: "Controller" })?.title).toBe("Controller")
  })
})

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_BODY, "12288-4871151490-S")

  test("reads title, company and description", () => {
    expect(job.title).toBe("Leitung Controlling (m/w/d)")
    expect(job.company).toBe("Iventa Austria")
    expect(job.description).toContain("exklusiv beauftragt")
  })

  test("decodes the API's string booleans", () => {
    expect(job.homeOffice).toBe(false)
    expect(job.isTempAgency).toBe(false)
  })

  test("summarises working time from the boolean flag set", () => {
    expect(job.employmentType).toBe("Vollzeit")
  })

  test('reports KEINE_ANGABEN as no salary information', () => {
    expect(job.salaryInfo).toBeNull()
  })

  test("reads the start date out of eintrittszeitraum", () => {
    expect(job.startDate).toBe("2026-07-31")
  })

  test("does not throw on an empty body", () => {
    expect(parseJobDetail({}, "X-1").title).toBe("(untitled)")
  })
})

describe("encodeRefnr", () => {
  test("base64-encodes the reference number", () => {
    expect(encodeRefnr("12288-4871151490-S")).toBe("MTIyODgtNDg3MTE1MTQ5MC1T")
  })

  test("percent-encodes base64 characters that are path-significant", () => {
    // btoa("~~~?") => "fn5+Pw==" — contains '+' and '=', both must be escaped.
    const encoded = encodeRefnr("~~~?")
    expect(encoded).not.toContain("+")
    expect(encoded).toContain("%2B")
  })
})

describe("jobageToPublishedSince", () => {
  test("rounds up to the four buckets the portal honours", () => {
    expect(jobageToPublishedSince(1)).toBe(1)
    expect(jobageToPublishedSince(5)).toBe(7)
    expect(jobageToPublishedSince(10)).toBe(14)
    expect(jobageToPublishedSince(28)).toBe(28)
  })

  test("drops the filter outside the supported range", () => {
    expect(jobageToPublishedSince(90)).toBeNull()
    expect(jobageToPublishedSince(0)).toBeNull()
  })
})

describe("workTimeCode", () => {
  test("maps English and German aliases", () => {
    expect(workTimeCode("fulltime")).toBe("vz")
    expect(workTimeCode("Vollzeit")).toBe("vz")
    expect(workTimeCode("parttime")).toBe("tz")
    expect(workTimeCode("shift")).toBe("snw")
  })
  test("ignores unknown modes", () => {
    expect(workTimeCode("remote")).toBeNull()
    expect(workTimeCode(undefined)).toBeNull()
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, size: 25, format: "json" as const }

  test("maps flags onto the API's German parameter names", () => {
    const url = buildUrl({ ...base, query: "Controlling", location: "Berlin", radius: 25 })
    expect(url).toContain("was=Controlling")
    expect(url).toContain("wo=Berlin")
    expect(url).toContain("umkreis=25")
  })

  test("omits the age filter when out of range", () => {
    expect(buildUrl({ ...base, query: "x" })).not.toContain("veroeffentlichtseit")
    expect(buildUrl({ ...base, query: "x", jobage: 7 })).toContain("veroeffentlichtseit=7")
  })

  test("always sends page and size", () => {
    const url = buildUrl({ ...base, page: 3, size: 50 })
    expect(url).toContain("page=3")
    expect(url).toContain("size=50")
  })
})

describe("normalizeId", () => {
  test("accepts a bare reference number", () => {
    expect(normalizeId("12288-4871151490-S")).toBe("12288-4871151490-S")
  })
  test("extracts one from a portal URL", () => {
    expect(normalizeId("https://www.arbeitsagentur.de/jobsuche/jobdetail/12288-4871151490-S")).toBe(
      "12288-4871151490-S",
    )
  })
  test("rejects an unrelated URL", () => {
    expect(normalizeId("https://example.com/jobs")).toBeNull()
  })
  test("rejects empty input", () => {
    expect(normalizeId("   ")).toBeNull()
  })
})
