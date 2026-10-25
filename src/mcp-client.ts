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

// 1. Initialize WarpPay SDK Client for on-chain x402 signing
const payClient = new WarpPayClient({
  privateKey: rawPrivateKey as `0x${string}`,
});

// Helper to resolve the correct signing method regardless of SDK minor version
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

// Active signature queue to safely support concurrent tool calls
let activePaymentSignature: string | null = null;

// Custom fetch wrapper that injects PAYMENT-SIGNATURE into outbound SSE POST messages
const x402Fetch: typeof fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers || {});

  if (activePaymentSignature) {
    headers.set("PAYMENT-SIGNATURE", activePaymentSignature);
    headers.set("X-PAYMENT-SIGNATURE", activePaymentSignature);
  }

  return await fetch(url, { ...init, headers });
};

// 2. Connect to the WarpPay402 Remote SSE Gateway
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
  { name: "WarpPay402 Local Proxy Client", version: "1.0.3" },
  { capabilities: {} }
);

// 3. Local Stdio Server exposing tools to Cursor, Windsurf, & Claude Desktop
const localServer = new Server(
  { name: "WarpPay402 Bridge", version: "1.0.3" },
  { capabilities: { tools: {} } }
);

async function main() {
  await remoteClient.connect(sseTransport);

  // Expose remote tool definitions to IDE
  localServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return await remoteClient.listTools();
  });

  // Intercept and execute tool calls with automated 402 challenge signing
  localServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // First attempt: call tool directly
      return await remoteClient.callTool({ name, arguments: args });
    } catch (error: any) {
      // Detect x402 Payment Required response from remote MCP gateway
      const is402 =
        error?.code === 402 ||
        error?.message?.includes("402") ||
        error?.data?.x402Version ||
        error?.data?.accepts;

      if (is402) {
        try {
          const challenge = error?.data || {};
          const paymentHeader = await generateSignatureHeader(challenge);

          // Arm transport with signed proof
          activePaymentSignature = paymentHeader;

          // Retry tool call with payment proof attached
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

      // Standard tool execution errors
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
