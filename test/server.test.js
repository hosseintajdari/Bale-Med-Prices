import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("serves MCP initialization through the local endpoint", async () => {
  const directory = await mkdtemp(join(tmpdir(), "panelph-server-"));
  process.env.PANELPH_STATE_PATH = join(directory, "draft.json");
  const { startServer } = await import(`../src/server.js?test=${Date.now()}`);
  const server = startServer({ port: 0 });
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "panelph-test", version: "0.1.0" },
        },
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.serverInfo.name, "panelph");

    const toolsResponse = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    const toolsPayload = await toolsResponse.json();
    assert.equal(toolsResponse.status, 200);
    assert.ok(toolsPayload.result.tools.some((tool) => tool.name === "render_order_desk"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
