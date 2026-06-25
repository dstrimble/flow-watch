#!/bin/bash
mongoimport --host "localhost" --port "27017" \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase "admin" \
  --db "$MONGO_INITDB_DATABASE" --collection dam_codes --drop \
  --file /docker-entrypoint-initdb.d/damCodes.json --jsonArray
