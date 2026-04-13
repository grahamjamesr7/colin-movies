import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						TEST: "true",
						COPY_ADMIN: "false",
						RESEND_API_KEY: "test-key",
						CLIENT_EMAIL: "client@test.com",
						ADMIN_EMAIL: "admin@test.com",
						FROM_EMAIL: "Bot <bot@test.com>",
					},
				},
			},
		},
	},
});
