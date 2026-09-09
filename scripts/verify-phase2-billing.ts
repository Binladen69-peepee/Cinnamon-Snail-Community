const base = process.env.AUTH_URL ?? "http://localhost:3000";

function cookieJar(headers: Headers, previous = "") {
  const map = new Map<string, string>();
  for (const part of previous.split(";").map((item) => item.trim()).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    map.set(name, rest.join("="));
  }
  for (const line of headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair.split("=");
    if (name) map.set(name, rest.join("="));
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function main() {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrf = (await csrfRes.json()) as { csrfToken: string };
  let cookie = cookieJar(csrfRes.headers);
  const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: "adam@veganuniversity.test",
      password: "vegan-local-dev",
      callbackUrl: `${base}/home`,
      json: "true",
    }),
    redirect: "manual",
  });
  cookie = cookieJar(loginRes.headers, cookie);

  const billing = await fetch(`${base}/billing`, { headers: { Cookie: cookie } });
  const billingHtml = await billing.text();
  const admin = await fetch(`${base}/admin/billing`, { headers: { Cookie: cookie } });
  const adminHtml = await admin.text();
  const marketing = await fetch(`${base}/membership`);
  const marketingHtml = await marketing.text();
  const webhook = await fetch(`${base}/api/webhooks/samcart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "Order" }),
  });

  console.log(
    JSON.stringify(
      {
        billing: billing.status === 200 && billingHtml.includes("Your seat at the table"),
        adminBilling: admin.status === 200 && adminHtml.includes("Billing health"),
        marketingMembership:
          marketing.status === 200 && marketingHtml.includes("A seat at the table"),
        webhookUnauthorized: webhook.status === 401,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
