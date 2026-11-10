import handler from "vinext/server/fetch-handler";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Development middleware strips caller-supplied identity before injecting
    // the loopback test account. Production identity comes from trusted Sites ingress.
    if (import.meta.env.DEV || env.YACK_TRUST_SITES_AUTH === "true") {
      return handler.fetch(request, env, ctx);
    }
    const headers = new Headers(request.headers);
    for (const name of request.headers.keys()) {
      if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
    }
    return handler.fetch(new Request(request, { headers }), env, ctx);
  },
};
