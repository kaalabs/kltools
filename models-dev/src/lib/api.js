import fs from "node:fs/promises";

export const DEFAULT_API_URL = "https://models.dev/api.json";
export const DEFAULT_TIMEOUT_MS = 15000;

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function loadApiData(apiUrl, {timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
  if (apiUrl === "-") {
    const text = await readStdin();
    return JSON.parse(text);
  }

  if (/^https?:\/\//.test(apiUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {accept: "application/json"},
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${apiUrl}: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const text = await fs.readFile(apiUrl, "utf8");
  return JSON.parse(text);
}
