ARG BUILD_FROM
FROM $BUILD_FROM

# Install requirements
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite

# Copy app
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY run.sh /
RUN chmod a+x /run.sh

# Labels
LABEL \
    io.hass.name="Stock Manager" \
    io.hass.description="Sistema de gestión de inventario doméstico" \
    io.hass.arch="armhf|aarch64|i386|amd64|armv7" \
    io.hass.type="addon" \
    io.hass.version="0.1.0"

CMD [ "/run.sh" ]