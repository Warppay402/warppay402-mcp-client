#!/usr/bin/env node
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WarpPayClient } from "@warppay402/sdk";

dotenv.config();

const rawPrivateKey = process.env.CUSTOMER_PRIVATE_KEY?.trim();
if (!rawPrivateKey || !rawPrivateKey.startsWith("0x")) {
  console.error("❌ CUSTOMER_PRIVATE_KEY (0x...) is missing or invalid in environment.");
  process.exit(1);
}

const payClient = new WarpPayClient({
  privateKey: rawPrivateKey as `0x${string}`,
});

async function generateSignatureHeader(challenge: any): Promise<string> {
  if (typeof (payClient as any).createPaymentHeader === "function") {
    return await (payClient as any).createPaymentHeader(challenge);
  }
  if (typeof (payClient as any).signPaymentChallenge === "function") {
    return await (payClient as any).signPaymentChallenge(challenge);
  }
  if (typeof (payClient as any).sign === "function") {
    return await (payClient as any).sign(challenge);
  }
  throw new Error("WarpPayClient has no recognized payment signing method.");
}

let activePaymentSignature: string | null = null;

const x402Fetch: typeof fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (activePaymentSignature) {
    headers.set("PAYMENT-SIGNATURE", activePaymentSignature);
    headers.set("X-PAYMENT-SIGNATURE", activePaymentSignature);
  }
  return await fetch(url, { ...init, headers });
};

const REMOTE_ENDPOINT = "https://api.warppay402.com/mcp?v=2";
const sseTransport = new SSEClientTransport(new URL(REMOTE_ENDPOINT), {
  requestInit: {
    headers: {
      Accept: "text/event-stream, application/json",
    },
  },
  fetch: x402Fetch,
});

const remoteClient = new Client(
  { name: "WarpPay402 Local Proxy Client", version: "1.1.0" },
  { capabilities: {} }
);

const localServer = new Server(
  { name: "WarpPay402 Bridge", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

const COMPOSITE_AGENT_TOOLS = [
  {
    name: "warppay_defi_executor",
    description:
      "Autonomous DeFi due-diligence and quote agent orchestrating wallet/contract audits, Aerodrome pool yields, and swap simulation from a single goal ($0.15 USDC).",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "Natural-language DeFi due-diligence or swap simulation objective",
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "warppay_deep_research",
    description:
      "Parallel web scraping, UCP merchant catalog search, and forex spot rate synthesis agent from a single goal ($0.05 USDC).",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "Natural-language commerce, web research, or currency synthesis objective",
        },
      },
      required: ["goal"],
    },
  },
];

async function main() {
  await remoteClient.connect(sseTransport);

  localServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const remote = await remoteClient.listTools();
    const existingNames = new Set((remote.tools || []).map((t) => t.name));
    const mergedTools = [
      ...(remote.tools || []),
      ...COMPOSITE_AGENT_TOOLS.filter((t) => !existingNames.has(t.name)),
    ];
    return { tools: mergedTools };
  });

  localServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Route composite multi-agent workflows directly through @warppay402/sdk
    if (name === "warppay_defi_executor" || name === "warppay_deep_research") {
      try {
        const goal = String((args as any)?.goal || "").trim();
        if (!goal) {
          throw new Error("Missing required parameter: goal");
        }
        const result =
          name === "warppay_defi_executor"
            ? await (payClient as any).executeDefiAgent(goal)
            : await (payClient as any).executeDeepResearchAgent(goal);

        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (agentErr: any) {
        return {
          content: [
            {
              type: "text",
              text: `[Autonomous Agent Failed]: ${agentErr.message || String(agentErr)}`,
            },
          ],
          isError: true,
        };
      }
    }

    try {
      return await remoteClient.callTool({ name, arguments: args });
    } catch (error: any) {
      const is402 =
        error?.code === 402 ||
        error?.message?.includes("402") ||
        error?.data?.x402Version ||
        error?.data?.accepts;

      if (is402) {
        try {
          const challenge = error?.data || {};
          const paymentHeader = await generateSignatureHeader(challenge);
          activePaymentSignature = paymentHeader;

          const retryResult = await remoteClient.callTool({
            name,
            arguments: args,
          });

          activePaymentSignature = null;
          return retryResult;
        } catch (signErr: any) {
          activePaymentSignature = null;
          return {
            content: [
              {
                type: "text",
                text: `[x402 Micropayment Failed]: ${signErr.message || String(signErr)}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Tool execution failed: ${error.message || String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await localServer.connect(stdioTransport);
}

main().catch((err) => {
  console.error("Fatal proxy bridge failure:", err);
  process.exit(1);
});
