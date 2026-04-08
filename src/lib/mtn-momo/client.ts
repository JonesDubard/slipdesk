const MTN_BASE_URL = process.env.MTN_BASE_URL!; // e.g., "https://sandbox.momodeveloper.mtn.com"
const MTN_SUBSCRIPTION_KEY = process.env.MTN_SUBSCRIPTION_KEY!;
const MTN_API_USER = process.env.MTN_API_USER!;
const MTN_API_KEY = process.env.MTN_API_KEY!;
const MTN_TARGET_ENV = process.env.MTN_TARGET_ENV || "sandbox"; // "production" when live

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${MTN_API_USER}:${MTN_API_KEY}`).toString("base64");
  const response = await fetch(`${MTN_BASE_URL}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Ocp-Apim-Subscription-Key": MTN_SUBSCRIPTION_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get MTN token: ${response.statusText}`);
  }

  const data: TokenResponse = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // expire 1 min early
  };
  return cachedToken.token;
}

export async function requestToPay(
  phoneNumber: string,
  amount: number,
  referenceId: string,
  currency: string = "USD" // MTN sandbox uses EUR, but you can map to USD/LRD in production
): Promise<boolean> {
  const token = await getAccessToken();

  const response = await fetch(`${MTN_BASE_URL}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": MTN_TARGET_ENV,
      "Ocp-Apim-Subscription-Key": MTN_SUBSCRIPTION_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amount.toString(),
      currency,
      externalId: referenceId,
      payer: {
        partyIdType: "MSISDN",
        partyId: phoneNumber,
      },
      payerMessage: "Slipdesk subscription payment",
      payeeNote: "Thank you for using Slipdesk!",
    }),
  });

  return response.ok; // 202 Accepted
}

export async function getTransactionStatus(referenceId: string): Promise<{ status: string; amount?: number }> {
  const token = await getAccessToken();
  const response = await fetch(`${MTN_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Target-Environment": MTN_TARGET_ENV,
      "Ocp-Apim-Subscription-Key": MTN_SUBSCRIPTION_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get transaction status: ${response.statusText}`);
  }

  const data = await response.json();
  return { status: data.status, amount: data.amount };
}