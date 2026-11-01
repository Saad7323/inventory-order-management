const { createDatabase } = require("../src/database");
const { createApp } = require("../src/server");
async function startTestServer(t) {
  const db = createDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const jar = new Map();
    let csrf;
    return {
      async request(url, options = {}) {
        const headers = {
          ...options.headers,
          cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        };
        const response = await fetch(baseUrl + url, {
          ...options,
          headers,
          redirect: "manual",
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(";");
          const index = pair.indexOf("=");
          jar.set(pair.slice(0, index), pair.slice(index + 1));
        }
        const body = await response.text();
        csrf = body.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || csrf;
        return {
          response,
          body,
          status: response.status,
          location: response.headers.get("location"),
        };
      },
      async post(url, values, { omitCsrf = false } = {}) {
        const form = new URLSearchParams();
        if (!omitCsrf) form.append("_csrf", csrf || "");
        for (const [key, value] of Object.entries(values))
          for (const item of Array.isArray(value) ? value : [value])
            form.append(key, item);
        return this.request(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
        });
      },
      async setup() {
        await this.request("/setup");
        const result = await this.post("/setup", {
          name: "Test Manager",
          email: "manager@example.test",
          password: "test-password-123",
        });
        if (result.status !== 302) throw new Error(result.body);
        await this.request("/");
        return this;
      },
      async login(
        email = "manager@example.test",
        password = "test-password-123",
      ) {
        await this.request("/login");
        const result = await this.post("/login", { email, password });
        if (result.status !== 302) throw new Error(result.body);
        await this.request("/");
        return this;
      },
    };
  }
  return { db, baseUrl, client };
}
module.exports = { startTestServer };
