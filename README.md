# BEMS Raffle

A full-screen classroom raffle. Drop in a class list, press **Draw a winner**, and names race across the stage until the lights slow down. The chosen kid gets confetti, rainbow swirls, stage lights, and a built-in fanfare. That name then leaves the hat.

**Practice draw** runs the same show and does not remove anyone.

The winner is chosen at random *before* the animation starts. The spinning names are the reveal, not the choice.

## Try it on this computer

```bash
npm install
npm run dev
```

Open the local address Vite prints. For a projector, use **Full screen**.

- **D** draws a winner
- **T** runs a practice draw
- **M** mutes the fanfare
- **F** fills the screen

No account is required. The list is saved in the browser. **Try demo names** loads a fake class so you can rehearse before the real file arrives. The gold banner stays up until you replace those names.

`examples/` has a CSV, a text file, a JSON file, and a last-name-first CSV. Excel workbooks (`.xlsx`), tab-separated files, semicolon files, and a pasted list work too. If a file is the older `.xls` format, save it as `.xlsx` or CSV first. After upload, check the names. **Swap first and last word** if they came out backwards. Repeated names are kept, in case two kids share one.

## Real draw vs practice

| Button | What the class sees | What happens to the name |
| --- | --- | --- |
| Draw a winner | Lights, slowdown, confetti, fanfare | Removed from the hat |
| Practice draw | The same show, marked Practice | Stays in the hat |

Put a winner back from the stage button (it asks for the lock code if you set one) or from **Names & setup**. **Sit out** takes an absent kid out without a prize. **Put everyone back** refills the hat.

The optional smartboard lock does not block the draw. It blocks setup, undo, and reset, so a student at the board cannot wipe the list. The code stays on that browser only. If it is forgotten, clear this site's data for the page.

The live site is [bems-raffle.netlify.app](https://bems-raffle.netlify.app/). The code is in [github.com/alanpark2/raffle](https://github.com/alanpark2/raffle).

## You do not need Firebase

The spin, the slowdown, the lights, the confetti, and the fanfare all run on the computer that is open in the browser. Nothing about the draw waits on the internet, so Firebase will not make it faster, and skipping it will not make it unreliable.

The class list is saved in that browser. Close the tab, come back later, and the names are still there. A practice draw and a real draw both work offline.

Firebase is only useful if you want the same list on a second computer. If you ever set it up, stay on the free Spark plan and do not turn on billing. The raffle still never waits on the network during a draw.

If you later want that second computer:

1. Go to [Firebase console](https://console.firebase.google.com/) → **Add project**. Analytics can stay off.
2. **Build → Firestore Database → Create database**. Choose a region near the school. Start in production mode.
3. **Build → Authentication → Sign-in method → Anonymous → Enable**.
4. **Project settings → Your apps → Web** (`</>`). Register the app and copy the `firebaseConfig` block.
5. **Firestore → Rules**. Paste `firestore.rules` from this project and publish.
6. In the raffle, open **Names & setup**, paste that config, and press **Connect Firebase**.

Leave the room code as the long `class-…` value, and use that same code on every computer that should share the list. Anyone who has the published site **and** the room code can open that list, so don't post the code. Kid names live in your Firebase project, not in this repository.

Spark's free quota is far above one class: the app writes one document per change, not one per name.

To bake the config into a Netlify deploy instead of pasting it, add the variables from `.env.example` in **Site settings → Environment variables** and redeploy. Those values override a pasted config.

## Netlify

[bems-raffle.netlify.app](https://bems-raffle.netlify.app/) builds from `main` on GitHub. Build command: `npm run build`. Publish directory: `dist`. `netlify.toml` sets Node 20.

Leave the `VITE_FIREBASE_*` variables empty. You do not need them.

The fanfare is generated in the browser. There is no music file to license or download.

## Scripts

```bash
npm test        # name parsing, the draw, and the Firebase paste box
npm run build   # static site in dist/
npm run preview # serve that build locally
```
