# app/middleware/security_headers.py
from starlette.middleware.base import BaseHTTPMiddleware
import secrets
import hashlib

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        nonce = secrets.token_urlsafe(16)
        response.headers["Content-Security-Policy"] = (
            "img-src 'self' data: https:; "
            "connect-src 'self' wss: ws:; "
            "font-src 'self'; "
            "object-src 'none'; "
            "media-src 'self'; "
            "frame-src 'none';"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

        # Store nonce in request state for access in routes/templates
        request.state.nonce = nonce

        return response