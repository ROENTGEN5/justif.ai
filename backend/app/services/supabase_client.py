"""
Supabase Client Initialization
Provides a singleton Supabase client for database operations.
"""

from supabase import create_client, Client
from app.config import settings


def get_supabase_client() -> Client:
    """Create and return a Supabase client instance."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def get_user_client(token: str) -> Client:
    """Create a Supabase client configured with a specific user's JWT."""
    from supabase import ClientOptions
    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)


# Singleton client for use across the application (unauthenticated)
supabase: Client = get_supabase_client()
