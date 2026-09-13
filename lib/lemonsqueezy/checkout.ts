import type { PackId } from "@/lib/credits/constants";
import { variantForPack } from "./packs";

/**
 * Creates a hosted checkout and returns its URL.
 *
 * The buyer's Supabase user id rides in checkout_data.custom, which
 * LemonSqueezy echoes back as meta.custom_data on the webhook. That is
 * the only link between a payment and an account, so it is required.
 */
export async function createCheckout(
  packId: PackId,
  userId: string,
  redirectUrl: string,
): Promise<string> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!apiKey) throw new Error("LEMONSQUEEZY_API_KEY is not set");
  if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID is not set");

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: { user_id: userId },
          },
          product_options: { redirect_url: redirectUrl },
        },
        relationships: {
          store: { data: { type: "stores", id: String(storeId) } },
          variant: {
            data: { type: "variants", id: variantForPack(packId) },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LemonSqueezy checkout failed: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    data?: { attributes?: { url?: string } };
  };
  const url = body.data?.attributes?.url;
  if (!url) throw new Error("LemonSqueezy checkout returned no url");

  return url;
}
