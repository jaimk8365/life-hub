const API = "https://api.pocketsmith.com/v2";

function json(body, status = 200, origin = "") {
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };

  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return "";

  const configured = String(env.ALLOWED_ORIGIN || "").replace(/\/+$/, "");
  const current = origin.replace(/\/+$/, "");

  // Primary allow-list comes from Cloudflare. The GitHub Pages origin is also
  // accepted explicitly so an accidental trailing slash in the variable
  // cannot break the installed Finance app.
  const allowed = new Set([
    configured,
    "https://jaimk8365.github.io"
  ].filter(Boolean));

  return allowed.has(current) ? origin : "";
}

function authorised(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  return supplied === `Bearer ${env.APP_SYNC_TOKEN}`;
}

async function pocketSmith(path, env) {
  const response = await fetch(API + path, {
    headers: {
      "X-Developer-Key": env.POCKETSMITH_DEVELOPER_KEY,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const error = new Error(`PocketSmith request failed (${response.status})`);
    error.upstreamStatus = response.status;
    error.path = path.split("?")[0];
    throw error;
  }

  try {
    return await response.json();
  } catch {
    const error = new Error("PocketSmith returned an unreadable response.");
    error.upstreamStatus = response.status;
    error.path = path.split("?")[0];
    throw error;
  }
}

async function getTransactions(userId, env, updatedSince) {
  const transactions = [];

  // PocketSmith defaults to only 30 rows/page. Use its supported 1000-row
  // page size so the initial history import stays well below Cloudflare
  // Free's 50 external-subrequest limit.
  for (let page = 1; page <= 40; page++) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: "1000"
    });

    if (updatedSince) {
      params.set("updated_since", updatedSince);
    }

    const batch = await pocketSmith(
      `/users/${userId}/transactions?${params}`,
      env
    );

    if (!Array.isArray(batch) || batch.length === 0) break;

    transactions.push(...batch);

    if (batch.length < 1000) break;
  }

  return transactions;
}

function safeAccount(account) {
  if (!account || typeof account !== "object") return null;
  return {
    id: account.id ?? null,
    title: account.name || account.title || account.account?.title || "PocketSmith account",
    type: account.type || account.account?.type || null,
    currencyCode: account.currency_code || account.account?.currency_code || null,
    currentBalance: account.current_balance ?? account.balance ?? null,
    currentBalanceDate: account.current_balance_date || account.balance_date || null,
    parentAccountId: account.account?.id || account.account_id || null
  };
}

function safeTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") return null;
  return {
    id: transaction.id ?? null,
    date: transaction.date || null,
    amount: transaction.amount ?? null,
    payee: transaction.payee || "",
    type: transaction.type || null,
    status: transaction.status || null,
    needsReview: transaction.needs_review ?? null,
    isTransfer: transaction.is_transfer ?? null,
    category: transaction.category
      ? {
          id: transaction.category.id ?? null,
          title: transaction.category.title || ""
        }
      : null,
    transactionAccountId:
      transaction.transaction_account?.id || transaction.transaction_account_id || null,
    updatedAt: transaction.updated_at || null
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rawOrigin = request.headers.get("Origin") || "";
    const origin = allowedOrigin(request, env);

    // Browser requests with Authorization trigger a CORS preflight first.
    if (request.method === "OPTIONS") {
      if (!origin) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Authorization",
          "access-control-max-age": "600",
          vary: "Origin"
        }
      });
    }

    // Allow Cloudflare's tester (no Origin header) or the approved Finance origin.
    if (url.pathname === "/health") {
      if (rawOrigin && !origin) {
        return json({ error: "origin_not_allowed" }, 403);
      }

      if (!authorised(request, env)) {
        return json({ error: "unauthorised" }, 401, origin);
      }

      try {
        const me = await pocketSmith("/me", env);

        return json(
          {
            ok: true,
            pocketSmithConnected: Boolean(me?.id)
          },
          200,
          origin
        );
      } catch {
        return json(
          {
            error: "upstream_error",
            message: "PocketSmith connection needs attention."
          },
          502,
          origin
        );
      }
    }

    if (!origin) {
      return json({ error: "origin_not_allowed" }, 403);
    }

    if (!authorised(request, env)) {
      return json({ error: "unauthorised" }, 401, origin);
    }

    try {
      if (url.pathname === "/snapshot") {
        const me = await pocketSmith("/me", env);
        const updatedSince =
          url.searchParams.get("updated_since") || "";

        const accounts = await pocketSmith(`/users/${me.id}/transaction_accounts`, env);
        if (!Array.isArray(accounts)) {
          return json(
            {
              error: "unexpected_response",
              message: "PocketSmith account response needs attention.",
              stage: "transaction_accounts_shape",
              upstreamStatus: 200
            },
            502,
            origin
          );
        }

        const transactions = await getTransactions(me.id, env, updatedSince);
        if (!Array.isArray(transactions)) {
          return json(
            {
              error: "unexpected_response",
              message: "PocketSmith transaction response needs attention.",
              stage: "transactions_shape",
              upstreamStatus: 200
            },
            502,
            origin
          );
        }

        return json(
          {
            generatedAt: new Date().toISOString(),
            updatedSince: updatedSince || null,
            accounts: accounts.map(safeAccount).filter(Boolean),
            transactions: transactions.map(safeTransaction).filter(Boolean)
          },
          200,
          origin
        );
      }

      return json({ error: "not_found" }, 404, origin);
    } catch (error) {
      return json(
        {
          error: "upstream_error",
          message: "PocketSmith sync needs attention.",
          stage: error?.path || "unknown",
          upstreamStatus: error?.upstreamStatus || null
        },
        502,
        origin
      );
    }
  }
};
