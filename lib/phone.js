// Turns whatever was typed into a phone field ("98765 43210", "+91-98765-43210",
// "098765 43210") into the bare international digits WhatsApp and tel: links
// need. Every number in this fleet is Indian, so a 10-digit number gets 91.
// Returns null for anything that doesn't look like a phone number at all.
export function phoneDigits(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

export function telHref(raw) {
  const digits = phoneDigits(raw);
  return digits ? `tel:+${digits}` : null;
}

export function whatsappHref(raw) {
  const digits = phoneDigits(raw);
  return digits ? `https://wa.me/${digits}` : null;
}
