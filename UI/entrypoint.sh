#!/usr/bin/env sh
set -eu

DOC_ROOT="${DOC_ROOT:-/usr/share/nginx/html}"
mkdir -p "$DOC_ROOT/config"

cat > "$DOC_ROOT/config/env.js" <<EOF
window._env_ = {
  REACT_APP_API_HOST: "${REACT_APP_API_HOST:-http://localhost:3000}"
};
EOF

echo "==> /config/env.js generated:"
cat "$DOC_ROOT/config/env.js"

exec "$@"
