import { readFileSync, writeFileSync } from "node:fs";

let code = readFileSync("src/catalog-resolver.js", "utf8");

// 1. normalizeText punctuation
code = code.replace(
  `s = s.replace(/[\\(\\)\\[\\]\\{\\}\\/\\\\,;:\\-_+]/g, " ");`,
  `s = s.replace(/[()[\\]{}/\\\\,;:\\-_+!?.،؛؟"'~@#$%^&*=<>\u060C\u061B\u061F\u066A]/g, " ");`
);

// 2. empty check in scoreCandidate
code = code.replace(
  `if (!normQuery && !cleanCodeQuery) return 0;`,
  `if (!normQuery || normQuery.length === 0) return 0;`
);

// 3. generic token rejection after code matching
const codeMatchMarker = `  // Code Prefix Match (0.80)
  if (cleanCodeQuery && cleanCodeQuery.length >= 3) {
    if (genericCode.startsWith(cleanCodeQuery) || brandCode.startsWith(cleanCodeQuery)) {
      return 0.80;
    }
  }`;

const genericRejection = `  // Code Prefix Match (0.80)
  if (cleanCodeQuery && cleanCodeQuery.length >= 3) {
    if (genericCode.startsWith(cleanCodeQuery) || brandCode.startsWith(cleanCodeQuery)) {
      return 0.80;
    }
  }

  const queryTokens = normQuery.split(" ").filter((t) => t.length > 0);
  const isAllGeneric =
    queryTokens.length > 0 &&
    queryTokens.every(
      (t) => GENERIC_MEASURE_OR_STOP_TOKENS.has(t) || /^\\d+$/.test(t)
    );
  if (isAllGeneric) return 0;`;

code = code.replace(codeMatchMarker, genericRejection);

// 4. Remove duplicate queryTokens declaration in Tier 4
code = code.replace(
  `  // 4. Multi-Token Overlap & Attribute Boosting (Tier 4)\n  const queryTokens = normQuery.split(" ").filter((t) => t.length > 0);`,
  `  // 4. Multi-Token Overlap & Attribute Boosting (Tier 4)`
);

// 5. Tier 3 prefix match
code = code.replace(
  `if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;`,
  `if (normQuery.length >= 3 && !GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery) && (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery))) return 0.90;`
);

// 6. Tier 5 substring match
const oldTier5 = `  // 5. Substring Containment (Tier 5)
  if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
    const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
    const subScore = 0.50 + 0.30 * lenRatio;
    return Math.round(subScore * 100) / 100;
  }`;

const newTier5 = `  // 5. Substring Containment (Tier 5)
  const hasSubstantiveToken = queryTokens.some(
    (t) => !GENERIC_MEASURE_OR_STOP_TOKENS.has(t) && !/^\\d+$/.test(t)
  );
  if (normQuery.length >= 3 && hasSubstantiveToken) {
    if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
      const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
      const subScore = 0.50 + 0.30 * lenRatio;
      return Math.round(subScore * 100) / 100;
    }
  }`;

code = code.replace(oldTier5, newTier5);

// 7. searchCatalog empty query check
const oldSearchStart = `  if (!query || typeof query !== "string" || !query.trim()) {
    return [];
  }`;
const newSearchStart = `  if (!query || typeof query !== "string" || !query.trim()) {
    return [];
  }
  const normQ = normalizeText(query);
  if (!normQ || normQ.length === 0) {
    return [];
  }`;

code = code.replace(oldSearchStart, newSearchStart);

writeFileSync("/tmp/catalog-resolver-mod.js", code);
console.log("Successfully rebuilt /tmp/catalog-resolver-mod.js");
