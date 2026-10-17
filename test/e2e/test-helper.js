import { mkdtemp, rm, access } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(__dirname, "..", "..");

export const SAMPLE_DRUGS = [
  {
    genericCode: "00001",
    brandCode: "00001",
    title: "نمونه آموزشی قرص",
    dosageForm: "قرص",
    strength: "۵۰۰ میلی‌گرم",
  },
  {
    genericCode: "14083",
    brandCode: "14083",
    title: "نمونه آموزشی ویال",
    dosageForm: "ویال",
    strength: "۱۰ میلی‌گرم / ۵ میلی‌لیتر",
  },
  {
    genericCode: "08234",
    brandCode: "08234",
    title: "شربت دیفن هیدرامین",
    dosageForm: "شربت",
    strength: "۱۲.۵ میلی‌گرم / ۵ میلی‌لیتر",
  },
];

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isAdapterAvailable() {
  return fileExists(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
}

export async function isCatalogResolverAvailable() {
  return fileExists(join(projectRoot, "src", "catalog-resolver.js"));
}

export async function isEndpointAvailable(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "OPTIONS" });
    if (res.status === 404) return false;
    return true;
  } catch {
    return false;
  }
}

export function createMcpClient(baseUrl) {
  let rpcCounter = 1;
  return {
    async request(method, params = {}) {
      const id = rpcCounter++;
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const text = await response.text();
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr) {
              return { status: response.status, body: JSON.parse(dataStr) };
            }
          }
        }
        return { status: response.status, raw: text };
      }

      const body = await response.json();
      return { status: response.status, body };
    },

    async initialize() {
      return this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "panelph-e2e-test", version: "0.1.0" },
      });
    },

    async listTools() {
      return this.request("tools/list", {});
    },

    async callTool(name, args = {}) {
      return this.request("tools/call", {
        name,
        arguments: args,
      });
    },

    async readResource(uri) {
      return this.request("resources/read", { uri });
    },
  };
}

export async function setupTestEnvironment() {
  const directory = await mkdtemp(join(tmpdir(), "panelph-e2e-"));
  const statePath = join(directory, "draft.json");
  process.env.PANELPH_STATE_PATH = statePath;

  const { startServer } = await import(`${projectRoot}/src/server.js?test=${Date.now()}_${Math.random()}`);
  const server = startServer({ port: 0 });
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const mcpClient = createMcpClient(baseUrl);


  const restClient = {
    async get(path) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },

    async post(path, payload = {}, customHeaders = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...customHeaders,
        },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },

    async patch(path, payload = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },
  };

  let isClosed = false;
  const stopServer = async () => {
    if (isClosed) return;
    isClosed = true;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };


  const cleanup = async () => {
    await stopServer();
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      // Ignore directory removal failure in tests
    }
  };

  return {
    server,
    port,
    baseUrl,
    statePath,
    directory,
    mcpClient,
    restClient,
    stopServer,
    cleanup,
  };
}

