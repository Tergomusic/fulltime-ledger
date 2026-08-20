// Netlify Function: verify-payment
// Called by the website AFTER the Paystack popup closes, to confirm the
// payment actually went through before we treat the subscription as active.
//
// Why this exists: the browser-side "callback" from Paystack's popup can be
// spoofed or intercepted — it only tells you the popup finished, not that
// money moved. This function calls Paystack's own Verify Transaction API
// using your SECRET key, which only your server (never the browser) should
// ever hold.
//
// SETUP
// In your Netlify site dashboard: Site settings -> Environment variables
// -> Add variable
//   Key:   PAYSTACK_SECRET_KEY
//   Value: sk_test_xxxxxxxx  (use your Paystack TEST secret key while testing,
//                              switch to sk_live_xxxxxxxx only when you go live)
// Never put the secret key directly in this file or in index.html.

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const reference = event.queryStringParameters && event.queryStringParameters.reference;
  if (!reference) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing reference" }),
    };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server not configured: PAYSTACK_SECRET_KEY missing" }),
    };
  }

  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const data = await response.json();

    if (!data.status || !data.data) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Could not verify transaction", details: data }),
      };
    }

    const tx = data.data;
    const verified = tx.status === "success";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        verified,
        amount: tx.amount / 100,
        currency: tx.currency,
        email: tx.customer && tx.customer.email,
        plan: tx.metadata && tx.metadata.plan,
        reference: tx.reference,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Verification request failed", details: String(err) }),
    };
  }
};
