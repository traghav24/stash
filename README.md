# Stash

Feed anything to the dog. It files what you save, plans what you have to do, and times you while you do it.

- **Canvas**: everything you've saved, grouped into topic piles. Piles start folded so the board stays calm.
- **Plans**: what you have to do, shown as time you can see (how much of the day is left, whether today fits, a "What now?" button).
- **The dog**: sits on top of every window. Drag things onto it, click it to type, press ⌥ Tab to dump whatever you just copied.

## Download (Mac)

Get the latest installer from [Releases](https://github.com/traghav24/stash/releases/latest):

- **Apple silicon** (M1 and later): `Stash-…-arm64.dmg`
- **Intel**: `Stash-…-x64.dmg`

Open the file and drag Stash into Applications. The app isn't signed with an Apple developer account, so the first time, macOS will refuse to open it: go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. After that it opens normally.

## Run it from source

```bash
npm install
npm run dev     # live-reloading app
npm start       # build once and run
npm run dist    # package the Mac installers into release/
```

`npm run web` opens just the UI in a browser tab (data in localStorage), which is handy for design tweaks.

## Ways to save

| From | How |
|---|---|
| Anywhere | ⌥ Tab opens the dog's card with your clipboard already in it (text, a link, an image, or a file copied in Finder). Enter saves. |
| The dog's card | Paste (⌘V) screenshots, images, PDFs or any file, drop them on, or use **+ add file**. They show as chips; whatever you type becomes their note. Backspace in an empty card removes the last one. |
| Anywhere | Drag an image, link, text or file onto the dog. |
| The Stash window | Paste (⌘V), drop, or type in the bar. Tab switches Canvas / Plans. |
| Dia | Right-click an image, selection, link or page and choose **Save … to Stash** (⌥⇧S saves the page). |

### Install the Dia extension

1. Open `dia://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. Keep the Stash app running. The extension sends saves to it at `127.0.0.1:47123`.

## Auto-sorting with Claude

Without credentials, Stash uses local rules: it reads dates ("thursday 6pm"), spots to-dos, and groups by type.
With Claude, it also names topic piles, writes a tiny first step for big tasks, and estimates how long things take.
To turn that on, do one of these before launching:

```bash
export ANTHROPIC_API_KEY=...   # or
ant auth login
```

## Where your data lives

`~/Stash/items.json`, `~/Stash/settings.json`, and `~/Stash/media/`. They're plain files you can back up.
Archiving hides an item. Nothing is deleted.

## Time-blindness features

- A **day-left bar** that shrinks, with your planned work drawn on it so overflow is visible.
- A **fit check**: "this is ~5h, you have ~3h".
- **Task blocks sized by length**: a 2h task looks four times as big as a 30 min one.
- **Estimates that learn**: Stash times your tasks and adjusts future guesses per pile.
- **The dog follows the day**: lively in the morning, naps after lunch (2–4:30pm), active again in the evening, drowsy from 11pm, and at 1am it heads to bed and tells you to sleep too, nudging again every half hour until 5am if you're still up.
- **A running timer** in the dog's speech bubble ("40 min in"), and a heads-up an hour before anything with a set time.
- **Relative times everywhere**: "tomorrow", "this weekend", "in 2 weeks".
- **Nothing is ever overdue**: missed tasks show as "still on your plate", and after a week Stash asks whether you still want them.

## Next up

- Calendar sync, so "time left" accounts for meetings
- Bringing back old saves you've forgotten about
- "While you were away" catch-up after a few days off
- More dog reactions and animation
- "Save to Stash" in the Mac Share menu, for other apps
