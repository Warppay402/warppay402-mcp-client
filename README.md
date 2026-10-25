# `@warppay402/mcp-client`

A lightweight local MCP bridge that lets AI clients like Cursor, Windsurf, and Claude Desktop access monetized WarpPay402 tools over the standard MCP stdio protocol without needing to implement x402 payment logic themselves.

This package acts as a proxy:

- it connects to the WarpPay402 remote MCP gateway over SSE
- it exposes the remote tool list through a local stdio server
- when a tool call is rejected with an x402 payment challenge, it signs the challenge using your customer private key and retries automatically

In short, it makes paid MCP tools feel like normal local tools to your IDE or desktop assistant.

## Why this exists

Many MCP clients only support stdio-based tool servers. WarpPay402 tools are hosted remotely and may require a micropayment challenge before the tool can be used. This client bridges that gap so your editor can continue to use those tools through the normal MCP flow while the payment challenge is handled automatically behind the scenes.

## What the client does

The current implementation in `src/mcp-client.ts` does the following:

1. Validates `CUSTOMER_PRIVATE_KEY` and exits early if it is missing or invalid.
2. Creates a WarpPay SDK client for x402 signing.
3. Connects to the remote WarpPay402 MCP gateway at `https://api.warppay402.com/mcp?v=2` using an SSE transport.
4. Starts a local stdio MCP server that exposes the remote tool catalog to the host editor.
5. Intercepts tool calls from the IDE.
6. If the remote gateway responds with a `402` payment challenge, it:
   - resolves the correct payment signing method from the SDK (`createPaymentHeader`, `signPaymentChallenge`, or `sign`)
   - attaches the generated `PAYMENT-SIGNATURE` and `X-PAYMENT-SIGNATURE` headers
   - retries the request automatically
7. Returns a readable error if signing fails or the tool call cannot be completed.

This makes the client compatible with the standard pattern used by MCP-capable IDEs while handling the x402 microtransaction flow transparently.

## Install

```bash
npm install -g @warppay402/mcp-client
```

You can also run it directly without a global install:

```bash
npx -y @warppay402/mcp-client
```

## Required environment variable

Set a customer private key before starting the client:

```bash
export CUSTOMER_PRIVATE_KEY=0xYOUR_CUSTOMER_PRIVATE_KEY
```

The key must start with `0x`.

## Cursor setup (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "warppay402": {
      "command": "npx",
      "args": ["-y", "@warppay402/mcp-client"],
      "env": {
        "CUSTOMER_PRIVATE_KEY": "0xYOUR_CUSTOMER_PRIVATE_KEY"
      }
    }
  }
}
```

## Windsurf setup

```json
{
  "mcpServers": {
    "warppay402": {
      "command": "npx",
      "args": ["-y", "@warppay402/mcp-client"],
      "env": {
        "CUSTOMER_PRIVATE_KEY": "0xYOUR_CUSTOMER_PRIVATE_KEY"
      }
    }
  }
}
```

## Claude Desktop setup (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "warppay402": {
      "command": "npx",
      "args": ["-y", "@warppay402/mcp-client"],
      "env": {
        "CUSTOMER_PRIVATE_KEY": "0xYOUR_CUSTOMER_PRIVATE_KEY"
      }
    }
  }
}
```

## Example flow

Once configured, the client will present the remote WarpPay402 tools as local MCP tools to your AI client. When a tool call requires a payment proof:

- the IDE invokes the tool via stdio
- the proxy sends it to the remote WarpPay402 gateway
- the gateway responds with a payment challenge
- the client signs that challenge with your private key
- the signed proof is attached to the retry request
- the tool executes successfully if the challenge is valid

This means the payment interaction is fully handled by the bridge and does not require the IDE to know anything about x402 signing details.

## Notes

- The local bridge is intentionally small and does not replace the WarpPay402 remote gateway; it simply makes it accessible in MCP clients that expect a stdio transport.
- The signing flow is designed to work across SDK minor versions by checking for multiple possible signing APIs.
- The `PAYMENT-SIGNATURE` header is set only for the active payment flow and is cleared after the retry completes.
- Keep `CUSTOMER_PRIVATE_KEY` in a secure environment or secret manager; it authorizes payment signatures on your behalf.

## Troubleshooting

If the client exits immediately:

- confirm your `CUSTOMER_PRIVATE_KEY` exists
- confirm it starts with `0x`
- ensure the value is valid for the WarpPay402 account you intend to use

If a tool fails with a signed challenge error:

- verify the private key matches the wallet expected by the gateway
- verify the remote gateway is reachable
- check whether the tool requires a different signing method than the supported SDK variants

## Repository and package information

This package is published as `@warppay402/mcp-client` and is intended to be used as a bridge for MCP-enabled AI clients. It is designed specifically for environments where the host client cannot connect directly to the remote WarpPay402 SSE endpoint but can still call a local stdio server.

