import type {
  Good,
  Settings,
  StockSnapshot,
  TaxData
} from "../../../../packages/domain/src/types.ts";

export const goods: Good[] = [
  {
    id: "g-1001",
    internalCode: "INT-1001",
    barcode: "6261001100011",
    genericCode: "GEN-AMOX-500",
    title: "Amoxicillin 500mg Capsule",
    persianTitle: "آموکسی سیلین ۵۰۰ میلی گرم",
    englishTitle: "Amoxicillin 500mg Capsule",
    aliases: ["amoxicillin", "amox", "آموکسی", "آموکسی سیلین"],
    brand: "Daya Darman",
    sellPrice: 185000,
    tempPrice: 179000,
    taxCodes: ["TAX_MED_STANDARD"],
    nonPharma: false,
    countInPackage: 100,
    unitLabel: "capsule",
    packLabel: "box of 100 capsules",
    ttacCode: "TTAC-AMOX-500",
    sources: [
      { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
      { key: "ttac", label: "TTAC", role: "reference", priority: 1 },
      { key: "payam-darousaz", label: "Payam Darousaz", role: "comparison", priority: 2 }
    ]
  },
  {
    id: "g-1002",
    internalCode: "INT-1002",
    barcode: "6261001100028",
    genericCode: "GEN-ADLT-CREAM",
    title: "Adult Protective Cream",
    persianTitle: "کرم محافظ بزرگسال",
    englishTitle: "Adult Protective Cream",
    aliases: ["adult cream", "cream", "کرم", "کرم محافظ"],
    brand: "Dermaline",
    sellPrice: 240000,
    tempPrice: 0,
    taxCodes: ["TAX_COSMETIC"],
    nonPharma: true,
    countInPackage: 1,
    unitLabel: "tube",
    packLabel: "single tube",
    ttacCode: "TTAC-ADLT-CREAM",
    sources: [
      { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
      { key: "ttac", label: "TTAC", role: "reference", priority: 1 },
      { key: "payam-darousaz", label: "Payam Darousaz", role: "comparison", priority: 2 }
    ]
  },
  {
    id: "g-1003",
    internalCode: "INT-1003",
    barcode: "6261001100035",
    genericCode: "GEN-LOS-50",
    title: "Losartan 50mg Tablet",
    persianTitle: "لوزارتان ۵۰ میلی گرم",
    englishTitle: "Losartan 50mg Tablet",
    aliases: ["losartan", "los", "لوزارتان"],
    brand: "Sobhan",
    sellPrice: 96000,
    tempPrice: 93000,
    taxCodes: ["TAX_MED_REDUCED"],
    nonPharma: false,
    countInPackage: 30,
    unitLabel: "tablet",
    packLabel: "box of 30 tablets",
    ttacCode: "TTAC-LOS-50",
    sources: [
      { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
      { key: "ttac", label: "TTAC", role: "reference", priority: 1 },
      { key: "payam-darousaz", label: "Payam Darousaz", role: "comparison", priority: 2 }
    ]
  },
  {
    id: "g-1004",
    internalCode: "INT-1004",
    barcode: "6261001100042",
    genericCode: "GEN-SYR-COUGH",
    title: "Cough Syrup 120ml",
    persianTitle: "شربت سرفه ۱۲۰ میلی لیتر",
    englishTitle: "Cough Syrup 120ml",
    aliases: ["cough syrup", "cough", "شربت سرفه", "سرفه"],
    brand: "Behvazan",
    sellPrice: 128000,
    tempPrice: 0,
    taxCodes: ["TAX_MED_STANDARD"],
    nonPharma: false,
    countInPackage: 1,
    unitLabel: "bottle",
    packLabel: "120ml bottle",
    ttacCode: "TTAC-COUGH-120",
    sources: [
      { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
      { key: "ttac", label: "TTAC", role: "reference", priority: 1 },
      { key: "payam-darousaz", label: "Payam Darousaz", role: "comparison", priority: 2 }
    ]
  },
  {
    id: "g-1005",
    internalCode: "INT-1005",
    barcode: "6261001100059",
    genericCode: "GEN-VIT-D3",
    title: "Vitamin D3 1000 IU",
    persianTitle: "ویتامین د ۳ هزار واحد",
    englishTitle: "Vitamin D3 1000 IU",
    aliases: ["vitamin d", "vit d3", "vit", "ویتامین د", "د ۳"],
    brand: "Zist Takhmir",
    sellPrice: 154000,
    tempPrice: 149000,
    taxCodes: ["TAX_SUPPLEMENT"],
    nonPharma: true,
    countInPackage: 60,
    unitLabel: "softgel",
    packLabel: "box of 60 softgels",
    ttacCode: "TTAC-VIT-D3-1000",
    sources: [
      { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
      { key: "ttac", label: "TTAC", role: "reference", priority: 1 },
      { key: "payam-darousaz", label: "Payam Darousaz", role: "comparison", priority: 2 }
    ]
  }
];

export const taxTables: TaxData[] = [
  {
    code: "TAX_MED_STANDARD",
    title: "Medicine Standard Tax",
    averageTaxes: [
      { date: "2025-01-01", averageTax: 8200 },
      { date: "2026-01-01", averageTax: 9100 }
    ]
  },
  {
    code: "TAX_MED_REDUCED",
    title: "Medicine Reduced Tax",
    averageTaxes: [
      { date: "2025-01-01", averageTax: 4200 },
      { date: "2026-01-01", averageTax: 5100 }
    ]
  },
  {
    code: "TAX_COSMETIC",
    title: "Cosmetic Tax",
    averageTaxes: [
      { date: "2025-01-01", averageTax: 18600 },
      { date: "2026-01-01", averageTax: 21400 }
    ]
  },
  {
    code: "TAX_SUPPLEMENT",
    title: "Supplement Tax",
    averageTaxes: [
      { date: "2025-01-01", averageTax: 9300 },
      { date: "2026-01-01", averageTax: 10800 }
    ]
  }
];

export const stockSnapshots: StockSnapshot[] = [
  {
    goodId: "g-1001",
    warehouseId: "main",
    expDate: "2027-02-01",
    count: 140,
    avgCost: 132000
  },
  {
    goodId: "g-1002",
    warehouseId: "main",
    expDate: "2027-11-01",
    count: 22,
    avgCost: 171000
  },
  {
    goodId: "g-1003",
    warehouseId: "main",
    expDate: "2026-12-15",
    count: 85,
    avgCost: 71000
  },
  {
    goodId: "g-1004",
    warehouseId: "branch-2",
    expDate: "2026-10-01",
    count: 10,
    avgCost: 98000
  }
];

export const settings: Settings = {
  taxMultiplier: 0.75,
  roundingRule: "round",
  pricePolicy: "sellPriceFirst",
  technicalFees: [
    {
      type: "dispense-fee",
      amount: 12000,
      effectiveDate: "2025-01-01",
      conditions: {
        excludeNonPharma: true,
        minimumQuantity: 1
      }
    },
    {
      type: "dispense-fee",
      amount: 15000,
      effectiveDate: "2026-01-01",
      conditions: {
        excludeNonPharma: true,
        minimumQuantity: 1
      }
    }
  ]
};
