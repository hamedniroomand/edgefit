# Creates the demo project for docs/demo.tape in a temporary directory.
# Source it from the repository root after `vp pack`.

repo=$PWD
cd "$(mktemp -d)" && mkdir thumbs && cd thumbs

cat > package.json <<'EOF'
{ "name": "thumbs", "private": true, "type": "module" }
EOF

cat > wrangler.jsonc <<'EOF'
{
  "name": "thumbs",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"]
}
EOF

mkdir src
cat > src/index.ts <<'EOF'
import { Hono } from 'hono';
import sharp from 'sharp';

const app = new Hono();

app.post('/thumbnail', async (c) => {
  const image = await c.req.arrayBuffer();
  const thumbnail = await sharp(image).resize(320).webp().toBuffer();
  return c.body(thumbnail, 200, { 'content-type': 'image/webp' });
});

export default app;
EOF

npm install --silent --no-audit --no-fund hono sharp "$repo" >/dev/null 2>&1

git init -q -b main
git add -A -- ':!node_modules'
git -c user.name=demo -c user.email=demo@example.com commit -qm 'feat: add thumbnail endpoint'

git switch -qc use-images-binding
cat > src/index.ts <<'EOF'
import { Hono } from 'hono';

const app = new Hono<{ Bindings: { IMAGES: ImagesBinding } }>();

app.post('/thumbnail', async (c) => {
  const image = await c.env.IMAGES.input(c.req.raw.body!).transform({ width: 320 });
  return (await image.output({ format: 'image/webp' })).response();
});

export default app;
EOF
git -c user.name=demo -c user.email=demo@example.com commit -qam 'fix: resize with the Images binding'
git switch -q main

unset NO_COLOR
PS1='\[\e[1;34m\]thumbs\[\e[0m\] \[\e[35m\]$(git branch --show-current)\[\e[0m\] \[\e[32m\]❯\[\e[0m\] '
clear
