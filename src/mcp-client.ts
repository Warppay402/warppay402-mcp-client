#!/usr/bin/env node
import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WarpPayClient } from "@warppay402/sdk";

dotenv.config();

const privateKey = process.env.CUSTOMER_PRIVATE_KEY;
if (!privateKey) {
  console.error("❌ CUSTOMER_PRIVATE_KEY is missing in environment variables.");
  process.exit(1);
}

// 1. Initialize WarpPay Client for x402 signing
const payClient = new WarpPayClient({
  privateKey: privateKey as `0x${string}`,
});

// 2. Connect to remote WarpPay402 SSE server
const REMOTE_ENDPOINT = "https://api.warppay402.com/mcp?v=2";
const sseTransport = new SSEClientTransport(new URL(REMOTE_ENDPOINT));
const remoteClient = new Client(
  { name: "WarpPay402 Local Proxy Client", version: "1.0.0" },
  { capabilities: {} }
);

// 3. Local Stdio Server for IDE clients (Cursor / Claude Desktop)
const localServer = new Server(
  { name: "WarpPay402 Bridge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

async function main() {
  await remoteClient.connect(sseTransport);

  // List tools from remote WarpPay server
  localServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const remoteTools = await remoteClient.listTools();
    return remoteTools;
  });

  // Delegate tool calls to remote server
  localServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await remoteClient.callTool({
        name,
        arguments: args,
      });
      return result;
    } catch (error: any) {
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
