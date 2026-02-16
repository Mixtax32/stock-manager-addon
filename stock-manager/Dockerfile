ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install Python and dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    gcc \
    musl-dev \
    linux-headers \
    sqlite \
    g++ \
    make \
    libsm \
    libxext \
    libxrender-dev \
    freetype-dev \
    libjpeg-turbo-dev \
    zlib-dev \
    openblas-dev \
    lapack-dev \
    tesseract-ocr \
    tesseract-ocr-data-spa \
    libxkbcommon \
    fontconfig \
    libgomp

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --break-system-packages --upgrade pip setuptools wheel && \
    pip3 install --no-cache-dir --break-system-packages -r requirements.txt

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
    io.hass.version="0.4.0"

CMD [ "/run.sh" ]
