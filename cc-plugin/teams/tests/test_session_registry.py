"""Tests for the teams session registry hook.

Run with: python3 -m unittest discover cc-plugin/teams/tests
"""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent
HOOK = PLUGIN_DIR / "hooks" / "session-registry.py"
MANIFEST = PLUGIN_DIR / ".claude-plugin" / "plugin.json"


class SessionRegistryTest(unittest.TestCase):
    def setUp(self):
        self._home = tempfile.TemporaryDirectory()
        self.home = Path(self._home.name)
        self.env = {**os.environ, "HOME": str(self.home)}
        self.env.pop("TMUX_PANE", None)
        self.env.pop("CLAUDE_ENV_FILE", None)

    def tearDown(self):
        self._home.cleanup()

    def run_hook(self, payload):
        subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(payload),
            env=self.env,
            capture_output=True,
            text=True,
            check=True,
        )

    def db(self):
        return sqlite3.connect(self.home / ".desplega" / "desplega.db")

    def start(self, session_id):
        self.run_hook(
            {"hook_event_name": "SessionStart", "session_id": session_id, "cwd": "/tmp"}
        )

    def session_ids(self):
        with self.db() as conn:
            return {r[0] for r in conn.execute("SELECT session_id FROM sessions")}

    def unread_for(self, session_id):
        with self.db() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM messages WHERE recipient_id = ? AND read_at IS NULL",
                (session_id,),
            ).fetchone()[0]

    def send(self, sender, recipient):
        with self.db() as conn:
            conn.execute(
                "INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)",
                (sender, recipient, "please review PR 12"),
            )

    def test_stop_keeps_session_and_unread_messages(self):
        # Stop fires after every assistant turn, so an idle session must stay
        # registered and keep the messages waiting for it.
        self.start("sess-A")
        self.start("sess-B")
        self.send("sess-A", "sess-B")

        self.run_hook(
            {"hook_event_name": "Stop", "session_id": "sess-B", "stop_hook_active": False}
        )

        self.assertIn("sess-B", self.session_ids())
        self.assertEqual(self.unread_for("sess-B"), 1)

    def test_session_end_deregisters_session(self):
        self.start("sess-A")
        self.start("sess-B")
        self.send("sess-A", "sess-B")

        self.run_hook(
            {"hook_event_name": "SessionEnd", "session_id": "sess-B", "reason": "other"}
        )

        self.assertEqual(self.session_ids(), {"sess-A"})
        self.assertEqual(self.unread_for("sess-B"), 0)

    def test_manifest_deregisters_on_session_end_not_stop(self):
        hooks = json.loads(MANIFEST.read_text())["hooks"]
        self.assertIn("SessionEnd", hooks)
        self.assertNotIn("Stop", hooks)


if __name__ == "__main__":
    unittest.main()
