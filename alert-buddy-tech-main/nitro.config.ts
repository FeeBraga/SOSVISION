import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "netlify",
  routeRules: {
    "/api/alertas": {
      cors: true,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  },
});
