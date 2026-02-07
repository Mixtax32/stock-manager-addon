#!/usr/bin/with-contenv bashio

# Get configuration
CONFIG_PATH=/data/options.json
LOG_LEVEL=$(bashio::config 'log_level')

bashio::log.info "Starting Stock Manager..."
bashio::log.info "Log level: ${LOG_LEVEL}"

# Create data directory
mkdir -p /data/stock_manager

# Set database path
export DATABASE_PATH=/data/stock_manager/stock.db
export LOG_LEVEL="${LOG_LEVEL}"

# Start the application
cd /app
exec python3 -m app.main