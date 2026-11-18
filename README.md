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

`examples/` has a CSV, a text file, a JSON file, and a last-name-first CSV. Excel workbooks (`.xlsx`), tab-separated files, semicolon files, and a pasted list work too. If a file is the older `.xls` format, save it as `.xlsx` or CSV first. After upload, check the names. **Swap first and last word** if they came out backwards. Repeated names are kept. On a nomination form, each extra entry is another chance. Winning removes every copy of that name, so a student can win only once.

## Real draw vs practice

| Button | What the class sees | What happens to the name |
| --- | --- | --- |
| Draw a winner | Lights, slowdown, confetti, fanfare | Every copy of that name leaves the hat |
| Practice draw | The same show, marked Practice | Stays in the hat |

Put a winner back from the stage button (it asks for the lock code if you set one) or from **Names & setup**. **Sit out** takes an absent kid out without a prize. **Put everyone back** refills the hat.

The optional smartboard lock does not block the draw. It blocks setup, undo, and reset, so a student at the board cannot wipe the list. The code stays on that browser only. If it is forgotten, clear this site's data for the page.

The live site is [bems-raffle.netlify.app](https://bems-raffle.netlify.app/). The code is in [github.com/alanpark2/raffle](https://github.com/alanpark2/raffle).

## Shared list

The spin, the slowdown, the lights, the confetti, and the fanfare all run on the computer that is open in the browser. Nothing about the draw waits on the internet. Firebase only syncs the class list.

Anyone who opens [bems-raffle.netlify.app](https://bems-raffle.netlify.app/) sees the same list. There is no room code and nothing to paste. On the computer that already has the names, refresh once so that roster uploads. The presentation computer only needs the site address. Anyone with that address can see and change the list.

The list is also saved in the browser, so a practice draw and a real draw still work if the network blips. **Save a copy** downloads `bems-raffle.json` when you want a file backup. Drop that file on the site to open it.

Stay on the free Spark plan and do not turn on billing. Spark's free quota is far above one assembly: the app writes one document per change, not one per name. Kid names live in the Firebase project, not in this repository.

## Netlify

[bems-raffle.netlify.app](https://bems-raffle.netlify.app/) builds from `main` on GitHub. Build command: `npm run build`. Publish directory: `dist`. `netlify.toml` sets Node 20.

The public Firebase web config is already included. Set the `VITE_FIREBASE_*` variables only to override it, then redeploy. Leave them empty to use the built-in config.

The fanfare is generated in the browser. There is no music file to license or download.

## Scripts

```bash
npm test        # name parsing, the draw, and the shared list
npm run build   # static site in dist/
npm run preview # serve that build locally
```
