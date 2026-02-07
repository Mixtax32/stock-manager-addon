ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install system dependencies
RUN apk add --no-cache sqlite

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/
COPY run.sh /

# Make run script executable
RUN chmod a+x /run.sh

# Labels
LABEL \
    io.hass.name="Stock Manager" \
    io.hass.description="Sistema de gestión de inventario doméstico" \
    io.hass.type="addon" \
    io.hass.version="0.1.0"

CMD [ "/run.sh" ]
