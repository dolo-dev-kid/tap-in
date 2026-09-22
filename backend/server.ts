const port = Number(Deno.env.get("PORT") || 8000);

Deno.serve({ port }, (_req) => {
  return new Response(
    JSON.stringify({
      status: "online",
      app: "Tap-In",
      uptime: Date.now()
    }),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
});

console.log(`Tap-In running on port ${port}`);
