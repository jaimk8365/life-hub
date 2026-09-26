const API = "https://api.pocketsmith.com/v2";

function json(body, status = 200, origin = "") {
  const headers = {"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"};
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), {status, headers});
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  return origin && origin === env.ALLOWED_ORIGIN ? origin : "";
}

function authorised(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  return supplied === `Bearer ${env.APP_SYNC_TOKEN}`;
}

async function ps(path, env) {
  const response = await fetch(API + path, {
    headers: {"X-Developer-Key": env.POCKETSMITH_DEVELOPER_KEY, "accept":"application/json"}
  });
  if (!response.ok) throw new Error(`PocketSmith request failed (${response.status})`);
  return response.json();
}

async function allTransactions(userId, env, updatedSince) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({page:String(page)});
    if (updatedSince) params.set("updated_since", updatedSince);
    const batch = await ps(`/users/${userId}/transactions?${params}`, env);
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 30) break;
  }
  return out;
}

function normaliseAccount(a) {
  return {
    id:a.id, title:a.title, type:a.type, currencyCode:a.currency_code,
    currentBalance:a.current_balance, currentBalanceDate:a.current_balance_date,
    institution:a.institution?.title || null
  };
}

function normaliseTransaction(t) {
  return {
    id:t.id, date:t.date, amount:t.amount, payee:t.payee,
    type:t.type, status:t.status, needsReview:t.needs_review,
    category:t.category ? {id:t.category.id,title:t.category.title} : null,
    transactionAccountId:t.transaction_account?.id || null,
    updatedAt:t.updated_at || null
  };
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, {status:403});
      return new Response(null, {status:204, headers:{
        "access-control-allow-origin":origin,
        "access-control-allow-methods":"GET, OPTIONS",
        "access-control-allow-headers":"Authorization",
        "access-control-max-age":"600",
        "vary":"Origin"
      }});
    }
    if (!origin) return json({error:"origin_not_allowed"}, 403);
    if (!authorised(request, env)) return json({error:"unauthorised"}, 401, origin);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        const me = await ps("/me", env);
        return json({ok:true, pocketSmithConnected:Boolean(me?.id)}, 200, origin);
      }
      if (url.pathname === "/snapshot") {
        const me = await ps("/me", env);
        const updatedSince = url.searchParams.get("updated_since") || "";
        const [accounts, transactions] = await Promise.all([
          ps(`/users/${me.id}/accounts`, env),
          allTransactions(me.id, env, updatedSince)
        ]);
        return json({
          generatedAt:new Date().toISOString(),
          updatedSince:updatedSince || null,
          accounts:(accounts || []).map(normaliseAccount),
          transactions:transactions.map(normaliseTransaction)
        }, 200, origin);
      }
      return json({error:"not_found"}, 404, origin);
    } catch (error) {
      return json({error:"upstream_error", message:"PocketSmith sync needs attention."}, 502, origin);
    }
  }
};