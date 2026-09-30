export interface OCDSRelease {
  ocid: string;
  id: string;
  date: string;
  tag: string[];
  initiationType: string;
  parties: Array<{
    id: string;
    name: string;
    identifier?: {
      id: string;
      scheme: string;
    };
    address?: {
      streetAddress: string;
      locality: string;
      postalCode: string;
      countryName: string;
    };
  }>;
  tender?: {
    id: string;
    title: string;
    description: string;
    value?: {
      amount: number;
      currency: string;
    };
    contractPeriod?: {
      startDate: string;
      endDate: string;
    };
    items?: Array<{
      classification?: {
        scheme: string;
        id: string;
      };
    }>;
  };
  awards?: Array<{
    id: string;
    status: string;
    date: string;
    value?: {
      amount: number;
      currency: string;
    };
    suppliers: Array<{
      id: string;
      name: string;
    }>;
    contractPeriod?: {
      startDate: string;
      endDate: string;
    };
  }>;
  contracts?: Array<{
    id: string;
    awardID: string;
    status: string;
  }>;
  releases?: OCDSRelease[];
}

export interface ParsedContract {
  source: "contracts-finder" | "find-a-tender";
  sourceId: string;
  sourceUrl: string;
  title: string;
  description: string;
  buyerName: string;
  buyerPostcode?: string;
  supplierName: string;
  supplierCompaniesHouseNumber?: string;
  supplierAddress?: string;
  cpvCodes: string[];
  valueGbp: number | null;
  awardDate: string;
  startDate?: string;
  endDate?: string;
  deliveryAddresses: string[];
  raw: OCDSRelease;
}

export function parseOCDSRelease(release: OCDSRelease, source: "contracts-finder" | "find-a-tender"): ParsedContract | null {
  if (!release.awards || release.awards.length === 0) {
    return null;
  }

  const award = release.awards[0];
  const tender = release.tender;
  const supplier = award.suppliers?.[0];

  if (!supplier) {
    return null;
  }

  const cpvCodes = tender?.items?.map((item) => item.classification?.id).filter(Boolean) as string[] || [];

  // Find supplier details from parties list
  const supplierParty = release.parties?.find((p) => p.id === supplier.id);

  return {
    source,
    sourceId: release.ocid,
    sourceUrl: "", // Will be populated by ingest functions
    title: tender?.title || "",
    description: tender?.description || "",
    buyerName: release.parties?.[0]?.name || "",
    buyerPostcode: release.parties?.[0]?.address?.postalCode,
    supplierName: supplier.name,
    supplierCompaniesHouseNumber: supplier.id,
    supplierAddress: supplierParty?.address ? `${supplierParty.address.streetAddress}, ${supplierParty.address.locality}, ${supplierParty.address.postalCode}` : undefined,
    cpvCodes,
    valueGbp: award.value?.amount || tender?.value?.amount || null,
    awardDate: award.date,
    startDate: award.contractPeriod?.startDate || tender?.contractPeriod?.startDate,
    endDate: award.contractPeriod?.endDate || tender?.contractPeriod?.endDate,
    deliveryAddresses: [],
    raw: release,
  };
}

export function filterRelevantContracts(contracts: ParsedContract[], minValueGbp: number, cpvPrefixes: string[]): ParsedContract[] {
  return contracts.filter((contract) => {
    const hasRelevantCPV = cpvPrefixes.some((prefix) => contract.cpvCodes.some((code) => code.startsWith(prefix)));
    const meetsValue = contract.valueGbp === null || contract.valueGbp >= minValueGbp;
    return hasRelevantCPV && meetsValue;
  });
}
