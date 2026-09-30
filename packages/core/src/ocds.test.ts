import { describe, it, expect } from "vitest";
import { parseOCDSRelease, filterRelevantContracts } from "./ocds";

describe("OCDS parsing", () => {
  it("parses a valid OCDS release", () => {
    const release = {
      ocid: "ocds-b5fd17-12345",
      id: "1",
      date: "2024-01-15",
      tag: ["award"],
      initiationType: "tender",
      parties: [
        {
          id: "org-buyer",
          name: "Local Authority",
          address: { streetAddress: "123 Main St", locality: "Leeds", postalCode: "LS1 1AB", countryName: "GB" },
        },
      ],
      tender: {
        id: "tender-1",
        title: "Road Resurfacing Contract",
        description: "A45 resurfacing works",
        value: { amount: 1500000, currency: "GBP" },
        contractPeriod: { startDate: "2024-03-01", endDate: "2024-09-30" },
        items: [{ classification: { scheme: "CPV", id: "45000000" } }],
      },
      awards: [
        {
          id: "award-1",
          status: "active",
          date: "2024-01-15",
          value: { amount: 1500000, currency: "GBP" },
          suppliers: [{ id: "12345678", name: "BuildCorp Ltd" }],
          contractPeriod: { startDate: "2024-03-01", endDate: "2024-09-30" },
        },
      ],
    };

    const result = parseOCDSRelease(release, "contracts-finder");

    expect(result).toBeDefined();
    expect(result!.title).toBe("Road Resurfacing Contract");
    expect(result!.valueGbp).toBe(1500000);
    expect(result!.cpvCodes).toContain("45000000");
  });

  it("returns null for releases without awards", () => {
    const release = {
      ocid: "ocds-b5fd17-no-award",
      id: "1",
      date: "2024-01-15",
      tag: ["planning"],
      initiationType: "tender",
      parties: [],
      awards: [],
    };

    const result = parseOCDSRelease(release, "contracts-finder");
    expect(result).toBeNull();
  });

  it("filters contracts by CPV and value", () => {
    const contracts = [
      {
        source: "contracts-finder" as const,
        sourceId: "1",
        sourceUrl: "",
        title: "Road Works",
        description: "",
        buyerName: "Council",
        supplierName: "BuildCorp",
        cpvCodes: ["45210000"],
        valueGbp: 1000000,
        awardDate: "2024-01-15",
        deliveryAddresses: [],
        raw: {} as any,
      },
      {
        source: "contracts-finder" as const,
        sourceId: "2",
        sourceUrl: "",
        title: "Consulting",
        description: "",
        buyerName: "Council",
        supplierName: "ConsultCorp",
        cpvCodes: ["79000000"],
        valueGbp: 500000,
        awardDate: "2024-01-15",
        deliveryAddresses: [],
        raw: {} as any,
      },
    ];

    const filtered = filterRelevantContracts(contracts, 600000, ["45", "71"]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].supplierName).toBe("BuildCorp");
  });
});
