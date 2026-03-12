"""Slug generation for desplega teams plugin.

Generates human-readable session identifiers in the format:
    adjective-noun-number  (e.g., "bold-eagle-1337")
"""

import random

ADJECTIVES = [
    "bold", "brave", "bright", "calm", "clever",
    "cool", "crisp", "daring", "eager", "fast",
    "fierce", "fresh", "grand", "happy", "keen",
    "lively", "lucky", "mighty", "noble", "proud",
    "quick", "quiet", "rapid", "sharp", "sleek",
    "smart", "snappy", "solar", "steady", "stout",
    "strong", "super", "swift", "tall", "tough",
    "vivid", "warm", "wild", "wise", "witty",
    "agile", "alert", "amber", "azure", "coral",
    "cyber", "frosty", "jade", "neon", "turbo",
]

NOUNS = [
    "eagle", "falcon", "hawk", "wolf", "bear",
    "tiger", "lion", "fox", "otter", "raven",
    "cobra", "crane", "drake", "lynx", "puma",
    "shark", "viper", "bison", "cedar", "maple",
    "oak", "pine", "birch", "flame", "spark",
    "storm", "blaze", "frost", "wave", "ridge",
    "peak", "reef", "mesa", "dune", "vale",
    "forge", "anvil", "blade", "arrow", "shield",
    "nexus", "prism", "pulse", "orbit", "quark",
    "comet", "atlas", "helix", "sigma", "omega",
]

FUNNY_NUMBERS = [
    42, 69, 80, 99, 100, 101, 111, 123, 200, 256,
    303, 314, 333, 404, 420, 451, 500, 512, 666, 700,
    707, 777, 808, 888, 900, 911, 999, 1000, 1024, 1099,
    1234, 1337, 1400, 1500, 1701, 1984, 2001, 2020, 2048, 2600,
    3000, 3001, 4000, 4004, 4040, 4242, 5000, 8000, 8080, 9000,
]


def generate_slug():
    """Generate a random slug in adjective-noun-number format."""
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    num = random.choice(FUNNY_NUMBERS)
    return f"{adj}-{noun}-{num}"


def generate_unique_slug(existing):
    """Generate a slug that isn't in the existing set.

    Tries random generation up to 50 times, then falls back to
    appending a random suffix.
    """
    for _ in range(50):
        slug = generate_slug()
        if slug not in existing:
            return slug
    # Fallback: append random 4-digit suffix
    base = generate_slug()
    suffix = random.randint(1000, 9999)
    return f"{base}-{suffix}"
