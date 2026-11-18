import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-ext-500.css";
import "@fontsource/fredoka/latin-700.css";
import "@fontsource/fredoka/latin-ext-700.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-ext-600.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-ext-800.css";
import "./styles.css";
import { ShowAudio } from "./audio";
import { PARTY_COLORS, colorFor } from "./color";
import { celebrateBurst, mountConfetti } from "./confetti";
import { DEMO_NAMES } from "./demo";
import { configFromEnv } from "./firebaseConfig";
import { PIN_KEY, hasPeople, raffleFile, readSavedRaffle, sameShow } from "./model";
import { dedupeNames, flipFirstLast, namesFromFile, namesFromText, type ParseResult } from "./parseNames";
import {
  addName,
  addNames,
  applyDraw,
  buildSequence,
  loadDemo,
  pickWinner,
  putBack,
  replaceHat,
  resetHat,
  sitOut,
  stepDelay,
  type DrawMode,
} from "./raffle";
import { RaffleStore } from "./store";

type Phase = "idle" | "spinning" | "celebrating";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const audio = new ShowAudio();
const store = new RaffleStore(() => render());

const roomLabel = must<HTMLElement>("room-label");
const syncPill = must<HTMLButtonElement>("sync-pill");
const muteBtn = must<HTMLButtonElement>("mute-btn");
const fullBtn = must<HTMLButtonElement>("full-btn");
const manageBtn = must<HTMLButtonElement>("manage-btn");
const floaters = must<HTMLElement>("floaters");
const floaterEls = [...floaters.querySelectorAll<HTMLElement>(".floater")];
const empty = must<HTMLElement>("empty");
const dropzone = must<HTMLElement>("dropzone");
const fileInput = must<HTMLInputElement>("file");
const paste = must<HTMLTextAreaElement>("paste");
const stage = must<HTMLElement>("stage");
const demoBanner = must<HTMLElement>("demo-banner");
const conflict = must<HTMLElement>("conflict");
const conflictText = must<HTMLElement>("conflict-text");
const ribbon = must<HTMLElement>("ribbon");
const caption = must<HTMLElement>("caption");
const hero = must<HTMLElement>("hero-name");
const countLine = must<HTMLElement>("count-line");
const drawBtn = must<HTMLButtonElement>("draw-btn");
const testBtn = must<HTMLButtonElement>("test-btn");
const putbackBtn = must<HTMLButtonElement>("putback-btn");
const resetStage = must<HTMLButtonElement>("reset-stage");
const pickedWrap = must<HTMLElement>("picked-wrap");
const pickedList = must<HTMLElement>("picked-list");
const live = must<HTMLElement>("live");
const flash = must<HTMLElement>("flash");
const manage = must<HTMLDialogElement>("manage");
const preview = must<HTMLDialogElement>("preview");
const pinDialog = must<HTMLDialogElement>("pin-dialog");
const confirmDialog = must<HTMLDialogElement>("confirm-dialog");
const classTitle = must<HTMLInputElement>("class-title");
const setupNote = must<HTMLElement>("setup-note");
const syncDetail = must<HTMLElement>("sync-detail");
const pasteManage = must<HTMLTextAreaElement>("paste-manage");
const addNameInput = must<HTMLInputElement>("add-name");
const nameFilter = must<HTMLInputElement>("name-filter");
const hatList = must<HTMLElement>("hat-list");
const winnerAdmin = must<HTMLElement>("winner-admin");
const outList = must<HTMLElement>("out-list");
const newPin = must<HTMLInputElement>("new-pin");
const previewCount = must<HTMLElement>("preview-count");
const previewNotes = must<HTMLElement>("preview-notes");
const previewList = must<HTMLElement>("preview-list");
const pinTitle = must<HTMLElement>("pin-title");
const pinInput = must<HTMLInputElement>("pin-input");
const pinError = must<HTMLElement>("pin-error");
const confirmTitle = must<HTMLElement>("confirm-title");
const confirmBody = must<HTMLElement>("confirm-body");
const confirmYes = must<HTMLButtonElement>("confirm-yes");

let phase: Phase = "idle";
let lastMode: DrawMode = "real";
let ambientOn = false;
let ambientTimer = 0;
let calmTimer = 0;
let ambientIndex = -1;
let floaterOffset = 0;
let draftNames: string[] = [];

boot();

function boot(): void {
  mountConfetti(must<HTMLCanvasElement>("fx"));
  paintStars();
  paintBulbs();
  bind();
  render();
  void store.connect(configFromEnv());
}

function bind(): void {
  muteBtn.addEventListener("click", () => {
    audio.toggle();
    render();
  });
  fullBtn.addEventListener("click", () => void toggleFull());
  document.addEventListener("fullscreenchange", () => {
    fullBtn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  });
  manageBtn.addEventListener("click", () => void openManage());
  syncPill.addEventListener("click", () => void openManage());
  must<HTMLButtonElement>("close-manage").addEventListener("click", () => manage.close());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void handleFile(file);
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("hot");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("hot"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("hot");
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
  must<HTMLButtonElement>("use-paste").addEventListener("click", () => openPreview(namesFromText(paste.value)));
  must<HTMLButtonElement>("use-paste-manage").addEventListener("click", () => openPreview(namesFromText(pasteManage.value)));
  must<HTMLButtonElement>("demo-btn").addEventListener("click", () => useDemo());
  must<HTMLButtonElement>("demo-manage").addEventListener("click", () => void useDemoGuarded());
  must<HTMLButtonElement>("upload-btn").addEventListener("click", pickNames);
  must<HTMLButtonElement>("upload-top").addEventListener("click", pickNames);
  must<HTMLButtonElement>("upload-empty").addEventListener("click", pickNames);
  must<HTMLButtonElement>("open-saved-btn").addEventListener("click", pickNames);
  drawBtn.addEventListener("click", () => void spin("real"));
  testBtn.addEventListener("click", () => void spin("test"));
  putbackBtn.addEventListener("click", () => void restoreLast());
  resetStage.addEventListener("click", () => void restoreAll());
  must<HTMLButtonElement>("reset-btn").addEventListener("click", () => void restoreAll());
  must<HTMLButtonElement>("download-btn").addEventListener("click", downloadNames);
  must<HTMLButtonElement>("save-copy-btn").addEventListener("click", saveCopy);
  must<HTMLButtonElement>("add-name-btn").addEventListener("click", addTypedName);
  addNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTypedName();
    }
  });
  nameFilter.addEventListener("input", renderLists);
  classTitle.addEventListener("change", () => {
    const title = classTitle.value.trim().slice(0, 79) || "Classroom Raffle";
    store.commit({ ...store.data, title });
  });
  must<HTMLButtonElement>("save-pin").addEventListener("click", () => void savePin());
  must<HTMLButtonElement>("clear-pin").addEventListener("click", () => void clearPin());
  must<HTMLButtonElement>("use-local").addEventListener("click", () => store.useBrowserList());
  must<HTMLButtonElement>("dismiss-conflict").addEventListener("click", () => store.keepSharedList());
  must<HTMLButtonElement>("close-preview").addEventListener("click", () => preview.close());
  must<HTMLButtonElement>("flip-btn").addEventListener("click", () => {
    draftNames = flipFirstLast(readPreview());
    renderPreview();
  });
  must<HTMLButtonElement>("dedupe-btn").addEventListener("click", () => {
    draftNames = dedupeNames(readPreview());
    renderPreview();
  });
  must<HTMLButtonElement>("use-btn").addEventListener("click", () => void acceptPreview("replace"));
  must<HTMLButtonElement>("add-btn").addEventListener("click", () => void acceptPreview("add"));
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopIdle();
    else if (phase === "idle") render();
  });
}

function render(): void {
  const data = store.data;
  const showStage = hasPeople(data);
  empty.hidden = showStage;
  stage.hidden = !showStage;
  floaters.hidden = data.names.length === 0;
  roomLabel.textContent = data.title;
  demoBanner.hidden = !data.demo;
  conflict.hidden = !store.conflict;
  conflictText.textContent = store.conflict
    ? "The shared list is different from the list saved on this browser. You're seeing the shared list. You can switch to the list that was on this browser."
    : "";
  syncPill.dataset.state = store.sync;
  syncPill.textContent = store.sync === "live" ? "Synced" : store.sync === "connecting" ? "Connecting…" : store.sync === "error" ? "Sync problem" : "This browser";
  syncPill.title = store.syncMessage;
  syncDetail.textContent = store.syncMessage;
  syncDetail.classList.toggle("is-error", store.sync === "error");
  muteBtn.textContent = audio.muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", audio.muted ? "true" : "false");
  countLine.textContent = countLabel(data.names.length, data.winners.length);
  drawBtn.disabled = phase === "spinning" || data.names.length === 0;
  must<HTMLButtonElement>("save-copy-btn").disabled = !hasPeople(data);
  testBtn.disabled = drawBtn.disabled;
  drawBtn.textContent = data.names.length === 0 ? "Hat is empty" : data.winners.length || phase === "celebrating" ? "Draw the next name" : "Draw a winner";
  ribbon.hidden = phase !== "celebrating";
  ribbon.textContent = lastMode === "test" ? "Practice" : "Winner";
  ribbon.classList.toggle("practice", lastMode === "test");
  putbackBtn.hidden = !(phase === "celebrating" && lastMode === "real");
  resetStage.hidden = data.names.length > 0 || (data.winners.length === 0 && data.out.length === 0);
  if (phase !== "spinning") {
    caption.textContent = phase === "celebrating"
      ? lastMode === "test" ? "Practice draw. Still in the hat." : "That's the one!"
      : data.names.length ? "In the hat" : "The hat is empty";
  }
  if (document.activeElement !== classTitle) classTitle.value = data.title;
  renderPicked();
  if (manage.open) renderLists();
  if (phase === "idle" && data.names.length && !document.hidden) {
    if (!ambientOn) {
      ambientOn = true;
      showAmbient();
      ensureIdle();
    }
  } else if (phase !== "spinning") {
    ambientOn = false;
    stopIdle();
    if (phase === "idle" && !data.names.length) paintHero(showStage ? "All picked" : "Add a class list", "soft");
  }
}

async function spin(mode: DrawMode): Promise<void> {
  if (phase === "spinning" || store.data.names.length === 0) return;
  const pool = store.data.names.slice();
  const winner = pickWinner(pool);
  const steps = pool.length <= 1 ? 1 : reduceMotion ? 10 : 32;
  const sequence = buildSequence(pool, winner, steps);
  phase = "spinning";
  lastMode = mode;
  store.spinning = true;
  ambientOn = false;
  stopIdle();
  document.body.classList.add("is-spinning");
  document.body.classList.remove("is-celebrating", "is-slowing");
  hero.setAttribute("aria-hidden", "true");
  live.textContent = mode === "test" ? "Practice draw started." : "Drawing a winner.";
  render();
  audio.startBed();
  try {
    if (pool.length === 1) {
      paintHero(winner, "slow");
      caption.textContent = "Only one name left…";
      await sleep(reduceMotion ? 250 : 1000);
    } else {
      for (let i = 0; i < sequence.length; i++) {
        const progress = i / (sequence.length - 1);
        const speed = i === sequence.length - 1 ? "final" : progress > 0.62 ? "slow" : "fast";
        paintHero(sequence[i], speed);
        paintFloaters(pool, i);
        caption.textContent = progress > 0.62 ? "Slowing down…" : progress > 0.2 ? "Who will it be?" : "Here we go!";
        document.body.classList.toggle("is-slowing", progress > 0.62);
        audio.tick(progress);
        if (i < sequence.length - 1) await sleep(stepDelay(i, sequence.length));
      }
    }
    if (mode === "real") store.commit(applyDraw(store.data, winner, "real"));
    phase = "celebrating";
    paintHero(winner, "final");
    if (!reduceMotion) popFlash();
    celebrateBurst(reduceMotion);
    audio.fanfare();
    live.textContent = mode === "test" ? `Practice pick: ${winner}. Still in the hat.` : `Winner: ${winner}. Removed from the hat.`;
    window.clearTimeout(calmTimer);
    calmTimer = window.setTimeout(() => {
      if (phase === "celebrating") document.body.classList.remove("is-celebrating");
    }, 8000);
  } finally {
    if (phase === "spinning") phase = "idle";
    document.body.classList.remove("is-spinning", "is-slowing");
    if (phase === "celebrating") document.body.classList.add("is-celebrating");
    hero.removeAttribute("aria-hidden");
    store.spinning = false;
    store.flushRemote();
    render();
  }
}

async function restoreLast(): Promise<void> {
  const latest = store.data.winners[0];
  if (!latest) return;
  if (!(await askPin("Enter the lock code to put this name back"))) return;
  store.commit(putBack(store.data, latest.name));
  phase = "idle";
  document.body.classList.remove("is-celebrating");
  render();
}

async function restoreAll(): Promise<void> {
  if (!(await askPin("Enter the lock code to reset the hat"))) return;
  const ok = await confirmAction("Put everyone back?", "Winners and kids sitting out all go back into the hat.", "Put them back");
  if (!ok) return;
  store.commit(resetHat(store.data));
  phase = "idle";
  document.body.classList.remove("is-celebrating");
  render();
}

function useDemo(): void {
  store.commit(loadDemo(store.data, DEMO_NAMES));
  phase = "idle";
  ambientOn = false;
  document.body.classList.remove("is-celebrating");
  manage.close();
  render();
}

async function useDemoGuarded(): Promise<void> {
  if (hasPeople(store.data) && !store.data.demo) {
    const ok = await confirmAction("Replace the class with demo names?", "The current hat will be cleared so you can rehearse.", "Load demo names");
    if (!ok) return;
  }
  useDemo();
}

function pickNames(): void {
  if (!readPin()) {
    fileInput.click();
    return;
  }
  void askPin("Enter the lock code to upload names").then((ok) => {
    if (ok) fileInput.click();
  });
}

async function handleFile(file: File): Promise<void> {
  if (file.size > 5_000_000) {
    openPreview({ names: [], notes: ["That file is larger than 5 MB. Export just the names and try again."], duplicates: [] });
    return;
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "json" || file.type.includes("json")) {
    const text = await file.text();
    const saved = readSavedRaffle(text);
    if (saved) {
      await restoreSaved(saved);
      return;
    }
    openPreview(namesFromText(text, "json"));
    return;
  }
  try {
    openPreview(await namesFromFile(file));
  } catch {
    openPreview({ names: [], notes: ["Could not read that file. Save it as CSV, or paste the names."], duplicates: [] });
  }
}

async function restoreSaved(saved: ReturnType<typeof readSavedRaffle>): Promise<void> {
  if (!saved) return;
  if (hasPeople(store.data) && !store.data.demo && !sameShow(store.data, saved)) {
    const ok = await confirmAction(
      "Open this saved raffle?",
      "This replaces the list on this computer, including anyone already picked.",
      "Open the saved raffle",
    );
    if (!ok) return;
  }
  store.commit({ ...saved, demo: saved.demo });
  phase = "idle";
  ambientOn = false;
  document.body.classList.remove("is-celebrating");
  manage.close();
  preview.close();
  note(`Opened the saved raffle. ${saved.names.length} names are in the hat.`);
  render();
}

function openPreview(result: ParseResult): void {
  draftNames = result.names.slice();
  previewNotes.replaceChildren();
  for (const message of result.notes) {
    const item = document.createElement("li");
    item.textContent = message;
    previewNotes.append(item);
  }
  renderPreview();
  if (!preview.open) preview.showModal();
}

function renderPreview(): void {
  previewCount.textContent = draftNames.length === 1 ? "1 name found" : `${draftNames.length} names found`;
  previewList.replaceChildren();
  draftNames.forEach((name, index) => {
    const item = document.createElement("li");
    item.className = "person";
    item.style.setProperty("--c", colorFor(name));
    const field = document.createElement("input");
    field.type = "text";
    field.value = name;
    field.maxLength = 80;
    field.addEventListener("change", () => {
      draftNames[index] = field.value;
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-ghost tiny";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      draftNames = readPreview().filter((_, itemIndex) => itemIndex !== index);
      renderPreview();
    });
    item.append(field, remove);
    previewList.append(item);
  });
  must<HTMLButtonElement>("use-btn").disabled = draftNames.length === 0;
  must<HTMLButtonElement>("add-btn").disabled = draftNames.length === 0 || !hasPeople(store.data);
}

function readPreview(): string[] {
  return [...previewList.querySelectorAll("input")].map((field) => field.value);
}

async function acceptPreview(kind: "replace" | "add"): Promise<void> {
  const names = readPreview().map((name) => name.trim()).filter(Boolean);
  if (!names.length) return;
  if (kind === "add") {
    store.commit(addNames(store.data, names));
  } else if (store.data.demo || (store.data.winners.length === 0 && store.data.out.length === 0)) {
    store.commit(replaceHat(store.data, names, true));
  } else {
    const clear = await confirmAction(
      "Start a fresh hat?",
      "Use this list and clear the kids who were already picked. Choose Cancel to keep the picked list and only replace who is still in the hat.",
      "Clear picked names",
    );
    store.commit(replaceHat(store.data, names, clear));
  }
  paste.value = "";
  pasteManage.value = "";
  preview.close();
  phase = "idle";
  ambientOn = false;
  document.body.classList.remove("is-celebrating");
  render();
}

function addTypedName(): void {
  const next = addName(store.data, addNameInput.value);
  if (next === store.data) {
    note("Type a name with at least one letter.");
    return;
  }
  store.commit(next);
  addNameInput.value = "";
  note("");
}

async function savePin(): Promise<void> {
  const next = newPin.value.trim();
  if (next.length < 4) {
    note("Use at least 4 digits.");
    return;
  }
  if (!(await askPin("Enter the current lock code"))) return;
  writePin(next);
  newPin.value = "";
  note("Lock saved on this browser only.");
}

async function clearPin(): Promise<void> {
  if (!readPin()) {
    note("There is no lock on this browser.");
    return;
  }
  if (!(await askPin("Enter the lock code to remove it"))) return;
  writePin(null);
  note("Lock removed.");
}

function renderLists(): void {
  const query = nameFilter.value.trim().toLocaleLowerCase();
  fillPeople(hatList, store.data.names, query, (name, index) => {
    const button = tinyButton("Sit out");
    button.addEventListener("click", () => {
      if (store.data.names[index] !== name) return;
      const next = sitOut(store.data, index);
      if (next !== store.data) store.commit(next);
    });
    return button;
  });
  fillPeople(winnerAdmin, store.data.winners.map((winner) => winner.name), "", (name) => {
    const button = tinyButton("Put back");
    button.addEventListener("click", () => {
      const next = putBack(store.data, name);
      if (next !== store.data) store.commit(next);
    });
    return button;
  }, store.data.winners.map((winner) => formatWhen(winner.at)));
  fillPeople(outList, store.data.out, "", (name) => {
    const button = tinyButton("Put back");
    button.addEventListener("click", () => {
      const next = putBack(store.data, name);
      if (next !== store.data) store.commit(next);
    });
    return button;
  });
}

function renderPicked(): void {
  pickedWrap.hidden = store.data.winners.length === 0;
  pickedList.replaceChildren();
  for (const winner of store.data.winners) {
    const item = document.createElement("li");
    item.className = "chip";
    item.style.setProperty("--c", colorFor(winner.name));
    item.textContent = winner.name;
    pickedList.append(item);
  }
}

function showAmbient(): void {
  const pool = store.data.names;
  if (!pool.length) return;
  ambientIndex = (ambientIndex + 1) % pool.length;
  paintHero(pool[ambientIndex] ?? pool[0], "soft");
  paintFloaters(pool);
}

function paintHero(name: string, mode: "soft" | "fast" | "slow" | "final"): void {
  hero.textContent = name;
  const fit = name.length > 26 ? "0.52" : name.length > 18 ? "0.74" : "1";
  hero.style.setProperty("--fit", fit);
  hero.style.setProperty("--glow", colorFor(name));
  hero.classList.remove("soft", "fast", "slow", "final");
  if (mode !== "fast") void hero.offsetWidth;
  hero.classList.add(mode);
}

function paintFloaters(pool: string[], offset = floaterOffset): void {
  if (!pool.length) return;
  floaterOffset = offset + 1;
  floaterEls.forEach((item, index) => {
    const name = pool[(index + floaterOffset) % pool.length] ?? "";
    item.textContent = name;
    item.style.color = colorFor(name);
  });
}

function ensureIdle(): void {
  if (ambientTimer) return;
  ambientTimer = window.setInterval(() => {
    if (phase === "idle") showAmbient();
  }, 1500);
}

function stopIdle(): void {
  if (!ambientTimer) return;
  window.clearInterval(ambientTimer);
  ambientTimer = 0;
}

function popFlash(): void {
  flash.hidden = false;
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");
}

async function openManage(): Promise<void> {
  if (!(await askPin("Enter the lock code to change names"))) return;
  manage.showModal();
  render();
}

function onKey(event: KeyboardEvent): void {
  if (isTyping(event.target) || manage.open || preview.open || pinDialog.open || confirmDialog.open) return;
  const key = event.key.toLowerCase();
  if (key === "d") {
    event.preventDefault();
    void spin("real");
  } else if (key === "t") {
    event.preventDefault();
    void spin("test");
  } else if (key === "m") {
    audio.toggle();
    render();
  } else if (key === "f") {
    void toggleFull();
  }
}

async function toggleFull(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    note("Full screen was blocked by the browser.");
    if (!manage.open) void openManage();
  }
}

function downloadNames(): void {
  downloadBlob(new Blob([`${store.data.names.join("\n")}\n`], { type: "text/plain" }), "raffle-names.txt");
}

function saveCopy(): void {
  if (!hasPeople(store.data)) {
    note("Add names before saving a copy.");
    return;
  }
  downloadBlob(new Blob([raffleFile(store.data)], { type: "application/json" }), "bems-raffle.json");
  note("Saved bems-raffle.json. On the other computer, open BEMS Raffle and drop that file in.");
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function askPin(purpose: string): Promise<boolean> {
  const expected = readPin();
  if (!expected) return Promise.resolve(true);
  if (pinDialog.open) return Promise.resolve(false);
  return new Promise((resolve) => {
    const okBtn = must<HTMLButtonElement>("pin-ok");
    const cancelBtn = must<HTMLButtonElement>("pin-cancel");
    pinTitle.textContent = purpose;
    pinInput.value = "";
    pinError.hidden = true;
    const finish = (ok: boolean) => {
      okBtn.removeEventListener("click", submit);
      cancelBtn.removeEventListener("click", cancel);
      pinInput.removeEventListener("keydown", onEnter);
      pinDialog.removeEventListener("cancel", onCancel);
      pinDialog.close();
      resolve(ok);
    };
    const submit = () => {
      if (pinInput.value === expected) finish(true);
      else pinError.hidden = false;
    };
    const cancel = () => finish(false);
    const onCancel = (event: Event) => {
      event.preventDefault();
      cancel();
    };
    const onEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submit();
    };
    okBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", cancel);
    pinDialog.addEventListener("cancel", onCancel);
    pinInput.addEventListener("keydown", onEnter);
    pinDialog.showModal();
    pinInput.focus();
  });
}

function confirmAction(title: string, body: string, yes: string): Promise<boolean> {
  if (confirmDialog.open) return Promise.resolve(false);
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmYes.textContent = yes;
    confirmDialog.showModal();
    const finish = (ok: boolean) => {
      confirmDialog.close();
      resolve(ok);
    };
    confirmYes.addEventListener("click", () => finish(true), { once: true });
    must<HTMLButtonElement>("confirm-no").addEventListener("click", () => finish(false), { once: true });
    confirmDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    }, { once: true });
  });
}

function fillPeople(
  list: HTMLElement,
  names: string[],
  query: string,
  action: (name: string, index: number) => HTMLButtonElement,
  extras: string[] = [],
): void {
  list.replaceChildren();
  let shown = 0;
  names.forEach((name, index) => {
    if (query && !name.toLocaleLowerCase().includes(query)) return;
    shown++;
    const item = document.createElement("li");
    item.className = "person";
    item.style.setProperty("--c", colorFor(name));
    const label = document.createElement("span");
    label.textContent = extras[index] ? `${name} · ${extras[index]}` : name;
    item.append(label, action(name, index));
    list.append(item);
  });
  if (!shown) {
    const item = document.createElement("li");
    item.className = "hint";
    item.textContent = "No one here.";
    list.append(item);
  }
}

function tinyButton(text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost tiny";
  button.textContent = text;
  return button;
}

function paintStars(): void {
  const field = must<HTMLElement>("starfield");
  for (let i = 0; i < 70; i++) {
    const star = document.createElement("span");
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 4}s`;
    const size = Math.random() > 0.85 ? 3 : 2;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    field.append(star);
  }
}

function paintBulbs(): void {
  const bulbs = must<HTMLElement>("bulbs");
  for (let i = 0; i < 28; i++) {
    const bulb = document.createElement("span");
    bulb.className = "bulb";
    bulb.style.setProperty("--c", PARTY_COLORS[i % PARTY_COLORS.length]);
    bulb.style.animationDelay = `${(i * 0.12) % 1.2}s`;
    bulbs.append(bulb);
  }
}

function countLabel(left: number, picked: number): string {
  const remaining = left === 1 ? "1 name in the hat" : `${left} names in the hat`;
  if (!picked) return remaining;
  const done = picked === 1 ? "1 already picked" : `${picked} already picked`;
  return `${remaining} · ${done}`;
}

function formatWhen(at: number): string {
  if (!at) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(at);
}

function note(message: string): void {
  setupNote.textContent = message;
}

function readPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

function writePin(value: string | null): void {
  try {
    if (value) localStorage.setItem(PIN_KEY, value);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    note("This browser blocked saving the lock.");
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}
