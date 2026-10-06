import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';

export default { plugins: [sveltekit({ adapter: adapter({ edge: true }) })] };
