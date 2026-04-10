// Supabase Edge Function — PayPal Webhook
// Env: PAYPAL_WEBHOOK_ID, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
// Table: profiles (paypal_subscription_id, badge, status)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYPAL_API = "https://api-m.paypal.com";

function getSubscriptionId(event: Record<string, unknown>): string | null {
  const resource = event.resource as Record<string, unknown> | undefined;
  if (!resource) return null;
  const id = resource.id ?? resource.subscription_id ?? resource.billing_agreement_id;
  return typeof id === "string" ? id : null;
}

async function verifyWebhook(
  rawBody: string,
  headers: Headers,
  webhookId: string,
  clientId: string,
  clientSecret: string
): Promise<boolean> {
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return false;
  }

  const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) return false;
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) return false;

  const verifyRes = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      transmission_sig: transmissionSig,
      cert_url: certUrl,
      auth_algo: authAlgo,
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!verifyRes.ok) return false;
  const verifyData = await verifyRes.json();
  return verifyData.verification_status === "SUCCESS";
}

async function updateProfile(
  supabase: ReturnType<typeof createClient>,
  subscriptionId: string,
  badge: string,
  subscriptionStatus: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      badge,
      subscription_status: subscriptionStatus,
      status: subscriptionStatus === "suspended" ? "suspended" : "active",
      updated_at: new Date().toISOString()
    })
    .eq("paypal_subscription_id", subscriptionId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "profile_not_found" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const webhookId = Deno.env.get("PAYPAL_WEBHOOK_ID");
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!webhookId || !clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error("Missing env: PAYPAL_WEBHOOK_ID, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isValid = await verifyWebhook(rawBody, req.headers, webhookId, clientId, clientSecret);
  if (!isValid) {
    console.error("PayPal webhook: invalid signature");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = event.event_type as string | undefined;
  const subscriptionId = getSubscriptionId(event);

  if (!subscriptionId) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const handlers: Record<string, { badge: string; subscriptionStatus: string }> = {
    "BILLING.SUBSCRIPTION.ACTIVATED": { badge: "PRO", subscriptionStatus: "premium" },
    "BILLING.SUBSCRIPTION.CANCELLED": { badge: "FREE", subscriptionStatus: "free" },
    "BILLING.SUBSCRIPTION.SUSPENDED": { badge: "FREE", subscriptionStatus: "suspended" },
    "PAYMENT.SALE.COMPLETED": { badge: "PRO", subscriptionStatus: "premium" },
    "PAYMENT.SALE.DENIED": { badge: "FREE", subscriptionStatus: "suspended" },
  };

  const handler = eventType ? handlers[eventType] : null;
  if (!handler) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const paypalEventId = typeof event.id === "string" && event.id.trim() !== "" ? event.id : null;
  if (paypalEventId) {
    const { error: dedupeErr } = await supabase.from("paypal_webhook_events").insert({
      event_id: paypalEventId,
      event_type: eventType ?? null,
    });
    const dup =
      dedupeErr &&
      (dedupeErr.code === "23505" ||
        /duplicate|unique constraint/i.test(dedupeErr.message || ""));
    if (dup) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (dedupeErr) {
      console.error("paypal_webhook_events insert:", dedupeErr);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const result = await updateProfile(supabase, subscriptionId, handler.badge, handler.subscriptionStatus);
  if (!result.ok) {
    console.error("Update profile:", result.error);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
