import { describe, expect, test } from "bun:test"
import {
  parseJobCards,
  parseJobDetail,
  htmlToText,
  slugify,
  searchPath,
  normalizeId,
} from "../src/helpers.js"

/** Mirrors the real list markup, including the duplicate paid slot. */
function listFixture(): string {
  const card = (
    id: string,
    uuid: string,
    title: string,
    company: string,
    place: string,
    tags: string[],
  ) => `
    <li class="job-list-item " data-job-id="${id}" data-job-detail-url="/de/job/${uuid}/" data-offer-id="jbs_0">
      <div class="upper-line">
        <a href="/de/job/${uuid}/" class="job-link-detail job-title" title="${title}">${title}</a>
      </div>
      <p class="job-attributes"> <span>${company}</span> , <span>${place}</span> </p>
      <div class="lower-line new"><div class="job-tags"><ul>
        ${tags.map((t) => `<li><span class="tag tag-readonly">${t}</span></li>`).join("")}
      </ul></div><p class="job-date"> New </p></div>
    </li>`

  return `<ul>
    ${card("10287453", "edf7b154-1299-4ac1-8ae0-3a3245d45135", "Stahlbaukonstrukteur (m/w) 80-100%", "yellowshark", "Aarau", ["Top Listing", "100%", "Personaldienstleister"])}
    ${card("10320307", "1fab7040-d2f2-45b0-9052-2a4a63417b6e", "Betriebselektriker (m/w)", "yellowshark", "M&#252;nchenstein", ["80% - 100%", "KMU"])}
    ${card("10287453", "edf7b154-1299-4ac1-8ae0-3a3245d45135", "Stahlbaukonstrukteur (m/w) 80-100%", "yellowshark", "Aarau", ["Sponsored", "100%"])}
  </ul>`
}

describe("parseJobCards", () => {
  const cards = parseJobCards(listFixture())

  test("de-duplicates the paid slot that repeats in the organic list", () => {
    // The fixture has three <li> entries but only two distinct postings — the
    // portal renders a promoted job again further down the same page.
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.id)).toEqual(["10287453", "10320307"])
  })

  test("maps the fields the portal contract requires", () => {
    expect(cards[0]).toMatchObject({
      id: "10287453",
      title: "Stahlbaukonstrukteur (m/w) 80-100%",
      company: "yellowshark",
      location: "Aarau",
      workload: "100%",
      url: "https://www.jobscout24.ch/de/job/edf7b154-1299-4ac1-8ae0-3a3245d45135/",
    })
  })

  test("flags promoted listings so they can be down-ranked", () => {
    expect(cards[0].promoted).toBe(true)
    expect(cards[1].promoted).toBe(false)
  })

  test("decodes entities in the location", () => {
    expect(cards[1].location).toBe("Münchenstein")
  })

  test("date is null because the list shows a badge, not a date", () => {
    expect(cards[0].date).toBeNull()
  })

  test("picks the percentage tag as workload, not the company-type tag", () => {
    expect(cards[1].workload).toBe("80% - 100%")
  })

  test("a page with no cards yields an empty array rather than throwing", () => {
    expect(parseJobCards("<html><body>nothing</body></html>")).toEqual([])
  })
})

describe("slugify / searchPath", () => {
  // Search on this portal is path-based. `?q=` returns 200 and is then ignored
  // outright — /de/jobs/?q=machine+learning comes back full of nursing jobs —
  // so these four shapes are the entire search surface.
  test("keyword only", () => {
    expect(searchPath("Machine Learning")).toBe("/de/jobs/machine-learning/")
  })
  test("keyword and city compose into one slug", () => {
    expect(searchPath("Software Engineer", "Basel")).toBe("/de/jobs/software-engineer-in-basel/")
  })
  test("city only", () => {
    expect(searchPath(undefined, "Basel")).toBe("/de/jobs-in-basel/")
  })
  test("neither falls back to the plain listing", () => {
    expect(searchPath()).toBe("/de/jobs/")
    expect(searchPath("  ", "  ")).toBe("/de/jobs/")
  })
  test("lowercases and percent-encodes umlauts", () => {
    expect(searchPath(undefined, "Zürich")).toBe("/de/jobs-in-z%C3%BCrich/")
  })
  test("collapses punctuation rather than emitting empty slug segments", () => {
    expect(slugify("C++ / Data  Engineer")).toBe("c-data-engineer")
  })
})

describe("parseJobDetail", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Stahlbaukonstrukteur (m/w) 80-100%",
    description: " Titel<div>Erste Zeile</div><ul><li>Punkt eins</li></ul>",
    datePosted: "2026-08-05T19:17:00.9730000",
    jobLocation: {
      "@type": "Place",
      address: { addressCountry: "CH", addressLocality: "Aarau", addressRegion: "AG", postalCode: "5000" },
    },
    employmentType: ["FULL_TIME"],
    industry: "Industrie / Produktion",
    occupationalCategory: "Technische Berufe / Ingenieure / Architektur",
    hiringOrganization: { "@type": "Organization", name: "yellowshark" },
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "CHF",
      value: { "@type": "QuantitativeValue", minValue: 75000, maxValue: 90000, unitText: "JAHR" },
    },
  })}</script></html>`

  test("extracts the posting, including the salary band", () => {
    const job = parseJobDetail(html, "10287453")!
    expect(job.company).toBe("yellowshark")
    expect(job.location).toBe("Aarau")
    expect(job.region).toBe("AG")
    expect(job.postalCode).toBe("5000")
    expect(job.salaryMin).toBe(75000)
    expect(job.salaryMax).toBe(90000)
    expect(job.salaryCurrency).toBe("CHF")
    expect(job.salaryUnit).toBe("JAHR")
  })

  test("joins the employmentType array into a string", () => {
    // schema.org allows a list here and this portal always sends one.
    expect(parseJobDetail(html, "x")!.employmentType).toBe("FULL_TIME")
  })

  test("renders the description as readable text with list breaks", () => {
    const desc = parseJobDetail(html, "x")!.description!
    expect(desc).toContain("• Punkt eins")
    expect(desc).not.toContain("<")
  })

  test("returns null when the page carries no JobPosting", () => {
    expect(parseJobDetail("<html></html>", "x")).toBeNull()
  })
})

describe("htmlToText", () => {
  test("preserves paragraph breaks instead of flattening", () => {
    expect(htmlToText("<p>eins</p><p>zwei</p>")).toBe("eins\nzwei")
  })
})

describe("normalizeId", () => {
  test("accepts a numeric list id", () => {
    expect(normalizeId("10287453")).toBe("10287453")
  })
  test("accepts a detail UUID", () => {
    expect(normalizeId("edf7b154-1299-4ac1-8ae0-3a3245d45135")).toBe(
      "edf7b154-1299-4ac1-8ae0-3a3245d45135",
    )
  })
  test("accepts a full detail URL", () => {
    expect(normalizeId("https://www.jobscout24.ch/de/job/10287453/")).toBe("10287453")
  })
  test("rejects junk", () => {
    expect(normalizeId("abc")).toBeNull()
  })
})
