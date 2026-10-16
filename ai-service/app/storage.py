"""Sube la foto del producto y devuelve una URL pública.

En producción esto debe ser Azure Blob Storage (coincide con lo que
next.config.ts ya espera vía AZURE_BLOB_HOSTNAME, tanto en la CSP como en
remotePatterns de <Image>). Sin una cadena de conexión configurada, cae a
guardar el archivo en disco y servirlo desde este mismo FastAPI — sirve
para desarrollo local, nunca para producción (el disco de un contenedor
no es persistente ni compartido entre réplicas).
"""

import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import settings


async def guardar_imagen(archivo: UploadFile) -> str:
    extension = Path(archivo.filename or "").suffix or ".jpg"
    nombre = f"{uuid.uuid4()}{extension}"
    contenido = await archivo.read()

    if settings.azure_storage_connection_string:
        from azure.storage.blob.aio import BlobServiceClient

        async with BlobServiceClient.from_connection_string(
            settings.azure_storage_connection_string
        ) as client:
            container = client.get_container_client(settings.azure_storage_container)
            blob = container.get_blob_client(nombre)
            await blob.upload_blob(contenido, overwrite=True, content_type=archivo.content_type)
            return blob.url

    settings.local_media_dir.mkdir(parents=True, exist_ok=True)
    destino = settings.local_media_dir / nombre
    destino.write_bytes(contenido)
    return f"{settings.public_base_url}/media/{nombre}"
