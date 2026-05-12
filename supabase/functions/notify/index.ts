import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: any;
  old_record: any | null;
}

Deno.serve(async (req: Request) => {
  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.type !== "INSERT") return new Response("ok");

  let targetUserId: string | null = null;
  let title = "";
  let body = "";
  let data: Record<string, string> = {};

  if (payload.table === "meetups") {
    const m = payload.record;
    targetUserId = m.receiver_id;

    const { data: proposer } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", m.proposer_id)
      .single();

    title = "Nuevo intercambio";
    body = `@${proposer?.username ?? "alguien"} te propuso un intercambio`;
    data = { meetup_id: m.id };

  } else if (payload.table === "messages") {
    const msg = payload.record;
    const rawBody = (msg.body as string) ?? "";
    const SNAPSHOT_PREFIX = "__TRADE_SNAPSHOT__:";
    let friendlyBody = rawBody.slice(0, 200);

    if (rawBody.startsWith(SNAPSHOT_PREFIX)) {
      try {
        const snap = JSON.parse(rawBody.slice(SNAPSHOT_PREFIX.length));
        if (snap.event === "proposed") {
          return new Response(
            JSON.stringify({ sent: 0, reason: "snapshot proposed dedup" }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        friendlyBody = "Modificó el intercambio";
      } catch {
        return new Response("ok");
      }
    }

    const { data: meetup } = await supabase
      .from("meetups")
      .select("proposer_id, receiver_id")
      .eq("id", msg.meetup_id)
      .single();

    if (!meetup) return new Response("meetup not found", { status: 404 });

    targetUserId = meetup.proposer_id === msg.sender_id
      ? meetup.receiver_id
      : meetup.proposer_id;

    const { data: sender } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", msg.sender_id)
      .single();

    title = `@${sender?.username ?? "Alguien"}`;
    body = friendlyBody;
    data = { meetup_id: msg.meetup_id };

  } else {
    return new Response("ignored table", { status: 200 });
  }

  if (!targetUserId) return new Response("no target", { status: 200 });

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", targetUserId);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no tokens" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const expoMessages = tokens.map((t: { token: string }) => ({
    to: t.token,
    title,
    body,
    data,
    sound: "default",
  }));

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(expoMessages),
  });

  const result = await expoRes.json();
  return new Response(
    JSON.stringify({ sent: expoMessages.length, result }),
    { headers: { "Content-Type": "application/json" } },
  );
});
