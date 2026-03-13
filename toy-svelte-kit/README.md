# toy-svelte-kit

SvelteKit toy project with Neon-backed APIs as the default server data layer.

## Data architecture

- Use client storage first when the feature can stay local.
- Use Neon Postgres for normal CRUD and server-side persistence.
- Use SvelteKit `src/routes/api/*` for app-owned APIs.
- Use the external server at `http://168.107.31.65:8080` only for real-time or bidirectional communication such as WebSocket, SSE, or long-lived streaming connections.

## Routing rules

- `/api/*`: handled by this SvelteKit project
- `/realtime/*`: rewritten by Vercel to `http://168.107.31.65:8080/*`

This keeps regular APIs on Neon and reserves the external server for cases where a persistent connection is actually needed.

## Neon

- Connection env var: `DATABASE_URL`
- Server access helper: [`src/lib/server/neon.ts`](./src/lib/server/neon.ts)
- Example Neon CRUD API: [`src/routes/api/rankings/+server.ts`](./src/routes/api/rankings/+server.ts)

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run check
```
