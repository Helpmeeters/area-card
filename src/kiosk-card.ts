const RELEASE_TAG = "kiosk-satellite-card";

/**
 * Lovelace type for the installed Kiosk Satellite Card.
 * That plugin's one card is the Redisplay. A locally served build and the
 * old `kiosk-redisplay` name are not used.
 */
export function kioskSatelliteCardType(): string | undefined {
  if (elementDefined(RELEASE_TAG)) return `custom:${RELEASE_TAG}`;
  return undefined;
}

function elementDefined(name: string): boolean {
  if (typeof customElements === "undefined" || typeof customElements.get !== "function") return false;
  return Boolean(customElements.get(name));
}
