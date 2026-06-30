import { Buffer } from "node:buffer";
import { serve } from "bun";
import index from "./index.html";

type ApiError = {
  error?: string;
  message?: string;
  errorMessage?: string;
  errorCode?: string;
  errors?: unknown;
};

type ContractResponse = {
  id?: string | number;
  [key: string]: unknown;
};

type CalculatorResult = {
  term?: string | number;
  recurringPayment?: number;
  basePayment?: number;
  tax?: number;
  ldwTax?: number;
  taxRate?: number;
  ldwPrice?: number;
  initialPayment?: number;
  securityDeposit?: number;
  totalCost?: number;
  minimumInitialPayment?: number;
  [key: string]: unknown;
};

type ContractPdfResponse = {
  content?: string;
};

const apiUrl = getRequiredEnv("API_URL");
const clientId = getRequiredEnv("CLIENT_ID");
const clientSecret = getRequiredEnv("CLIENT_SECRET");
const channelToken = getRequiredEnv("CHANNEL_TOKEN");

let accessToken = "";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, name: string, fallback = 0) {
  const value = getString(formData, name);

  if (value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalized.length !== 10) {
    return value.trim();
  }

  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function getErrorMessage(result: unknown, fallback: string) {
  if (!result || typeof result !== "object") {
    return fallback;
  }

  const error = result as ApiError;

  if (typeof error.error === "string" && error.error) {
    return error.error;
  }

  if (typeof error.message === "string" && error.message) {
    return error.message;
  }

  if (typeof error.errorMessage === "string" && error.errorMessage) {
    return error.errorMessage;
  }

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          const detail = item as Record<string, unknown>;
          return [detail.field, detail.message]
            .filter(
              (part): part is string =>
                typeof part === "string" && part.length > 0,
            )
            .join(": ");
        }

        return "";
      })
      .filter(Boolean)
      .join(", ");
  }

  return fallback;
}

async function parseResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function authenticate(force = false) {
  if (accessToken && !force) {
    return accessToken;
  }

  const response = await fetch(`${apiUrl}/v1/integration/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Channel: channelToken,
    },
    body: JSON.stringify({
      username: clientId,
      password: clientSecret,
    }),
  });

  const result = await parseResponse(response);

  if (
    !response.ok ||
    !result ||
    typeof result !== "object" ||
    !("token" in result)
  ) {
    throw new Error(
      getErrorMessage(result, "Could not authenticate with RTO Hub."),
    );
  }

  accessToken = String((result as { token: string }).token);
  return accessToken;
}

async function sendApiRequest(
  endpoint: string,
  options: {
    method?: string;
    json?: unknown;
    body?: BodyInit;
    headers?: HeadersInit;
    retry?: boolean;
  } = {},
) {
  const token = await authenticate();
  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Channel", channelToken);

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(
    `${apiUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`,
    {
      method: options.method ?? (options.json !== undefined ? "POST" : "GET"),
      headers,
      body,
    },
  );

  const result = await parseResponse(response);

  if (response.status === 403 && !options.retry) {
    await authenticate(true);
    return sendApiRequest(endpoint, { ...options, retry: true });
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        result,
        `RTO Hub request failed with status ${response.status}.`,
      ),
    );
  }

  return result;
}

function buildContractPayload(formData: FormData) {
  const retailPrice = getNumber(formData, "retailPrice", Number.NaN);

  if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
    throw new Error("Retail price is required.");
  }

  const firstName = getString(formData, "firstName");
  const lastName = getString(formData, "lastName");
  const streetAddress = getString(formData, "streetAddress");
  const city = getString(formData, "city");
  const state = getString(formData, "state");
  const zip = getString(formData, "zip");
  const style = getString(formData, "style");
  const size = getString(formData, "size");
  const itemName = [style, size].filter(Boolean).join(" ") || "Building";
  const serialNumber =
    getString(formData, "serialNumber") || `demo-${Date.now()}`;
  const taxRate = getString(formData, "taxRate");

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  if (!getString(formData, "term")) {
    throw new Error("Rental term is required.");
  }

  const payload: Record<string, unknown> = {
    customer: {
      firstName,
      lastName,
      emailAddress: getString(formData, "email"),
      phoneNumber: formatPhoneNumber(getString(formData, "phone")),
    },
    billingAddress: {
      streetLine1: streetAddress,
      streetLine2: getString(formData, "streetAddress2"),
      city,
      state,
      postalCode: zip,
    },
    shippingAddress: {
      streetLine1: streetAddress,
      streetLine2: getString(formData, "streetAddress2"),
      city,
      state,
      postalCode: zip,
    },
    product: {
      retailPrice,
      referenceId: serialNumber,
      name: itemName,
      model: style,
      size,
      color: getString(formData, "sidingColor"),
      trimColor: getString(formData, "trimColor"),
      roofColor: getString(formData, "roofColor"),
      condition: getString(formData, "condition") || "New",
      productType: "shed",
    },
    residenceInfo: {
      isOwner: getString(formData, "landowner"),
      landlord: getString(formData, "landlord"),
      landlordPhone: formatPhoneNumber(getString(formData, "landlordPhone")),
    },
    employmentInfo: {
      employer: getString(formData, "employer"),
      employerPhone: formatPhoneNumber(getString(formData, "employerPhone")),
      supervisor: getString(formData, "supervisor"),
      occupation: getString(formData, "occupation"),
    },
    reference1: {
      name: getString(formData, "reference1Name"),
      phone: formatPhoneNumber(getString(formData, "reference1Phone")),
      relationship: getString(formData, "reference1Relationship"),
    },
    reference2: {
      name: getString(formData, "reference2Name"),
      phone: formatPhoneNumber(getString(formData, "reference2Phone")),
      relationship: getString(formData, "reference2Relationship"),
    },
    term: getString(formData, "term"),
    greaterInitialPayment:
      getString(formData, "greaterInitialPayment") === ""
        ? -1
        : getNumber(formData, "greaterInitialPayment", -1),
    addLdw: formData.has("includeLiabilityDamageWaiver"),
    plan: "standard",
    taxExempt: formData.has("taxExempt"),
  };

  if (taxRate !== "") {
    payload.taxRate = getNumber(formData, "taxRate", 0);
  }

  return payload;
}

function buildCalculatorPayload(formData: FormData) {
  const retailPrice = getNumber(formData, "retailPrice", Number.NaN);

  if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
    throw new Error("Retail price is required.");
  }

  const payload: Record<string, unknown> = {
    retailPrice,
    addLdw: formData.has("includeLiabilityDamageWaiver"),
    greaterInitialPayment:
      getString(formData, "greaterInitialPayment") === ""
        ? -1
        : getNumber(formData, "greaterInitialPayment", -1),
    productType: "shed",
    plan: "standard",
    taxExempt: formData.has("taxExempt"),
    state: getString(formData, "state") || "MS",
  };

  if (getString(formData, "taxRate") !== "") {
    payload.taxRate = getNumber(formData, "taxRate", 0);
  }

  return payload;
}

function mapCalculatorResults(results: unknown) {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((paymentData) => {
    const data = paymentData as CalculatorResult;
    const tax = Number(data.tax ?? 0) + Number(data.ldwTax ?? 0);

    return {
      term: String(data.term ?? ""),
      total: Number(data.recurringPayment ?? 0),
      subtotal: Number(data.basePayment ?? 0),
      tax,
      taxRate: Number(data.taxRate ?? 0),
      ldw: Number(data.ldwPrice ?? 0),
      downPayment: Number(data.initialPayment ?? 0),
      securityDeposit: Number(data.securityDeposit ?? 0),
      totalCost: Number(data.totalCost ?? 0),
      minimumInitialPayment: Number(data.minimumInitialPayment ?? 0),
    };
  });
}

const server = serve({
  routes: {
    "/api/calculator": {
      async POST(req) {
        try {
          const formData = await req.formData();
          const payload = buildCalculatorPayload(formData);
          const result = await sendApiRequest("/v1/integration/calculator", {
            json: payload,
          });

          return Response.json({
            ok: true,
            terms: mapCalculatorResults(result),
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Could not load calculator terms.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },

    "/api/contract": {
      async GET(req) {
        return Response.json({
          message:
            "Submit the contract form to create a live RTO Hub contract.",
        });
      },
      async POST(req) {
        try {
          const formData = await req.formData();
          const payload = buildContractPayload(formData);
          const result = (await sendApiRequest("/v1/integration/contracts", {
            json: payload,
          })) as ContractResponse | null;

          if (!result?.id) {
            throw new Error("RTO Hub did not return a contract id.");
          }

          return Response.json({
            ok: true,
            contractId: String(result.id),
            contract: result,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save contract.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },

    "/api/contract-pdf/*": {
      async GET(req) {
        try {
          const pathname = new URL(req.url).pathname;
          const contractId = pathname.split("/").filter(Boolean).pop()?.trim() ?? "";

          if (!contractId || contractId === "contract-pdf") {
            return Response.json(
              { error: "A contract id is required." },
              { status: 400 },
            );
          }

          const result = (await sendApiRequest(
            `/v1/integration/contracts/${contractId}/pdf`,
            {
              method: "POST",
            },
          )) as ContractPdfResponse | null;

          if (!result?.content) {
            throw new Error("RTO Hub did not return PDF content.");
          }

          const pdfBuffer = Buffer.from(result.content, "base64");

          return new Response(pdfBuffer, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="contract-${contractId}.pdf"`,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not load contract PDF.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },

    "/api/upload": {
      async GET(req) {
        return Response.json({
          message:
            "Submit the upload form to attach a driver license to a live contract.",
        });
      },
      async POST(req) {
        try {
          const formData = await req.formData();
          const contractId = formData.get("contractId");
          const driverLicense = formData.get("driverLicense");

          if (
            typeof contractId !== "string" ||
            contractId.trim().length === 0
          ) {
            return Response.json(
              { error: "A contract id is required." },
              { status: 400 },
            );
          }

          if (!(driverLicense instanceof File) || driverLicense.size === 0) {
            return Response.json(
              { error: "A driver license file is required." },
              { status: 400 },
            );
          }

          const uploadPayload = new FormData();
          uploadPayload.set("file", driverLicense, driverLicense.name);
          uploadPayload.set("name", "Driver License");
          uploadPayload.set("type", "drivers-license");
          uploadPayload.set("contractId", contractId.trim());

          await sendApiRequest("/v1/integration/upload-document", {
            method: "POST",
            body: uploadPayload,
          });

          return Response.json({
            ok: true,
            contractId: contractId.trim(),
            filename: driverLicense.name,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
