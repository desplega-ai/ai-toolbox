# meme-gen

CLI tool for generating memes using the [Imgflip API](https://imgflip.com/api).

## Setup

```bash
# Install dependencies
bun install

# Set credentials (free account at https://imgflip.com/signup)
export IMGFLIP_USERNAME="your_username"
export IMGFLIP_PASSWORD="your_password"
```

## Usage

```bash
# Generate a meme
bun src/index.ts generate --template "drake" --top "Writing tests" --bottom "Shipping to prod"

# Save to file
bun src/index.ts generate --template "this_is_fine" --top "Production is down" -o meme.jpg

# List popular templates
bun src/index.ts list
bun src/index.ts list --aliases

# Search templates
bun src/index.ts search "brain"
```

## Template names

You can use:
- **Built-in aliases**: `drake`, `this_is_fine`, `expanding_brain`, etc. (see `list --aliases`)
- **Full names**: `"Drake Hotline Bling"`, `"Distracted Boyfriend"`
- **Numeric IDs**: `181913649`
- **Partial matches**: `"brain"` will match `"Expanding Brain"`

## API

The tool uses two Imgflip endpoints:
- `GET /get_memes` — list available templates (no auth required)
- `POST /caption_image` — generate a meme (requires free account)
