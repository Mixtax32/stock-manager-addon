#!/usr/bin/with-contenv bashio

# Get configuration
CONFIG_PATH=/data/options.json
LOG_LEVEL=$(bashio::config 'log_level')

bashio::log.info "Starting Stock Manager..."
bashio::log.info "Log level: ${LOG_LEVEL}"

# Create data directory
mkdir -p /data/stock_manager

# Set database path
export TELEGRAM_TOKEN=$(bashio::config 'telegram_token')
export ALLOWED_CHAT_IDS=$(bashio::config 'allowed_chat_ids')
export DATABASE_PATH=/data/stock_manager/stock.db
export LOG_LEVEL="${LOG_LEVEL}"

# Start the application
cd /app
exec python3 -m app.main