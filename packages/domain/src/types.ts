export type DateString = `${number}-${number}-${number}`;

export interface SourceReference {
  key: "internal" | "ttac" | "payam-darousaz";
  label: string;
  role: "pricing" | "reference" | "comparison";
  priority: number;
}

export interface Good {
  id: string;
  internalCode: string;
  barcode: string;
  genericCode: string;
  title: string;
  persianTitle: string;
  englishTitle: string;
  aliases: string[];
  brand: string;
  sellPrice: number;
  tempPrice?: number;
  taxCodes: string[];
  nonPharma: boolean;
  countInPackage: number;
  unitLabel: string;
  packLabel: string;
  dosageForm?: string;
  routeQualifier?: string;
  strengthLabel?: string;
  patientFormLabel?: string;
  packageDescription?: string;
  activeStatus?: "active" | "inactive" | "unknown";
  ttacCode?: string;
  sources: SourceReference[];
}

export interface TaxRateRow {
  date: DateString;
  averageTax: number;
}

export interface TaxData {
  code: string;
  title: string;
  averageTaxes: TaxRateRow[];
}

export interface TechnicalFeeCondition {
  excludeNonPharma?: boolean;
  minimumQuantity?: number;
}

export interface TechnicalFeeRule {
  type: string;
  amount: number;
  effectiveDate: DateString;
  conditions?: TechnicalFeeCondition;
}

export interface Settings {
  taxMultiplier: number;
  roundingRule: "round" | "ceil" | "floor";
  pricePolicy: "sellPriceFirst" | "tempPriceFirst";
  technicalFees: TechnicalFeeRule[];
}

export interface StockSnapshot {
  goodId: string;
  warehouseId: string;
  expDate?: DateString;
  count: number;
  avgCost: number;
}

export interface PricingInput {
  good: Good;
  quantity: number;
  documentDate: DateString;
  includeTechnicalFee: boolean;
  taxMultiplier: number;
  roundingRule: Settings["roundingRule"];
  taxData: TaxData | null;
  technicalFeeRules: TechnicalFeeRule[];
  avgCost: number | null;
}
