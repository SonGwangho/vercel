import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

/** @param {import('@sveltejs/kit').Adapter} adapter */
export function withLounge(adapter) {
  return {
    ...adapter,
    name: 'lounge-vercel-adapter',
    /** @param {import('@sveltejs/kit').Builder} builder */
    async adapt(builder) {
      await adapter.adapt(builder);
      if (!process.env.VERCEL) return;
      const output = resolve('.vercel/output');
      const configPath = resolve(output, 'config.json');
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      const directory = resolve(output, 'functions/lounge-realtime.func');
      await mkdir(directory, { recursive: true });
      await build({
        entryPoints: ['src/lib/server/lounge/entry.ts'], outfile: resolve(directory, 'index.cjs'),
        bundle: true, platform: 'node', target: 'node22', format: 'cjs',
        external: ['bufferutil', 'utf-8-validate', 'pg-native'],
        define: { 'process.env.WS_NO_BUFFER_UTIL': '"1"', 'process.env.WS_NO_UTF_8_VALIDATE': '"1"' },
        logLevel: 'silent'
      });
      await writeFile(resolve(directory, '.vc-config.json'), JSON.stringify({
        runtime: 'nodejs22.x', handler: 'index.cjs', launcherType: 'Nodejs',
        supportsResponseStreaming: true, maxDuration: 300, regions: ['icn1']
      }, null, 2));
      config.routes = [{ src: '^/api/lounge-socket$', dest: '/lounge-realtime' }, ...(config.routes ?? [])];
      await writeFile(configPath, JSON.stringify(config, null, 2));
      builder.log.minor('Packaged the lounge WebSocket function in icn1.');
    }
  };
}
