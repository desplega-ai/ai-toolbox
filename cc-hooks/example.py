#!/usr/bin/env python3
import json
import sys

sys.exit(0)


# Main execution
try:
    input_data = json.load(sys.stdin)

    # Save it to a random file in the format 
    # /tmp/cc/yyyy-mm-dd-hh-mm-ss-<random>.json

    from datetime import datetime
    import os
    import random
    import string

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    filename = f"/tmp/cc/{timestamp}-{random_str}.json"

    os.makedirs("/tmp/cc", exist_ok=True)

    with open(filename, 'w') as f:
        json.dump(input_data, f, indent=2)

    print(f"✓ Saved to {filename}")
    
except Exception as e:
    print(f"✗ Error: {e}", file=sys.stderr)
    sys.exit(1)
