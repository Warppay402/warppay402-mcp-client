# @warppay402/mcp-client

A lightweight local MCP stdio bridge that lets AI clients like **Cursor**, **Windsurf**, **OpenClaw**, and **Claude Desktop** invoke monetized **WarpPay402** tools and autonomous multi-agent workflows over standard MCP stdio with automatic `x402` USDC micropayment signing.

## How It Works

- Connects to the WarpPay402 remote MCP gateway (`https://api.warppay402.com/mcp?v=2`) over SSE.
- Exposes all 31 pay-per-use tools plus composite autonomous workflows (`warppay_defi_executor` at `$0.15 USDC` and `warppay_deep_research` at `$0.05 USDC`) to your local IDE or desktop agent.
- Automatically intercepts HTTP `402` payment challenges and signs x402 USDC authorizations using `@warppay402/sdk` (`^1.4.1`).

## Installation & Configuration

### Claude Desktop / Cursor (`mcp.json` / `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "warppay402": {
      "command": "npx",
      "args": ["-y", "@warppay402/mcp-client"],
      "env": {
        "CUSTOMER_PRIVATE_KEY": "0xYOUR_EVM_PRIVATE_KEY"
      }
    }
  }
}
```

## License

MIT License © 2026 WarpPay402
