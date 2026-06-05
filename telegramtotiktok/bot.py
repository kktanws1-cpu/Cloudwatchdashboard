import asyncio
import json
import os
import pathlib
import sys

from src.fetch import get_client, fetch_new_photos
from src.downloader import download_photos, cleanup
from src.tiktok import post_images_to_tiktok

STATE_FILE = pathlib.Path(__file__).parent / "state.json"


def load_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_id": 0}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


async def main():
    channel = os.environ.get("TELEGRAM_CHANNEL")
    if not channel:
        print("[bot] Missing TELEGRAM_CHANNEL", file=sys.stderr)
        sys.exit(1)

    state = load_state()
    print(f"[bot] Checking from message id {state['last_id']}")

    client = await get_client()

    try:
        groups, new_last_id = await fetch_new_photos(client, channel, state["last_id"])
    finally:
        await client.disconnect()

    if not groups:
        print("[bot] No new photos.")
        return

    print(f"[bot] Found {len(groups)} album(s) to post")

    for group in groups:
        caption = next((msg.message for msg in group if msg.message), "")
        local_files = []
        try:
            local_files = await download_photos(client, group) if not client.is_connected() else []
            # Re-connect for download if needed
            if not local_files:
                client = await get_client()
                try:
                    local_files = await download_photos(client, group)
                finally:
                    await client.disconnect()
            post_images_to_tiktok(local_files, caption)
            print(f"[bot] Posted {len(local_files)} photo(s) to TikTok")
        except Exception as e:
            print(f"[bot] Failed: {e}", file=sys.stderr)
        finally:
            cleanup(local_files)

    state["last_id"] = new_last_id
    save_state(state)
    print(f"[bot] State saved. Next from id: {new_last_id}")


asyncio.run(main())
