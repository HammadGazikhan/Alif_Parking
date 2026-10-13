/** `mh 12-ab 1234` -> `MH12AB1234` */
export function normalizeVehicleNumber(input: string): string {
  return input.replace(/[\s\-.]/g, "").toUpperCase();
}

export const VEHICLE_NUMBER_PATTERN = /^[A-Z0-9]{4,12}$/;
