const channel = new BroadcastChannel('jobs');

export async function runJob(name: string): Promise<void> {
  await navigator.locks.request(name, async () => {
    channel.postMessage({ name, state: 'running' });
  });
}

export async function cachedFetch(request: Request): Promise<Response> {
  const cache = await caches.open('v1');
  return (await cache.match(request)) ?? fetch(request);
}

export function readText(blob: Blob): void {
  new FileReader().readAsText(blob);
}

export function hasGpu(): boolean {
  return 'gpu' in navigator;
}
