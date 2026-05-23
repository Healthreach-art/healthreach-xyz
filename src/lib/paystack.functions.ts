import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VerifyInput = z.object({
  reference: z.string().min(4).max(128),
});

export const verifyPaystackTransaction = createServerFn({ method: "POST" })
  .inputValidator((d) => VerifyInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(data.reference)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; amount?: number; currency?: string; reference?: string };
    };
    if (!res.ok || !json.status) {
      throw new Error(json.message || `Paystack verify failed (${res.status})`);
    }
    const ok = json.data?.status === "success";
    return {
      verified: ok,
      reference: json.data?.reference ?? data.reference,
      amount: (json.data?.amount ?? 0) / 100,
      currency: json.data?.currency ?? "ZAR",
    };
  });
