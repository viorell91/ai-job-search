import { describe, expect, test } from "bun:test"
import {
  parsePage,
  toCard,
  toDetail,
  formatSalary,
  formatBenefits,
  htmlToText,
  matchesQuery,
  matchesLocation,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { normalizeId } from "../src/commands/detail.js"

// Trimmed from a real /api/offers response (August 2026).
const OFFER = {
  id: 106485,
  name: "Influencer & Content marketer pro health-tech startup",
  description: "<p>Miluješ&nbsp;<strong>marketing</strong>?</p><ul><li>Controlling zkušenost</li></ul>",
  url: "/nabidka/106485/influencer-content-marketer",
  company: "Elonga",
  locations: "Praha",
  shifts: "Full-time",
  areaNames: ["Content specialista", "Marketing"],
  mainAreaName: "Content specialista",
  seniorities: ["junior", "senior", "medior"],
  benefits: [8, 19, 20],
  collaborations: "Freelance, Pracovní smlouva",
  isRemote: true,
  salary: { max: 100000, min: 60000, measure: "monthly", currency: "CZK" },
}

const OFFER_BRNO = {
  id: 200001,
  name: "Financial Controller",
  description: "<p>Reporting a rozpočty</p>",
  url: "/nabidka/200001/financial-controller",
  company: "Brno Ventures",
  locations: "Brno",
  areaNames: ["Finance"],
  seniorities: ["senior"],
  isRemote: false,
  salary: { min: 80000, measure: "monthly", currency: "CZK" },
}

const PAGE_BODY = {
  resultSet: [OFFER, OFFER_BRNO, { id: null, name: "" }],
  resultCount: 410,
  paginator: { current: 1, max: 21 },
}

describe("parsePage", () => {
  test("reads offers, total and pagination bound", () => {
    const p = parsePage(PAGE_BODY)
    expect(p.offers).toHaveLength(3)
    expect(p.totalCount).toBe(410)
    expect(p.maxPage).toBe(21)
  })

  test("degrades to empty on an unexpected body", () => {
    expect(parsePage(null)).toMatchObject({ offers: [], totalCount: null, maxPage: null })
    expect(parsePage({ resultSet: "nope" }).offers).toEqual([])
  })
})

describe("toCard", () => {
  const card = toCard(OFFER)!

  test("maps the core fields", () => {
    expect(card).toMatchObject({
      id: "106485",
      title: "Influencer & Content marketer pro health-tech startup",
      company: "Elonga",
      location: "Praha",
      seniority: "junior, senior, medior",
      areas: "Content specialista, Marketing",
      employmentType: "Full-time",
      remote: true,
    })
  })

  test("absolutises the relative offer URL", () => {
    expect(card.url).toBe("https://www.startupjobs.cz/nabidka/106485/influencer-content-marketer")
  })

  test("date is always null — the API exposes none", () => {
    expect(card.date).toBeNull()
  })

  test("rejects an offer with no id or title", () => {
    expect(toCard({ id: null, name: "" })).toBeNull()
    expect(toCard({ id: 1 })).toBeNull()
  })
})

describe("formatSalary", () => {
  test("renders a min–max monthly range", () => {
    expect(formatSalary(OFFER.salary)).toBe("60,000–100,000 CZK / month")
  })
  test("renders an open-ended minimum", () => {
    expect(formatSalary(OFFER_BRNO.salary)).toBe("from 80,000 CZK / month")
  })
  test("returns null when no figures are given", () => {
    expect(formatSalary({ currency: "CZK", measure: "monthly" })).toBeNull()
    expect(formatSalary(null)).toBeNull()
  })
})

describe("formatBenefits", () => {
  test("suppresses opaque numeric benefit IDs", () => {
    expect(formatBenefits([8, 19, 20])).toBeNull()
  })
  test("keeps real labels", () => {
    expect(formatBenefits(["Sick days", "MultiSport"])).toBe("Sick days, MultiSport")
  })
  test("returns null for an empty list", () => {
    expect(formatBenefits([])).toBeNull()
  })
})

describe("htmlToText", () => {
  test("strips markup and decodes entities", () => {
    const text = htmlToText(OFFER.description)!
    expect(text).toContain("marketing")
    expect(text).not.toContain("<strong>")
    expect(text).not.toContain("&nbsp;")
  })
  test("returns null for empty input", () => {
    expect(htmlToText(null)).toBeNull()
  })
})

describe("matchesQuery", () => {
  test("matches on the description, not just the title", () => {
    expect(matchesQuery(OFFER, "controlling")).toBe(true)
  })
  test("matches on company and area tags", () => {
    expect(matchesQuery(OFFER, "Elonga")).toBe(true)
    expect(matchesQuery(OFFER, "marketing")).toBe(true)
  })
  test("requires every term (AND, not OR)", () => {
    expect(matchesQuery(OFFER, "marketing startup")).toBe(true)
    expect(matchesQuery(OFFER, "marketing accounting")).toBe(false)
  })
  test("ignores case and diacritics", () => {
    expect(matchesQuery(OFFER, "MILUJES")).toBe(true)
  })
  test("an empty query matches everything", () => {
    expect(matchesQuery(OFFER, undefined)).toBe(true)
    expect(matchesQuery(OFFER, "   ")).toBe(true)
  })
})

describe("matchesLocation", () => {
  test("matches the offer's own city, diacritics folded", () => {
    expect(matchesLocation(OFFER_BRNO, "Brno")).toBe(true)
    expect(matchesLocation(OFFER_BRNO, "brno")).toBe(true)
    expect(matchesLocation(OFFER_BRNO, "Praha")).toBe(false)
  })
  test("a remote offer matches any location", () => {
    expect(matchesLocation(OFFER, "Ostrava")).toBe(true)
  })
  test("no location filter matches everything", () => {
    expect(matchesLocation(OFFER_BRNO, undefined)).toBe(true)
  })
})

describe("toDetail", () => {
  const job = toDetail(OFFER)!
  test("adds description and collaboration on top of the card", () => {
    expect(job.description).toContain("Controlling")
    expect(job.collaboration).toBe("Freelance, Pracovní smlouva")
  })
  test("does not emit meaningless benefit IDs", () => {
    expect(job.benefits).toBeNull()
  })
})

describe("buildUrl", () => {
  test("omits the page param on page 1", () => {
    expect(buildUrl(1)).toBe("https://www.startupjobs.cz/api/offers")
    expect(buildUrl(3)).toBe("https://www.startupjobs.cz/api/offers?page=3")
  })
})

describe("normalizeId", () => {
  test("accepts a bare id and an offer URL", () => {
    expect(normalizeId("106485")).toBe("106485")
    expect(normalizeId("https://www.startupjobs.cz/nabidka/106485/some-slug")).toBe("106485")
  })
  test("rejects unrelated input", () => {
    expect(normalizeId("https://example.com")).toBeNull()
    expect(normalizeId("abc")).toBeNull()
  })
})
