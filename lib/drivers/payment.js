// One flat rate, one fixed cycle — this fleet pays every driver the same
// amount on the same 30-day rhythm, no per-driver configuration needed.
export const PAYMENT_AMOUNT = 1000;
export const PAYMENT_CYCLE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// The cycle always counts from the later of "onboarded" or "last paid" —
// marking a payment starts the next 30-day clock instead of drivers
// accumulating a debt of cycles.
export function paymentStatus(driver, now = new Date()) {
  const cycleStart = new Date(driver.last_paid_at || driver.created_at);
  const dueDate = new Date(cycleStart.getTime() + PAYMENT_CYCLE_DAYS * DAY_MS);
  const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);

  return {
    cycleStart,
    dueDate,
    isDue: now.getTime() >= dueDate.getTime(),
    daysRemaining,
    everPaid: Boolean(driver.last_paid_at),
  };
}
