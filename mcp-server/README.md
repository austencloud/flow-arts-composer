# TKA Pictograph MCP Server

MCP (Model Context Protocol) server that gives Claude access to TKA pictograph data.

## Available Tools

### `list_letter_variations`
List all variations of a TKA letter.

```
Input: { letter: "W" }
Output: All variations with motion details
```

### `get_pictograph_data`
Get detailed JSON data for a specific pictograph.

```
Input: { letter: "W", variation: 0 }
Output: Full pictograph data structure
```

### `search_pictographs`
Search for pictographs matching criteria.

```
Input: {
  startPlacement?: "alpha3",
  endPlacement?: "alpha5",
  motionType?: "pro" | "anti" | "static" | "dash",
  startLocation?: "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw",
  endLocation?: string,
  limit?: 10
}
```

### `list_available_letters`
List all letters in the TKA alphabet dataframe.

## Setup

The server is already configured in `.mcp.json`. To use it:

1. Restart Claude Code to pick up the new MCP config
2. Ask Claude to use the TKA pictograph tools

## Example Queries

Once connected, you can ask Claude things like:

- "List all variations of the letter W"
- "Search for pictographs that start from alpha3"
- "Get the data for letter L variation 2"
- "What letters are available in TKA?"

## Development

```bash
cd mcp-server
npm install
npm run dev  # Run with tsx for development
```

## Future: Image Generation

Phase 2 will add actual image rendering via `generate_pictograph` tool.
This will use the existing Canvas2DDirectRenderer infrastructure.
