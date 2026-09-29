import { probeApis } from './probe.mjs';
import spec from './spec.json';

export default {
  async fetch() {
    return Response.json({ version: 'workerd', outcomes: await probeApis(spec.apis), mocked: {} });
  },
};
