"""Home Assistant fixtures; real setup with simulated source entities."""

import pytest


@pytest.fixture(autouse=True)
def enable_hapo(enable_custom_integrations):
    """Discover the local integration."""
