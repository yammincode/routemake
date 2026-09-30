// 防護標頭：不能被嵌入、只載入自己與 Supabase 的資源
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE } from "./helpers.mjs";

test("正式版回應帶有防護標頭", async () => {
  for (const path of ["/", "/gym/mingde", "/admin"]) {
    const res = await fetch(BASE + path);
    assert.equal(res.headers.get("x-frame-options"), "DENY", path);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", path);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.match(csp, /connect-src 'self' https:\/\/[^ ;]+supabase\.co/, path);
    assert.match(csp, /object-src 'none'/, path);
  }
});
