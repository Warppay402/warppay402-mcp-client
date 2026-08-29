# `@warppay402/mcp-client`

Lightweight stdio-to-SSE proxy bridge that brings WarpPay402 monetized tools into Cursor IDE, Windsurf, and Claude Desktop with automated x402 payment challenge signing.

## Quickstart

```bash
npm install -g @warppay402/mcp-client
```

## Cursor Setup (~/.cursor/mcp.json)

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

## Claude Desktop Setup (claude_desktop_config.json)

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
