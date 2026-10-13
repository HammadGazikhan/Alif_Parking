const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrFormatterPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an amount stored in paise as Indian Rupees. */
export function formatINR(paise: number, opts: { precise?: boolean } = {}): string {
  const rupees = paise / 100;
  if (opts.precise || !Number.isInteger(rupees)) {
    return inrFormatterPrecise.format(rupees);
  }
  return inrFormatter.format(rupees);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
