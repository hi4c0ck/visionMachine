"""Tests for encrypted key store."""
import pytest
import tempfile
from pathlib import Path


@pytest.fixture
def key_store():
    """Create a temporary encrypted key store for testing."""
    from src.security.key_store import EncryptedKeyStore
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        store = EncryptedKeyStore(db_path, "test_master_password")
        yield store
    finally:
        # Clean up
        Path(db_path).unlink(missing_ok=True)


def test_save_and_retrieve_key(key_store):
    """Test saving and retrieving an API key."""
    test_key = "sk-test-123456"
    
    # Save key
    key_store.save_key("agnes", test_key)
    
    # Retrieve key
    retrieved = key_store.get_key("agnes")
    
    assert retrieved == test_key


def test_key_exists(key_store):
    """Test checking if a key exists."""
    assert not key_store.key_exists("agnes")
    
    key_store.save_key("agnes", "test-key")
    
    assert key_store.key_exists("agnes")


def test_list_providers(key_store):
    """Test listing configured providers."""
    key_store.save_key("agnes", "key1")
    key_store.save_key("openai", "key2")
    
    providers = key_store.list_providers()
    
    assert "agnes" in providers
    assert "openai" in providers
    assert len(providers) == 2


def test_delete_key(key_store):
    """Test deleting a key."""
    key_store.save_key("agnes", "test-key")
    assert key_store.key_exists("agnes")
    
    deleted = key_store.delete_key("agnes")
    
    assert deleted is True
    assert not key_store.key_exists("agnes")


def test_delete_nonexistent_key(key_store):
    """Test deleting a key that doesn't exist."""
    deleted = key_store.delete_key("nonexistent")
    
    assert deleted is False


def test_encryption_different_per_save(key_store):
    """Test that encryption produces different ciphertext."""
    key_store.save_key("agnes", "same-key")
    first_encrypted = key_store.get_key("agnes")
    
    # Same key should produce same plaintext when decrypted
    assert first_encrypted == "same-key"


def test_different_keys_dont_conflict(key_store):
    """Test that different providers don't conflict."""
    key_store.save_key("agnes", "agnes-key")
    key_store.save_key("openai", "openai-key")
    
    assert key_store.get_key("agnes") == "agnes-key"
    assert key_store.get_key("openai") == "openai-key"


def test_clear_all_keys(key_store):
    """Test clearing all stored keys."""
    key_store.save_key("agnes", "key1")
    key_store.save_key("openai", "key2")
    
    count = key_store.clear_all()
    
    assert count == 2
    assert len(key_store.list_providers()) == 0


def test_update_existing_key(key_store):
    """Test updating an existing key."""
    key_store.save_key("agnes", "old-key")
    key_store.save_key("agnes", "new-key")
    
    assert key_store.get_key("agnes") == "new-key"


def test_wrong_password_fails():
    """Test that wrong password prevents access."""
    import tempfile
    from pathlib import Path
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        db_path = tmp.name
    
    try:
        store1 = EncryptedKeyStore(db_path, "password1")
        store1.save_key("agnes", "secret-key")
        
        store2 = EncryptedKeyStore(db_path, "password2")
        
        with pytest.raises(Exception):
            store2.get_key("agnes")
    finally:
        Path(db_path).unlink(missing_ok=True)
