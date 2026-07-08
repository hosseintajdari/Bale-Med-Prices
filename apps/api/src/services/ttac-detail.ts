export function buildTtacDetailUrl(ttacCode) {
  const template = process.env.TTAC_DETAIL_URL_TEMPLATE?.trim();

  if (!template || !ttacCode) {
    return undefined;
  }

  return template.replaceAll("{ttacCode}", encodeURIComponent(ttacCode));
}
