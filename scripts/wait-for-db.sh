#!/bin/bash

# Extract host, port, user from DATABASE_URL
DB_URL=$DATABASE_URL

DB_HOST=$(echo $DB_URL | sed -n 's|postgresql://\([^:]*\):\([^@]*\)@\([^:]*\):\([^/]*\)/.*|\3|p')
DB_PORT=$(echo $DB_URL | sed -n 's|postgresql://\([^:]*\):\([^@]*\)@\([^:]*\):\([^/]*\)/.*|\4|p')
DB_USER=$(echo $DB_URL | sed -n 's|postgresql://\([^:]*\):\([^@]*\)@\([^:]*\):\([^/]*\)/.*|\1|p')

echo "Waiting for database at $DB_HOST:$DB_PORT..."

until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
  echo "Database not ready, waiting..."
  sleep 5
done

echo "Database is ready!"