/** Demo markers only. There is no processor, no card, and no live charge. */

export type PaymentState = "pay_at_window" | "demo_unpaid" | "demo_marked";

export function paymentLabel(state: PaymentState): string {
  if (state === "demo_unpaid") return "Demo marker: unpaid. This is not a charge and no card was taken.";
  if (state === "demo_marked") return "Demo marker: marked in the test adapter. This is not a payment.";
  return "Pay at the window. No card is stored.";
}

export function parsePaymentChoice(value: unknown): PaymentState | { error: string } {
  if (value === undefined || value === null || value === "" || value === "pay_at_window") return "pay_at_window";
  if (value === "demo_unpaid") return "demo_unpaid";
  if (value === "demo_marked") {
    return { error: "A guest cannot mark the demo adapter. Pay at the window, or choose the unpaid demo marker." };
  }
  return { error: "Payment must be pay at the window or the labeled unpaid demo marker. Cards are not accepted." };
}

/** Staff may only move the unpaid demo marker to the marked demo marker. */
export function staffDemoMark(current: PaymentState): PaymentState | { error: string } {
  if (current === "demo_marked") return "demo_marked";
  if (current === "demo_unpaid") return "demo_marked";
  return { error: "This ticket is pay at the window. The demo adapter cannot mark it paid." };
}
