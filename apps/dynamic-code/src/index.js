// Validates a request with ajv, which compiles every schema with `new Function`.
import Ajv from 'ajv';

const validate = new Ajv().compile({ type: 'object', required: ['id'] });

export default function middleware(request) {
  return new Response(String(validate(request)));
}
