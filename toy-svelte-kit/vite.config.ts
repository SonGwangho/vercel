import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit(), {
		name: 'lounge-websocket',
		apply: 'serve',
		async configureServer(server) {
			if (!server.httpServer) return;
			const env = loadEnv(mode, process.cwd(), '');
			const { attachLoungeSockets } = await server.ssrLoadModule('/src/lib/server/lounge/socket.ts');
			attachLoungeSockets(server.httpServer, { databaseUrl: env.DATABASE_URL ?? '', secret: env.LOUNGE_SOCKET_SECRET || env.DATABASE_URL || '', scope: 'campground-v1:local:dev' });
		}
	}]
}));
