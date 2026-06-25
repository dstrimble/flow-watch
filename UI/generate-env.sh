#!/bin/sh
# Entrypoint script to generate env.js from environment variables
mkdir -p /app/public/config
cat <<EOF > /app/public/config/env.js
window._env_ = {
  REACT_APP_API_HOST: "${REACT_APP_API_HOST}"
};
EOF

# Ensure env.js is also available in build/config for static serving
mkdir -p /app/build/config
cp /app/public/config/env.js /app/build/config/env.js

exec "$@"
